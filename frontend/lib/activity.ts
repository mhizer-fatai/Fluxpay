import { formatUnits, parseAbiItem, type Address, type Hash } from 'viem'
import { FLUXPAY_ADDRESS, LINK_ESCROW_ADDRESS, REGISTRY_ADDRESS, STREAM_VAULT_ADDRESS, TOKENS, publicClient, tokenByAddress, type TokenKey } from '@/lib/chain'
import { api } from '@/lib/api'

export type ActivityCategory = 'Payment' | 'Transfer' | 'Stream' | 'Payment Link' | 'Swap' | 'Account'

export interface ActivityItem {
  hash: Hash
  blockNumber: bigint
  ts: number // unix seconds
  kind: 'sent' | 'received'
  category: ActivityCategory
  token: TokenKey | null
  tokenAddress: string | null
  amount: number
  decimals: number
  counterparty: string
  event: string
}

const WMON = TOKENS.find(t => t.key === 'WMON')?.address as Address | undefined

// ============ Cache layer ============
// Backend feed is the primary source (complete since watcher start). RPC top-up scans
// cover gaps. Results cached per address with a TTL; in-flight scans deduped.
// Block timestamps are immutable → cached forever.

const ACTIVITY_TTL_MS = 60_000
const PERSIST_TTL_MS = 10 * 60_000
const activityCache = new Map<string, { at: number; items: ActivityItem[] }>()
const inflight = new Map<string, Promise<ActivityItem[]>>()
const blockTsCache = new Map<bigint, number>()

function persistKey(address: string): string {
  return `fluxpay_activity:${address.toLowerCase()}`
}

function serialize(items: ActivityItem[]): string {
  return JSON.stringify(items, (_k, v) => (typeof v === 'bigint' ? `bigint:${v.toString()}` : v))
}

function deserialize(raw: string): ActivityItem[] | null {
  try {
    const arr = JSON.parse(raw, (_k, v) =>
      typeof v === 'string' && v.startsWith('bigint:') ? BigInt(v.slice(7)) : v,
    ) as ActivityItem[]
    return Array.isArray(arr) ? arr : null
  } catch {
    return null
  }
}

/** Last-known activity from disk (any freshness within TTL) — instant first paint. */
export function peekActivity(address: string): ActivityItem[] | null {
  try {
    const raw = localStorage.getItem(persistKey(address))
    if (!raw) return null
    const wrap = JSON.parse(raw) as { at: number; items: string }
    if (Date.now() - wrap.at > PERSIST_TTL_MS) return null
    return deserialize(wrap.items)
  } catch {
    return null
  }
}

function persistActivity(address: string, items: ActivityItem[]): void {
  try {
    localStorage.setItem(persistKey(address), JSON.stringify({ at: Date.now(), items: serialize(items) }))
  } catch { /* storage full/blocked — memory cache still works */ }
}

export function bustActivityCache(address: string): void {
  const prefix = address.toLowerCase()
  for (const key of [...activityCache.keys()]) {
    if (key.startsWith(prefix)) activityCache.delete(key)
  }
}

// ============ Backend feed ============

interface BackendEvent {
  type: string
  txHash: string | null
  blockNumber: string | null
  timestamp: string
  actor: string
  payload: Record<string, unknown>
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0))

async function fetchBackendActivity(address: string): Promise<ActivityItem[]> {
  const addr = address.toLowerCase()
  let rows: BackendEvent[] = []
  try {
    rows = await api<BackendEvent[]>(`/api/v1/activity?address=${addr}&limit=100`)
  } catch {
    return []
  }
  const items: ActivityItem[] = []
  for (const r of rows) {
    const p = r.payload
    const ts = Math.floor(new Date(r.timestamp).getTime() / 1000) || 0
    const blockNumber = r.blockNumber ? BigInt(r.blockNumber) : 0n
    const hash = (r.txHash ?? '') as Hash
    const base = { hash, blockNumber, ts, decimals: 18, tokenAddress: null as string | null, token: null as TokenKey | null, counterparty: '', amount: 0, kind: 'received' as const, event: r.type, category: 'Transfer' as ActivityCategory }
    switch (r.type) {
      case 'payment_settled': {
        const to = String(p.to ?? '').toLowerCase()
        const kind = to === addr ? 'received' : 'sent'
        items.push({ ...base, kind, category: 'Payment', token: (p.tokenLabel as TokenKey) ?? null, tokenAddress: (p.token as string) ?? null, amount: num(p.amount), decimals: (p.tokenLabel as string) === 'USDC' || (p.tokenLabel as string) === 'AUSD' ? 6 : 18, counterparty: kind === 'received' ? String(p.from ?? '') : String(p.to ?? ''), event: 'PaymentSettled' })
        break
      }
      case 'batch_settled':
        items.push({ ...base, kind: 'sent', category: 'Payment', token: (p.tokenLabel as TokenKey) ?? null, tokenAddress: (p.token as string) ?? null, amount: num(p.amount), counterparty: `${p.count ?? '?'} recipients`, event: 'BatchSettled' })
        break
      case 'username_registered':
        items.push({ ...base, kind: 'received', category: 'Account', counterparty: `@${String(p.username ?? '')}`, event: 'UsernameRegistered' })
        break
      case 'stream_opened': {
        const isOwner = String(p.owner ?? '').toLowerCase() === addr
        items.push({ ...base, kind: isOwner ? 'sent' : 'received', category: 'Stream', token: (p.tokenLabel as TokenKey) ?? null, tokenAddress: (p.token as string) ?? null, counterparty: isOwner ? String(p.recipient ?? '') : String(p.owner ?? ''), event: 'StreamOpened' })
        break
      }
      case 'stream_withdrawn': {
        const mine = String(p.recipient ?? '').toLowerCase() === addr
        items.push({ ...base, kind: mine ? 'received' : 'sent', category: 'Stream', token: (p.tokenLabel as TokenKey) ?? null, tokenAddress: (p.token as string) ?? null, amount: num(p.amount), counterparty: mine ? 'stream' : String(p.recipient ?? ''), event: 'StreamWithdrawn' })
        break
      }
      case 'stream_topup':
        items.push({ ...base, kind: 'sent', category: 'Stream', token: (p.tokenLabel as TokenKey) ?? null, tokenAddress: (p.token as string) ?? null, amount: num(p.amount), event: 'StreamTopUp' })
        break
      case 'stream_cancelled': {
        const isRecipient = String(p.recipient ?? '').toLowerCase() === addr
        items.push({ ...base, kind: 'received', category: 'Stream', token: (p.tokenLabel as TokenKey) ?? null, tokenAddress: (p.token as string) ?? null, amount: num(isRecipient ? p.paidOut : p.refunded), counterparty: isRecipient ? 'stream' : String(p.recipient ?? ''), event: 'StreamCancelled' })
        break
      }
      case 'stream_paused':
      case 'stream_resumed':
        items.push({ ...base, kind: 'received', category: 'Stream', event: r.type === 'stream_paused' ? 'StreamPaused' : 'StreamResumed' })
        break
      case 'link_created':
        items.push({ ...base, kind: 'sent', category: 'Payment Link', token: (p.tokenLabel as TokenKey) ?? null, tokenAddress: (p.token as string) ?? null, amount: num(p.amount), counterparty: 'escrow', event: 'LinkCreated' })
        break
      case 'link_claimed':
        items.push({ ...base, kind: 'received', category: 'Payment Link', token: (p.tokenLabel as TokenKey) ?? null, tokenAddress: (p.token as string) ?? null, amount: num(p.amount), counterparty: String(p.claimer ?? ''), event: 'LinkClaimed' })
        break
      case 'link_refunded':
        items.push({ ...base, kind: 'received', category: 'Payment Link', token: (p.tokenLabel as TokenKey) ?? null, amount: num(p.amount), event: 'LinkRefunded' })
        break
      case 'wrap':
        items.push({ ...base, kind: 'sent', category: 'Swap', token: 'MON', amount: num(p.amount), counterparty: 'WMON', event: 'Wrap' })
        break
      case 'unwrap':
        items.push({ ...base, kind: 'received', category: 'Swap', token: 'MON', amount: num(p.amount), counterparty: 'WMON', event: 'Unwrap' })
        break
      default:
        break
    }
  }
  return items
}

// ============ RPC top-up scan (small windows only — RPC caps getLogs at 100 blocks) ============

const CHUNK_SIZE = 90n
const PARALLEL_CHUNKS = 3

const paymentSettledEvent = parseAbiItem('event PaymentSettled(address indexed from, address indexed to, uint256 amount, address indexed token)')
const batchSettledEvent = parseAbiItem('event BatchSettled(address indexed from, uint256 total, uint256 count, address indexed token)')
const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
const depositEvent = parseAbiItem('event Deposit(address indexed dst, uint256 wad)')
const withdrawalEvent = parseAbiItem('event Withdrawal(address indexed src, uint256 wad)')
const usernameRegisteredEvent = parseAbiItem('event UsernameRegistered(bytes32 indexed usernameHash, address indexed owner, string username)')
const linkCreatedEvent = parseAbiItem('event LinkCreated(bytes32 indexed linkId, address indexed depositor, address indexed token, uint256 amount, uint40 expiry)')
const linkClaimedEvent = parseAbiItem('event LinkClaimed(bytes32 indexed linkId, address indexed claimer, address indexed token, uint256 amount)')
const linkRefundedEvent = parseAbiItem('event LinkRefunded(bytes32 indexed linkId, address indexed depositor, uint256 amount)')
const streamOpenedEvent = parseAbiItem('event StreamOpened(uint256 indexed id, address indexed owner, address indexed recipient, address token, uint96 ratePerSecondX18)')

async function scanJob(promise: Promise<ActivityItem[]>): Promise<ActivityItem[]> {
  try {
    return await promise
  } catch {
    return []
  }
}

type LogLike = { transactionHash: Hash; blockNumber: bigint; args: Record<string, unknown> }

function item(log: LogLike, partial: Partial<ActivityItem> & { kind: ActivityItem['kind'] }): ActivityItem {
  return {
    hash: log.transactionHash, blockNumber: log.blockNumber, ts: 0,
    category: 'Transfer', token: null, tokenAddress: null, amount: 0, decimals: 18,
    counterparty: '', event: 'Transfer', ...partial,
  }
}

async function scanChunk(addr: Address, fromBlock: bigint, toBlock: bigint, tokens: Address[]): Promise<ActivityItem[]> {
  const jobs: Array<Promise<ActivityItem[]>> = []
  const range = { fromBlock, toBlock }

  for (const direction of ['from', 'to'] as const) {
    jobs.push(scanJob(
      publicClient.getLogs({ address: FLUXPAY_ADDRESS, event: paymentSettledEvent, args: { [direction]: addr }, ...range })
        .then(logs => (logs as unknown as LogLike[]).map(log => {
          const { from, to, amount, token } = log.args as unknown as { from: Address; to: Address; amount: bigint; token: Address }
          const meta = tokenByAddress(token)
          return item(log, { kind: direction === 'from' ? 'sent' : 'received', category: 'Payment', token: meta?.key ?? null, tokenAddress: token, amount: Number(formatUnits(amount, meta?.decimals ?? 18)), decimals: meta?.decimals ?? 18, counterparty: direction === 'from' ? to : from, event: 'PaymentSettled' })
        })),
    ))
  }
  jobs.push(scanJob(
    publicClient.getLogs({ address: FLUXPAY_ADDRESS, event: batchSettledEvent, args: { from: addr }, ...range })
      .then(logs => (logs as unknown as LogLike[]).map(log => {
        const { total, token } = log.args as unknown as { total: bigint; token: Address }
        const meta = tokenByAddress(token)
        return item(log, { kind: 'sent', category: 'Payment', token: meta?.key ?? null, tokenAddress: token, amount: Number(formatUnits(total, meta?.decimals ?? 18)), decimals: meta?.decimals ?? 18, counterparty: 'batch', event: 'BatchSettled' })
      })),
  ))

  for (const token of tokens) {
    const meta = tokenByAddress(token)
    if (!meta) continue
    for (const direction of ['from', 'to'] as const) {
      jobs.push(scanJob(
        publicClient.getLogs({ address: token, event: transferEvent, args: { [direction]: addr }, ...range })
          .then(logs => (logs as unknown as LogLike[]).map(log => {
            const { from, to, value } = log.args as unknown as { from: Address; to: Address; value: bigint }
            return item(log, { kind: direction === 'from' ? 'sent' : 'received', category: 'Transfer', token: meta.key, tokenAddress: token, amount: Number(formatUnits(value, meta.decimals)), decimals: meta.decimals, counterparty: direction === 'from' ? to : from, event: 'Transfer' })
          })),
      ))
    }
  }

  if (WMON) {
    for (const [event, key, cp] of [[depositEvent, 'dst', 'WMON'], [withdrawalEvent, 'src', 'WMON']] as const) {
      jobs.push(scanJob(
        publicClient.getLogs({ address: WMON, event, args: { [key]: addr }, ...range })
          .then(logs => (logs as unknown as LogLike[]).map(log => {
            const { wad } = log.args as unknown as { wad: bigint }
            const isWrap = event === depositEvent
            return item(log, { kind: isWrap ? 'sent' : 'received', category: 'Swap', token: 'MON', tokenAddress: WMON, amount: Number(formatUnits(wad, 18)), decimals: 18, counterparty: cp, event: isWrap ? 'Wrap' : 'Unwrap' })
          })),
      ))
    }
  }

  jobs.push(scanJob(
    publicClient.getLogs({ address: REGISTRY_ADDRESS, event: usernameRegisteredEvent, args: { owner: addr }, ...range })
      .then(logs => (logs as unknown as LogLike[]).map(log => {
        const { username } = log.args as unknown as { username: string }
        return item(log, { kind: 'received', category: 'Account', counterparty: `@${username}`, event: 'UsernameRegistered' })
      })),
  ))

  if (LINK_ESCROW_ADDRESS) {
    const linkJobs: Array<{ event: typeof linkCreatedEvent | typeof linkClaimedEvent | typeof linkRefundedEvent; key: string; kind: 'sent' | 'received'; label: string }> = [
      { event: linkCreatedEvent, key: 'depositor', kind: 'sent', label: 'LinkCreated' },
      { event: linkClaimedEvent, key: 'claimer', kind: 'received', label: 'LinkClaimed' },
      { event: linkRefundedEvent, key: 'depositor', kind: 'received', label: 'LinkRefunded' },
    ]
    for (const { event, key, kind, label } of linkJobs) {
      jobs.push(scanJob(
        publicClient.getLogs({ address: LINK_ESCROW_ADDRESS, event, args: { [key]: addr }, ...range })
          .then(logs => (logs as unknown as LogLike[]).map(log => {
            const { token, amount } = log.args as unknown as { token?: Address; amount: bigint }
            const meta = token ? tokenByAddress(token) : undefined
            return item(log, { kind, category: 'Payment Link', token: meta?.key ?? null, tokenAddress: token ?? null, amount: token ? Number(formatUnits(amount, meta?.decimals ?? 18)) : Number(amount), decimals: meta?.decimals ?? 18, counterparty: 'escrow', event: label })
          })),
      ))
    }
  }

  if (STREAM_VAULT_ADDRESS) {
    for (const direction of ['owner', 'recipient'] as const) {
      jobs.push(scanJob(
        publicClient.getLogs({ address: STREAM_VAULT_ADDRESS, event: streamOpenedEvent, args: { [direction]: addr }, ...range })
          .then(logs => (logs as unknown as LogLike[]).map(log => {
            const { owner, recipient, token } = log.args as unknown as { owner: Address; recipient: Address; token: Address }
            const meta = tokenByAddress(token)
            const isOwner = direction === 'owner'
            return item(log, { kind: isOwner ? 'sent' : 'received', category: 'Stream', token: meta?.key ?? null, tokenAddress: token, amount: 0, decimals: meta?.decimals ?? 18, counterparty: isOwner ? recipient : owner, event: 'StreamOpened' })
          })),
      ))
    }
  }

  const settled = await Promise.all(jobs)
  return settled.flat()
}

async function scanRpc(address: string, lookback: number, tokens: Address[]): Promise<ActivityItem[]> {
  const addr = address.toLowerCase() as Address
  const latest = await publicClient.getBlockNumber()
  const fromBlock = latest > BigInt(lookback) ? latest - BigInt(lookback) : 0n

  const chunks: Array<[bigint, bigint]> = []
  for (let start = fromBlock; start <= latest; start += CHUNK_SIZE) {
    const end = start + CHUNK_SIZE - 1n > latest ? latest : start + CHUNK_SIZE - 1n
    chunks.push([start, end])
  }

  const items: ActivityItem[] = []
  for (let i = 0; i < chunks.length; i += PARALLEL_CHUNKS) {
    const batch = chunks.slice(i, i + PARALLEL_CHUNKS)
    const settled = await Promise.all(batch.map(([f, t]) => scanJob(scanChunk(addr, f, t, tokens))))
    items.push(...settled.flat())
  }

  const missing = [...new Set(items.filter(it => it.ts === 0).map(it => it.blockNumber))].filter(b => !blockTsCache.has(b))
  await Promise.all(
    missing.map(async b => {
      try {
        const block = await publicClient.getBlock({ blockNumber: b })
        blockTsCache.set(b, Number(block.timestamp))
      } catch { /* leave 0 */ }
    }),
  )
  for (const it of items) it.ts = blockTsCache.get(it.blockNumber) ?? 0
  return items
}

/**
 * Full activity: backend feed (primary, complete since watcher start) merged with a
 * small RPC top-up scan (covers gaps + pre-watcher history). Cached with TTL.
 */
export async function fetchActivity(
  address: string,
  lookback = 600,
  opts?: { force?: boolean; tokenKeys?: TokenKey[] },
): Promise<ActivityItem[]> {
  const key = `${address.toLowerCase()}:${lookback}:${opts?.tokenKeys?.join(',') ?? 'all'}`
  const cached = activityCache.get(key)
  if (!opts?.force && cached && Date.now() - cached.at < ACTIVITY_TTL_MS) return cached.items
  if (!opts?.force) {
    const existing = inflight.get(key)
    if (existing) return existing
  }
  if (opts?.force) bustActivityCache(address)

  const tokens = (opts?.tokenKeys ?? TOKENS.filter(t => t.address).map(t => t.key))
    .map(k => TOKENS.find(t => t.key === k)?.address as Address | undefined)
    .filter((a): a is Address => Boolean(a))

  const p = (async () => {
    // Backend first (fast, <1s): never let the slow RPC scan hold the paint hostage.
    const backendItems = await fetchBackendActivity(address)
    const rpcItems = await Promise.race([
      scanRpc(address, lookback, tokens).catch((): ActivityItem[] => []),
      new Promise<ActivityItem[]>(resolve => setTimeout(() => resolve([]), 12_000)),
    ])
    const seen = new Set<string>()
    const merged: ActivityItem[] = []
    for (const it of [...backendItems, ...rpcItems]) {
      const k = `${it.hash}:${it.event}:${it.counterparty}:${it.amount}`
      if (seen.has(k)) continue
      seen.add(k)
      merged.push(it)
    }
    merged.sort((a, b) => {
      if (a.ts !== b.ts) return b.ts - a.ts
      return a.blockNumber === b.blockNumber ? 0 : a.blockNumber < b.blockNumber ? 1 : -1
    })
    return merged
  })()
    .then(items => {
      activityCache.set(key, { at: Date.now(), items })
      persistActivity(address, items)
      return items
    })
    .finally(() => inflight.delete(key))

  if (!opts?.force) inflight.set(key, p)
  return p
}

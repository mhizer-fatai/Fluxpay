import { formatUnits, parseAbiItem, type Address, type Hash } from 'viem'
import { FLUXPAY_ADDRESS, TOKENS, publicClient, tokenByAddress, type TokenKey } from '@/lib/chain'

export interface ActivityItem {
  hash: Hash
  blockNumber: bigint
  ts: number // unix seconds
  kind: 'sent' | 'received'
  token: TokenKey | null
  tokenAddress: string | null
  amount: number
  decimals: number
  counterparty: string
  event: string
}

const paymentSettledEvent = parseAbiItem('event PaymentSettled(address indexed from, address indexed to, uint256 amount, address indexed token)')
const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

const erc20Addresses = TOKENS.filter(t => t.address).map(t => t.address as Address)

// ============ Cache layer ============
// Activity is cached per address+range with a TTL so page switches don't re-hit the RPC.
// Block timestamps are immutable → cached forever. In-flight scans are deduped.

const ACTIVITY_TTL_MS = 60_000
const activityCache = new Map<string, { at: number; items: ActivityItem[] }>()
const inflight = new Map<string, Promise<ActivityItem[]>>()
const blockTsCache = new Map<bigint, number>()

export function peekCachedActivity(address: string): ActivityItem[] | null {
  for (const [key, entry] of activityCache) {
    if (key.startsWith(address.toLowerCase()) && Date.now() - entry.at < ACTIVITY_TTL_MS) return entry.items
  }
  return null
}

export function bustActivityCache(address: string): void {
  const prefix = address.toLowerCase()
  for (const key of [...activityCache.keys()]) {
    if (key.startsWith(prefix)) activityCache.delete(key)
  }
}

// ============ Scan implementation ============

const CHUNK_SIZE = 5_000n
const PARALLEL_CHUNKS = 2

async function scanJob(promise: Promise<ActivityItem[]>): Promise<ActivityItem[]> {
  // Public RPCs reject oversized/expensive queries (413, timeouts) — one failing
  // job only drops its own slice, never the whole scan.
  try {
    return await promise
  } catch {
    return []
  }
}

async function scanChunk(addr: Address, fromBlock: bigint, toBlock: bigint): Promise<ActivityItem[]> {
  type LogLike = { transactionHash: Hash; blockNumber: bigint; args: Record<string, unknown> }

  const buildItem = (
    log: LogLike,
    kind: 'sent' | 'received',
    counterparty: Address,
    token: TokenKey | null,
    tokenAddress: string | null,
    amountRaw: bigint,
    decimals: number,
    event: string,
  ): ActivityItem => ({
    hash: log.transactionHash,
    blockNumber: log.blockNumber,
    ts: 0,
    kind,
    token,
    tokenAddress,
    amount: Number(formatUnits(amountRaw, decimals)),
    decimals,
    counterparty,
    event,
  })

  const jobs: Array<Promise<ActivityItem[]>> = []

  // FluxPay settlements
  for (const direction of ['from', 'to'] as const) {
    jobs.push(scanJob(
      publicClient
        .getLogs({ address: FLUXPAY_ADDRESS, event: paymentSettledEvent, args: { [direction]: addr }, fromBlock, toBlock })
        .then(logs =>
          (logs as unknown as LogLike[]).map(log => {
            const { from, to, amount, token } = log.args as unknown as { from: Address; to: Address; amount: bigint; token: Address }
            const meta = tokenByAddress(token)
            return buildItem(log, direction === 'from' ? 'sent' : 'received', direction === 'from' ? to : from, meta?.key ?? null, token, amount, meta?.decimals ?? 18, 'PaymentSettled')
          }),
        ),
    ))
  }

  // ERC-20 transfers for tracked tokens
  for (const token of erc20Addresses) {
    const meta = tokenByAddress(token)!
    for (const direction of ['from', 'to'] as const) {
      jobs.push(scanJob(
        publicClient
          .getLogs({ address: token, event: transferEvent, args: { [direction]: addr }, fromBlock, toBlock })
          .then(logs =>
            (logs as unknown as LogLike[]).map(log => {
              const { from, to, value } = log.args as unknown as { from: Address; to: Address; value: bigint }
              return buildItem(log, direction === 'from' ? 'sent' : 'received', direction === 'from' ? to : from, meta.key, token, value, meta.decimals, 'Transfer')
            }),
          ),
      ))
    }
  }

  const settled = await Promise.all(jobs)
  return settled.flat()
}

/**
 * Scans the most recent `lookback` blocks in bounded chunks. Failing chunks are
 * skipped instead of failing the whole scan (public RPC 413s on big ranges).
 */
async function scan(address: string, lookback: number): Promise<ActivityItem[]> {
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
    const settled = await Promise.all(batch.map(([f, t]) => scanJob(scanChunk(addr, f, t))))
    items.push(...settled.flat())
  }

  // Attach timestamps for unique blocks (immutable — cached forever)
  const missing = [...new Set(items.filter(i => i.ts === 0).map(i => i.blockNumber))].filter(b => !blockTsCache.has(b))
  await Promise.all(
    missing.map(async b => {
      try {
        const block = await publicClient.getBlock({ blockNumber: b })
        blockTsCache.set(b, Number(block.timestamp))
      } catch { /* leave 0 */ }
    }),
  )
  for (const item of items) item.ts = blockTsCache.get(item.blockNumber) ?? 0

  items.sort((a, b) => (a.blockNumber === b.blockNumber ? 0 : a.blockNumber < b.blockNumber ? 1 : -1))
  return items
}

/** Cached, chunked on-chain activity for an address. `force` bypasses the TTL. */
export async function fetchActivity(address: string, lookback = 20_000, opts?: { force?: boolean }): Promise<ActivityItem[]> {
  const key = `${address.toLowerCase()}:${lookback}`
  const cached = activityCache.get(key)
  if (!opts?.force && cached && Date.now() - cached.at < ACTIVITY_TTL_MS) return cached.items
  if (!opts?.force) {
    const existing = inflight.get(key)
    if (existing) return existing
  }
  if (opts?.force) bustActivityCache(address)

  const p = scan(address, lookback)
    .then(items => {
      activityCache.set(key, { at: Date.now(), items })
      return items
    })
    .finally(() => inflight.delete(key))

  if (!opts?.force) inflight.set(key, p)
  return p
}

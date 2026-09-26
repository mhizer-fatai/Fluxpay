import { formatUnits, getContract, type Address } from 'viem'
import { STREAM_VAULT_ADDRESS, publicClient, streamVaultAbi, tokenByAddress } from '@/lib/chain'
import { bustRpcCache, cachedRpc } from '@/lib/rpc'

export interface StreamRow {
  id: bigint
  owner: string
  recipient: string
  token: string | null
  tokenAddress: Address
  tokenDecimals: number
  /** raw token units per second (unscaled) */
  rateRawPerSecond: number
  /** human units per month */
  monthly: number
  deposited: number
  withdrawable: number
  paused: boolean
  cancelled: boolean
  createdAt: number
  role: 'owner' | 'recipient'
}

const SECONDS_PER_MONTH = 2_592_000

/** Lists StreamVault streams where `address` is the owner or recipient (cached 30s). */
export async function listStreams(address: string, maxScan = 20, opts?: { force?: boolean }): Promise<StreamRow[]> {
  const addr = address.toLowerCase()
  if (opts?.force) bustRpcCache(`streams:${addr}`)
  return cachedRpc<StreamRow[]>(`streams:${addr}:${maxScan}`, 30_000, async () => {
  const vault = getContract({ address: STREAM_VAULT_ADDRESS, abi: streamVaultAbi, client: publicClient })
  const nextId = (await vault.read.nextStreamId()) as bigint
  if (nextId === 0n) return []
  const start = nextId > BigInt(maxScan) ? nextId - BigInt(maxScan) : 1n
  const ids: bigint[] = []
  for (let i = start; i < nextId; i++) ids.push(i)

  const rows = await Promise.all(
    ids.map(async id => {
      const s = (await vault.read.streams([id])) as readonly [Address, Address, Address, bigint, bigint, bigint, bigint, bigint, bigint, boolean]
      const [owner, recipient, token, ratePerSecondX18, createdAt, pausedAt, , deposited, , cancelled] = s
      const role = owner.toLowerCase() === addr ? ('owner' as const) : recipient.toLowerCase() === addr ? ('recipient' as const) : null
      if (!role) return null
      const meta = tokenByAddress(token)
      const decimals = meta?.decimals ?? 18
      let withdrawable = 0
      if (!cancelled) {
        try {
          const w = (await vault.read.withdrawable([id])) as readonly [bigint, bigint]
          withdrawable = Number(formatUnits(w[0], decimals)) + Number(w[1]) / 1e18 / 10 ** decimals
        } catch { /* ignore */ }
      }
      const rateRawPerSecond = Number(ratePerSecondX18) / 1e18
      return {
        id,
        owner,
        recipient,
        token: meta?.key ?? null,
        tokenAddress: token,
        tokenDecimals: decimals,
        rateRawPerSecond,
        monthly: (rateRawPerSecond * SECONDS_PER_MONTH) / 10 ** decimals,
        deposited: Number(formatUnits(deposited, decimals)),
        withdrawable,
        paused: pausedAt > 0n,
        cancelled,
        createdAt: Number(createdAt),
        role,
      } as StreamRow
    }),
  )
  return rows.filter((r): r is StreamRow => r !== null).reverse()
  })
}

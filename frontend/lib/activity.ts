import { formatUnits, getContract, parseAbiItem, type Address, type Hash } from 'viem'
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

/**
 * Real on-chain activity for an address: FluxPay settlements + ERC-20 transfers.
 * Scans the most recent `lookback` blocks with indexed-topic filters.
 */
export async function fetchActivity(address: string, lookback = 100_000): Promise<ActivityItem[]> {
  const addr = address.toLowerCase() as Address
  const latest = await publicClient.getBlockNumber()
  const fromBlock = latest > BigInt(lookback) ? latest - BigInt(lookback) : 0n

  const jobs: Array<Promise<ActivityItem[]>> = []

  // FluxPay settle events
  for (const direction of ['from', 'to'] as const) {
    jobs.push(
      publicClient
        .getLogs({
          address: FLUXPAY_ADDRESS,
          event: paymentSettledEvent,
          args: { [direction]: addr },
          fromBlock,
          toBlock: 'latest',
        })
        .then(logs =>
          logs.map(log => {
            const { from, to, amount, token } = log.args as { from: Address; to: Address; amount: bigint; token: Address }
            const meta = tokenByAddress(token)
            return {
              hash: log.transactionHash,
              blockNumber: log.blockNumber,
              ts: 0,
              kind: direction === 'from' ? ('sent' as const) : ('received' as const),
              token: meta?.key ?? null,
              tokenAddress: token,
              amount: Number(formatUnits(amount, meta?.decimals ?? 18)),
              decimals: meta?.decimals ?? 18,
              counterparty: direction === 'from' ? to : from,
              event: 'PaymentSettled',
            }
          }),
        ),
    )
  }

  // ERC-20 transfers for tracked tokens
  for (const token of erc20Addresses) {
    const meta = tokenByAddress(token)!
    for (const direction of ['from', 'to'] as const) {
      jobs.push(
        publicClient
          .getLogs({ address: token, event: transferEvent, args: { [direction]: addr }, fromBlock, toBlock: 'latest' })
          .then(logs =>
            logs.map(log => {
              const { from, to, value } = log.args as { from: Address; to: Address; value: bigint }
              return {
                hash: log.transactionHash,
                blockNumber: log.blockNumber,
                ts: 0,
                kind: direction === 'from' ? ('sent' as const) : ('received' as const),
                token: meta.key,
                tokenAddress: token,
                amount: Number(formatUnits(value, meta.decimals)),
                decimals: meta.decimals,
                counterparty: direction === 'from' ? to : from,
                event: 'Transfer',
              }
            }),
          ),
      )
    }
  }

  const settled = await Promise.all(jobs)
  const items = settled.flat()

  // Attach timestamps for unique blocks
  const blocks = [...new Set(items.map(i => i.blockNumber))]
  const tsByBlock = new Map<bigint, number>()
  await Promise.all(
    blocks.map(async b => {
      try {
        const block = await publicClient.getBlock({ blockNumber: b })
        tsByBlock.set(b, Number(block.timestamp))
      } catch { /* leave 0 */ }
    }),
  )
  for (const item of items) item.ts = tsByBlock.get(item.blockNumber) ?? 0

  items.sort((a, b) => (a.blockNumber === b.blockNumber ? 0 : a.blockNumber < b.blockNumber ? 1 : -1))
  return items
}

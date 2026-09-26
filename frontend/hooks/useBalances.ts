import { useCallback, useEffect, useState } from 'react'
import { formatUnits, type Address } from 'viem'
import { TOKENS, erc20Abi, getUsdPrices, publicClient, type TokenKey } from '@/lib/chain'
import { bustRpcCache, cachedRpc } from '@/lib/rpc'

export interface BalanceRow {
  key: TokenKey
  raw: bigint
  amount: number
  usd: number
}

export interface BalancesState {
  rows: BalanceRow[]
  totalUsd: number
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const empty: BalanceRow[] = []

export function useBalances(address: string | null): BalancesState {
  const [rows, setRows] = useState<BalanceRow[]>(empty)
  const [totalUsd, setTotalUsd] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (force = false) => {
    if (!address) return
    if (force) bustRpcCache(`balances:${address.toLowerCase()}`)
    setLoading(true)
    setError(null)
    try {
      const next = await cachedRpc<BalanceRow[]>(`balances:${address.toLowerCase()}`, 30_000, async () => {
        const prices = await getUsdPrices()
        const native = await publicClient.getBalance({ address: address as Address })
        const erc20Tokens = TOKENS.filter(t => t.address)
        const erc20Raw = await Promise.all(
          erc20Tokens.map(t =>
            publicClient.readContract({
              address: t.address as Address,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [address as Address],
            }),
          ),
        )
        const all: Array<{ key: TokenKey; raw: bigint; decimals: number; price: number }> = [
          { key: 'MON', raw: native, decimals: 18, price: prices.MON },
          ...erc20Tokens.map((t, i) => ({ key: t.key, raw: erc20Raw[i] as bigint, decimals: t.decimals, price: prices[t.key] })),
        ]
        return all.map(r => {
          const amount = Number(formatUnits(r.raw, r.decimals))
          return { key: r.key, raw: r.raw, amount, usd: amount * r.price }
        })
      })
      setRows(next)
      setTotalUsd(next.reduce((s, r) => s + r.usd, 0))
    } catch (e) {
      setError((e as Error).message || 'Failed to load balances')
    } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => {
    void load()
  }, [load])

  return { rows, totalUsd, loading, error, refresh: () => load(true) }
}

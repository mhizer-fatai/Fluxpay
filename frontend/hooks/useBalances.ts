import { useCallback, useEffect, useMemo, useState } from 'react'
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
const PERSIST_TTL_MS = 10 * 60_000

interface Persisted {
  at: number
  rows: Array<{ key: TokenKey; raw: string; amount: number; usd: number }>
  totalUsd: number
}

function loadPersisted(cacheKey: string): { rows: BalanceRow[]; totalUsd: number } | null {
  try {
    const raw = localStorage.getItem(`fluxpay_balances:${cacheKey}`)
    if (!raw) return null
    const p = JSON.parse(raw) as Persisted
    if (Date.now() - p.at > PERSIST_TTL_MS) return null
    return {
      rows: p.rows.map(r => ({ ...r, raw: BigInt(r.raw) })),
      totalUsd: p.totalUsd,
    }
  } catch {
    return null
  }
}

/**
 * Balances across one or more addresses (EOA + smart account), merged per token.
 * Shows last-known values instantly from persistent cache while syncing in the
 * background — the UI never sits on zeros waiting for the RPC.
 */
export function useBalances(address: string | Array<string | null> | null): BalancesState {
  const addrs = useMemo(() => {
    const list = (Array.isArray(address) ? address : [address]).filter((a): a is string => Boolean(a))
    return [...new Set(list.map(a => a.toLowerCase()))]
  }, [address])
  const cacheKey = addrs.join(',')

  const [rows, setRows] = useState<BalanceRow[]>(() => loadPersisted(cacheKey)?.rows ?? empty)
  const [totalUsd, setTotalUsd] = useState<number>(() => loadPersisted(cacheKey)?.totalUsd ?? 0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (force = false) => {
    if (addrs.length === 0) return
    if (force) bustRpcCache('balances:')
    // Background sync: keep showing cached values, never blank the UI.
    setLoading(true)
    setError(null)
    try {
      const perAddr = await Promise.all(
        addrs.map(a =>
          cachedRpc<BalanceRow[]>(`balances:${a}`, 30_000, async () => {
            const prices = await getUsdPrices()
            const native = await publicClient.getBalance({ address: a as Address })
            const erc20Tokens = TOKENS.filter(t => t.address)
            const erc20Raw = await Promise.all(
              erc20Tokens.map(t =>
                publicClient.readContract({
                  address: t.address as Address,
                  abi: erc20Abi,
                  functionName: 'balanceOf',
                  args: [a as Address],
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
          }),
        ),
      )
      const merged = new Map<TokenKey, BalanceRow>()
      for (const list of perAddr) {
        for (const r of list) {
          const prev = merged.get(r.key)
          if (!prev) merged.set(r.key, { ...r })
          else {
            prev.raw += r.raw
            prev.amount += r.amount
            prev.usd += r.usd
          }
        }
      }
      const next = [...merged.values()]
      const total = next.reduce((s, r) => s + r.usd, 0)
      setRows(next)
      setTotalUsd(total)
      try {
        const persisted: Persisted = {
          at: Date.now(),
          rows: next.map(r => ({ key: r.key, raw: r.raw.toString(), amount: r.amount, usd: r.usd })),
          totalUsd: total,
        }
        localStorage.setItem(`fluxpay_balances:${cacheKey}`, JSON.stringify(persisted))
      } catch { /* storage full/blocked — in-memory state still works */ }
    } catch (e) {
      // Rows are never cleared on failure — cached values stay visible.
      setError((e as Error).message || 'Failed to load balances')
    } finally {
      setLoading(false)
    }
  }, [addrs, cacheKey])

  useEffect(() => {
    void load()
  }, [load])

  return { rows, totalUsd, loading, error, refresh: () => load(true) }
}

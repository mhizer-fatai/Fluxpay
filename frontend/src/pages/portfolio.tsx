import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Boxes, Coins, Plus, TrendingUp, Wallet, X, type LucideIcon } from 'lucide-react'
import { encodeFunctionData } from 'viem'
import { DashboardShell } from '@/components/dashboard-shell'
import { SmartWalletGate } from '@/components/guard'
import { useWallet } from '@/hooks/useWallet'
import { useBalances } from '@/hooks/useBalances'
import { listStreams } from '@/lib/streams'
import { EQUITY_VENUE_ADDRESS, erc20Abi, equityVenueAbi, getUsdPrices, INVEST_VAULT_ADDRESS, investVaultAbi, publicClient, STOCK_TOKEN_ADDRESS, TOKENS } from '@/lib/chain'
import { sendGasless } from '@/lib/gasless'
import { money, usdOf } from '@/lib/format'

const TOKEN_COLORS: Record<string, string> = { MON: '#6E56CF', USDC: '#2775CA', AUSD: '#0EA5E9', WETH: '#627EEA', WMON: '#836EA8' }

export default function PortfolioPage() {
  return <SmartWalletGate><PortfolioContent /></SmartWalletGate>
}

function PortfolioContent() {
  // Smart account only - the EOA never appears in money UI.
  const { address: ownerAddress, smartAddress, getWalletClient } = useWallet()
  const address = smartAddress as string
  const { rows, totalUsd, loading } = useBalances(address)
  const [streams, setStreams] = useState<Awaited<ReturnType<typeof listStreams>>>([])
  const [asset, setAsset] = useState<{ key: string; amount: number; usd: number } | null>(null)
  const [prices, setPrices] = useState<Record<string, number> | null>(null)
  const [invest, setInvest] = useState<{ stock: bigint; valueX18: bigint; priceX18: bigint; source: string; symbol: string; decimals: number } | null>(null)
  const [investBusy, setInvestBusy] = useState('')
  const [investNotice, setInvestNotice] = useState('')

  useEffect(() => { void getUsdPrices().then(setPrices).catch(() => {}) }, [])

  useEffect(() => {
    if (!address) return
    void listStreams(address).then(setStreams).catch(() => setStreams([]))
  }, [address])

  const loadInvest = async () => {
    if (!address || !INVEST_VAULT_ADDRESS) return
    try {
      const [stock, valueX18, priceX18, source, symbol, decimals] = await Promise.all([
        publicClient.readContract({ address: INVEST_VAULT_ADDRESS, abi: investVaultAbi, functionName: 'stockOf', args: [address as `0x${string}`] }),
        publicClient.readContract({ address: INVEST_VAULT_ADDRESS, abi: investVaultAbi, functionName: 'positionValueX18', args: [address as `0x${string}`] }),
        publicClient.readContract({ address: EQUITY_VENUE_ADDRESS, abi: equityVenueAbi, functionName: 'priceX18' }),
        publicClient.readContract({ address: EQUITY_VENUE_ADDRESS, abi: equityVenueAbi, functionName: 'priceSource' }),
        publicClient.readContract({ address: STOCK_TOKEN_ADDRESS, abi: erc20Abi, functionName: 'symbol' }),
        publicClient.readContract({ address: STOCK_TOKEN_ADDRESS, abi: erc20Abi, functionName: 'decimals' }),
      ])
      setInvest({ stock, valueX18, priceX18, source, symbol, decimals })
    } catch {
      setInvest(null)
    }
  }

  useEffect(() => { void loadInvest() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  const sellAll = async () => {
    if (!invest || invest.stock === 0n || !ownerAddress || !INVEST_VAULT_ADDRESS) return
    setInvestNotice('')
    try {
      setInvestBusy('Selling...')
      const walletClient = await getWalletClient()
      if (!walletClient) throw new Error('wallet_unavailable')
      await sendGasless({
        walletClient,
        // The EOA signs; the smart account owns the position.
        ownerAddress: ownerAddress as `0x${string}`,
        calls: [{
          to: INVEST_VAULT_ADDRESS,
          data: encodeFunctionData({ abi: investVaultAbi, functionName: 'divest', args: [invest.stock] }),
        }],
      })
      setInvestNotice('Sold — USDC is back in your wallet.')
      void loadInvest()
    } catch (e) {
      const err = e as Error & { shortMessage?: string }
      setInvestNotice(err.shortMessage || err.message || 'Sell failed')
    } finally {
      setInvestBusy('')
    }
  }

  const holdings = useMemo(() => rows.filter(r => r.amount > 0).sort((a, b) => b.usd - a.usd), [rows])
  const invested = streams.filter(s => s.role === 'owner' && !s.cancelled).reduce((s, x) => s + (usdOf(x.deposited, x.token, prices) ?? 0), 0)
  const assetsOwned = holdings.length

  const allocation = holdings.map(h => ({
    name: h.key,
    pct: totalUsd > 0 ? (h.usd / totalUsd) * 100 : 0,
    color: TOKEN_COLORS[h.key] ?? '#d7dbda',
  }))

  const metrics: Array<{ label: string; value: string; note: string; icon: LucideIcon; up?: boolean }> = [
    { label: 'Total Portfolio Value', value: loading && totalUsd === 0 ? '-' : money(totalUsd), note: 'Live wallet value', icon: Wallet },
    { label: 'Stream Deposits', value: money(invested), note: `Across ${streams.filter(s => s.role === 'owner').length} streams`, icon: Coins },
    { label: 'Incoming Monthly', value: money(streams.filter(s => s.role === 'recipient' && !s.cancelled).reduce((s, x) => s + (usdOf(x.monthly, x.token, prices) ?? 0), 0)), note: 'From active streams', icon: TrendingUp, up: true },
    { label: 'Assets Held', value: String(assetsOwned), note: 'On Monad testnet', icon: Boxes },
  ]

  function AllocationDonut() {
    let cumulative = 0
    if (allocation.length === 0) return null
    return (
      <svg viewBox="0 0 42 42" className="pf-donut" aria-hidden="true">
        <circle cx="21" cy="21" r="15.9155" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        <g transform="rotate(-90 21 21)">
          {allocation.map(a => {
            const seg = <circle key={a.name} cx="21" cy="21" r="15.9155" pathLength={100} fill="none" stroke={a.color} strokeWidth="6" strokeDasharray={`${a.pct} ${100 - a.pct}`} strokeDashoffset={-cumulative} />
            cumulative += a.pct
            return seg
          })}
        </g>
      </svg>
    )
  }

  return <DashboardShell>
    <section className="dashboard-content pf">
      <div className="pf-head">
        <div>
          <h1>Portfolio</h1>
          <p className="pf-support">Your live token holdings and on-chain payment streams - everything read directly from Monad.</p>
        </div>
        <div className="pf-head-actions">
          <Link className="ov-btn primary" to="/payment-link"><Plus size={15} /> Receive</Link>
          <Link className="ov-btn" to="/subscriptions">Manage Streams</Link>
        </div>
      </div>

      <div className="pf-metrics">
        {metrics.map(m => {
          const Icon = m.icon
          return (
            <div className="ov-stat" key={m.label}>
              <span className="ov-stat-icon"><Icon size={16} /></span>
              <small>{m.label}</small>
              <strong>{m.value}</strong>
              <em className={m.up ? 'up' : ''}>{m.note}</em>
            </div>
          )
        })}
      </div>

      <div className="pf-card">
        <div className="pf-section-head"><h2>Your Holdings</h2></div>
        <div className="pf-table">
          <div className="pf-tr pf-th"><span>Asset</span><span>Owned</span><span>Value</span><span>Allocation</span></div>
          {loading && holdings.length === 0 && <p className="ac-empty">Loading balances...</p>}
          {!loading && holdings.length === 0 && <p className="ac-empty">No holdings yet - receive funds to build your portfolio.</p>}
          {holdings.map(h => (
            <button className="pf-tr pf-holding" key={h.key} onClick={() => setAsset(h)}>
              <span className="pf-asset"><i style={{ background: TOKEN_COLORS[h.key] ?? '#888' }} />{h.key}</span>
              <span>{h.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })}</span>
              <span>{money(h.usd)}</span>
              <span>{totalUsd > 0 ? `${((h.usd / totalUsd) * 100).toFixed(1)}%` : '-'}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pf-columns">
        <div className="pf-card">
          <div className="pf-section-head"><h2>Portfolio Allocation</h2></div>
          <div className="pf-allocation">
            <AllocationDonut />
            <div className="pf-legend">
              {allocation.length === 0 && <small>No allocation yet.</small>}
              {allocation.map(a => (
                <div className="pf-legend-row" key={a.name}>
                  <span className="pf-legend-name"><i style={{ background: a.color }} />{a.name}</span>
                  <strong>{a.pct.toFixed(1)}%</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="pf-card">
          <div className="pf-section-head"><h2>Stream Deposits</h2></div>
          <div className="pf-list">
            {streams.length === 0 && <small>No streams yet.</small>}
            {streams.slice(0, 5).map(s => (
              <div className="pf-source" key={s.id.toString()}>
                <span className="pf-source-name">#{s.id.toString()} {s.role === 'owner' ? '->' : '<-'} {shortAddrSafe(s.role === 'owner' ? s.recipient : s.owner)}</span>
                <strong>{s.deposited.toFixed(2)} {s.token ?? ''}</strong>
              </div>
            ))}
          </div>
          <div className="pf-total"><span>Total funded into streams</span><strong>{money(invested)}</strong></div>
          <Link className="ov-link" to="/subscriptions">View Subscriptions <ArrowRight size={14} /></Link>
        </div>

        <div className="pf-card">
          <div className="pf-section-head"><h2>Pay &amp; Own</h2></div>
          {invest && invest.stock > 0n ? (
            <>
              <div className="pf-detail-grid">
                <div className="su-stat"><small>Position</small><strong>{(Number(invest.stock) / 10 ** invest.decimals).toLocaleString('en-US', { maximumFractionDigits: 6 })} {invest.symbol}</strong></div>
                <div className="su-stat"><small>Value</small><strong>{money(Number(invest.valueX18) / 1e18)}</strong></div>
                <div className="su-stat"><small>Price</small><strong>{money(Number(invest.priceX18) / 1e18)}</strong></div>
                <div className="su-stat"><small>Price source</small><strong>{invest.source === 'pyth' ? 'Pyth oracle' : 'Testnet fallback'}</strong></div>
              </div>
              <p className="pf-note">Simulated equity on testnet, priced by Pyth. Built by the Invest &amp; Own slice of your USDC streams.</p>
              {investNotice && <p className="pf-note">{investNotice}</p>}
              <button className="ov-btn" onClick={sellAll} disabled={!!investBusy}>{investBusy || 'Sell all for USDC'}</button>
            </>
          ) : (
            <p className="pf-note">No equity position yet. Turn on Invest &amp; Own when you create a USDC stream — a slice of each payment becomes {invest?.symbol ?? 'NVDAx'} you keep.</p>
          )}
        </div>
      </div>
    </section>

    {asset && (
      <div className="pf-modal-backdrop" onClick={() => setAsset(null)}>
        <div className="pf-modal" onClick={e => e.stopPropagation()}>
          <div className="pf-modal-head">
            <h2>{asset.key}</h2>
            <button className="pf-close" onClick={() => setAsset(null)} aria-label="Close"><X size={16} /></button>
          </div>
          <div className="pf-detail-grid">
            <div className="su-stat"><small>Balance</small><strong>{asset.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })}</strong></div>
            <div className="su-stat"><small>Value</small><strong>{money(asset.usd)}</strong></div>
            <div className="su-stat"><small>Network</small><strong>Monad Testnet</strong></div>
            <div className="su-stat"><small>Contract</small><strong>{TOKENS.find(t => t.key === asset.key)?.address ? 'ERC-20' : 'Native'}</strong></div>
          </div>
          <p className="pf-note">{TOKENS.find(t => t.key === asset.key)?.name} - live balance from {TOKENS.find(t => t.key === asset.key)?.address ? 'the token contract' : 'the Monad chain'}.</p>
          <div className="pf-modal-actions">
            <Link className="ov-btn primary" to="/send">Send</Link>
            <Link className="ov-btn" to="/receive">Receive</Link>
          </div>
        </div>
      </div>
    )}
  </DashboardShell>
}

function shortAddrSafe(a: string) {
  return a.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a
}

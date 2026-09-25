import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownLeft, ArrowLeftRight, ArrowRight, Copy, Link2, QrCode, Send, X } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { useProfile } from '@/hooks/profile'
import { useBalances } from '@/hooks/useBalances'
import { fetchActivity } from '@/lib/activity'
import { money, shortAddr, timeAgo } from '@/lib/format'
import type { ActivityItem } from '@/lib/activity'

const TOKEN_COLORS: Record<string, string> = { MON: '#6E56CF', USDC: '#2775CA', AUSD: '#0EA5E9', WETH: '#627EEA', WMON: '#836EEX' }

export default function WalletPage() {
  const { address, profile } = useProfile()
  const { rows, totalUsd, loading, error, refresh } = useBalances(address)
  const [asset, setAsset] = useState<{ key: string; amount: number; usd: number } | null>(null)
  const [copied, setCopied] = useState(false)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [activityLoading, setActivityLoading] = useState(false)

  useEffect(() => {
    if (!address) return
    setActivityLoading(true)
    fetchActivity(address, 10_000)
      .then(items => setActivity(items.slice(0, 5)))
      .catch(() => setActivity([]))
      .finally(() => setActivityLoading(false))
  }, [address])

  const copyAddress = () => {
    if (!address) return
    navigator.clipboard?.writeText(address).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return <DashboardShell>
    <section className="dashboard-content wa">
      <div className="wa-head">
        <div>
          <h1>Wallet</h1>
          <p className="wa-support">View your balances, manage your assets, and send or receive funds on Monad.{profile?.username ? ` You are @${profile.username}.` : ''}</p>
        </div>
        <button className="wa-btn" onClick={() => void refresh()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      <div className="wa-balance">
        <div className="wa-balance-info">
          <span className="wa-label">Total Balance</span>
          <strong className="wa-total">{loading && totalUsd === 0 ? '…' : money(totalUsd)}</strong>
          <span className="wa-change">Live on Monad testnet</span>
          <div className="wa-balance-stats">
            <div><span>Stablecoins</span><strong>{money(rows.filter(r => r.key === 'USDC' || r.key === 'AUSD').reduce((s, r) => s + r.usd, 0))}</strong></div>
            <div><span>Gas asset (MON)</span><strong>{money(rows.find(r => r.key === 'MON')?.usd ?? 0)}</strong></div>
          </div>
          <div className="wa-balance-actions">
            <Link className="wa-btn primary" to="/send"><Send size={15} /> Send</Link>
            <Link className="wa-btn" to="/receive"><ArrowDownLeft size={15} /> Receive</Link>
            <Link className="wa-btn" to="/swap"><ArrowLeftRight size={15} /> Swap</Link>
            <Link className="wa-btn" to="/payment-link"><Link2 size={15} /> Payment Links</Link>
          </div>
        </div>
        <div className="wa-wallet">
          <div className="wa-wallet-inner">
            <span className="wa-wallet-label">Your FluxPay Wallet</span>
            <p className="wa-addr">{address ?? 'connecting…'}</p>
            <div className="wa-addr-actions">
              <button className="wa-btn" onClick={copyAddress}><Copy size={14} /> {copied ? 'Copied' : 'Copy Address'}</button>
              <Link className="wa-btn" to="/receive"><QrCode size={14} /> QR Code</Link>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="wa-card"><p>{error}</p></div>}

      <div className="wa-card">
        <div className="wa-section-head"><h2>Your Assets</h2></div>
        <div className="wa-assets">
          {loading && rows.length === 0 && <div className="wa-activity"><div className="wa-activity-name"><small>Loading balances…</small></div></div>}
          {rows.map(r => (
            <button className="wa-asset" key={r.key} onClick={() => setAsset(r)}>
              <span className="wa-asset-logo" style={{ background: TOKEN_COLORS[r.key] ?? '#555' }}>{r.key.slice(0, 2)}</span>
              <span className="wa-asset-name"><strong>{r.key}</strong><small>{r.key === 'MON' ? 'Monad' : r.key === 'USDC' ? 'USD Coin' : r.key === 'AUSD' ? 'Aperture USD' : r.key === 'WETH' ? 'Wrapped Ether' : 'Wrapped Monad'}</small></span>
              <span className="wa-asset-val"><strong>{money(r.usd)}</strong><small>{r.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} {r.key}</small></span>
            </button>
          ))}
        </div>
      </div>

      <div className="wa-card">
        <div className="wa-section-head">
          <h2>Recent Wallet Activity</h2>
          <Link className="ov-link" to="/activity">View All Activity <ArrowRight size={14} /></Link>
        </div>
        <div className="wa-activity-list">
          {activityLoading && <div className="wa-activity"><div className="wa-activity-name"><small>Loading on-chain activity…</small></div></div>}
          {!activityLoading && activity.length === 0 && <div className="wa-activity"><div className="wa-activity-name"><small>No on-chain activity yet — send or receive to get started.</small></div></div>}
          {activity.map(a => (
            <div className="wa-activity" key={`${a.hash}-${a.kind}-${a.counterparty}`}>
              <div className="wa-activity-name"><strong>{a.token ?? 'Token'} {a.kind === 'received' ? 'received' : 'sent'}</strong><small>{a.kind === 'received' ? 'From' : 'To'} {shortAddr(a.counterparty)}</small></div>
              <span className={`wa-amount ${a.kind === 'received' ? 'up' : ''}`}>{a.kind === 'received' ? '+' : '−'}{a.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} {a.token ?? ''}</span>
              <span className="wa-when">{timeAgo(a.ts)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>

    {asset && (
      <div className="su-modal-backdrop" onClick={() => setAsset(null)}>
        <div className="su-modal" onClick={e => e.stopPropagation()}>
          <div className="su-modal-head">
            <h2>{asset.key}</h2>
            <button className="su-close" onClick={() => setAsset(null)} aria-label="Close"><X size={16} /></button>
          </div>
          <div className="pf-detail-grid">
            <div className="su-stat"><small>Value</small><strong>{money(asset.usd)}</strong></div>
            <div className="su-stat"><small>Balance</small><strong>{asset.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} {asset.key}</strong></div>
            <div className="su-stat"><small>Network</small><strong>Monad Testnet</strong></div>
          </div>
          <div className="pf-modal-actions">
            <Link className="ov-btn primary" to="/send">Send</Link>
            <Link className="ov-btn" to="/swap">Swap</Link>
          </div>
        </div>
      </div>
    )}
  </DashboardShell>
}

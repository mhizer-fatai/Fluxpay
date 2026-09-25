import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownLeft, ArrowRight, Bot, CalendarDays, Download,
  Send, Wallet, type LucideIcon,
} from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { useProfile } from '@/hooks/profile'
import { useBalances } from '@/hooks/useBalances'
import { listStreams } from '@/lib/streams'
import { fetchActivity } from '@/lib/activity'
import { money, timeAgo } from '@/lib/format'

const quickActions: Array<{ label: string; icon: LucideIcon; href: string; soon?: boolean }> = [
  { label: 'Send', icon: Send, href: '/send' },
  { label: 'Receive', icon: ArrowDownLeft, href: '/receive' },
  { label: 'Payment Link', icon: CalendarDays, href: '/payment-link' },
  { label: 'Subscriptions', icon: Wallet, href: '/subscriptions' },
]

export default function DashboardPage() {
  const { profile, address } = useProfile()
  const { rows, totalUsd, loading } = useBalances(address)
  const [streams, setStreams] = useState<Awaited<ReturnType<typeof listStreams>>>([])
  const [activity, setActivity] = useState<Awaited<ReturnType<typeof fetchActivity>>>([])
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!address) return
    void listStreams(address).then(setStreams).catch(() => setStreams([]))
    void fetchActivity(address, 10_000).then(items => setActivity(items.slice(0, 6))).catch(() => setActivity([]))
  }, [address])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = (profile?.fullName || profile?.username || 'there').split(/\s+/)[0]

  const owned = streams.filter(s => s.role === 'owner' && !s.cancelled)
  const monthlySpend = owned.reduce((sum, s) => sum + s.monthly, 0)
  const totalDeposited = owned.reduce((sum, s) => sum + s.deposited, 0)

  const holdings = useMemo(
    () => rows.filter(r => r.amount > 0).sort((a, b) => b.usd - a.usd).slice(0, 5),
    [rows],
  )
  const maxUsd = Math.max(1, ...holdings.map(h => h.usd))

  const exportCsv = async () => {
    if (!address) return
    setExporting(true)
    try {
      const items = await fetchActivity(address, 40_000)
      const header = 'date,type,token,amount,counterparty,tx\n'
      const body = items
        .map(i => `${new Date(i.ts * 1000).toISOString()},${i.event},${i.token ?? ''},${i.amount},${i.counterparty},${i.hash}`)
        .join('\n')
      const blob = new Blob([header + body], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'fluxpay-activity.csv'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  return <DashboardShell>
    <section className="dashboard-content ov">
      <div className="ov-welcome">
        <div>
          <h1>{greeting}, {firstName}</h1>
          <p>Here&apos;s your live Monad overview.</p>
        </div>
        <div className="ov-welcome-actions">
          <button className="ov-btn primary" onClick={exportCsv} disabled={exporting || !address}><Download size={15} /> {exporting ? 'Exporting…' : 'Export'}</button>
        </div>
      </div>

      <div className="ov-main">
        <div className="ov-main-left">
          <div className="ov-quick">
            {quickActions.map(a => {
              const Icon = a.icon
              return <Link className={`ov-quick-item${a.soon ? ' is-soon' : ''}`} to={a.href} key={a.label} aria-disabled={a.soon || undefined} onClick={a.soon ? e => e.preventDefault() : undefined}><Icon size={18} /><span>{a.label}{a.soon && <span className="soon-badge">Soon</span>}</span></Link>
            })}
          </div>

          <div className="ov-card ov-portfolio">
            <div className="ov-card-head">
              <div>
                <h2>Holdings Breakdown</h2>
                <strong>{loading && totalUsd === 0 ? '…' : money(totalUsd)}</strong>
                <em>Live wallet value</em>
              </div>
            </div>
            {holdings.length === 0 && !loading && (
              <p style={{ color: 'var(--muted, #999)', fontSize: 13 }}>No token balances yet — receive funds to see your holdings here.</p>
            )}
            <div className="ov-holdings">
              {holdings.map(h => (
                <div className="ov-holding" key={h.key}>
                  <span className="ov-asset">{h.key}</span>
                  <span style={{ flex: 1, height: 6, margin: '0 12px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.max(3, (h.usd / maxUsd) * 100)}%`, background: '#D35A44', borderRadius: 4 }} />
                  </span>
                  <span className="ov-holding-val">{money(h.usd)}</span>
                  <span className="ov-return">{h.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })} {h.key}</span>
                </div>
              ))}
            </div>
            <Link className="ov-link" to="/portfolio">View Portfolio <ArrowRight size={14} /></Link>
          </div>
        </div>

        <div className="ov-kpis">
          <div className="ov-stat">
            <span className="ov-stat-icon"><Wallet size={16} /></span>
            <small>Total Balance</small>
            <strong>{loading && totalUsd === 0 ? '…' : money(totalUsd)}</strong>
            <em>All tokens, live</em>
          </div>
          <div className="ov-stat">
            <span className="ov-stat-icon"><CalendarDays size={16} /></span>
            <small>Active Streams</small>
            <strong>{owned.length}</strong>
            <em>Subscription streams</em>
          </div>
          <div className="ov-stat">
            <span className="ov-stat-icon"><ArrowDownLeft size={16} /></span>
            <small>Stream Deposits</small>
            <strong>{money(totalDeposited)}</strong>
            <em>Funded into streams</em>
          </div>
          <div className="ov-stat">
            <span className="ov-stat-icon"><Bot size={16} /></span>
            <small>Stream Spend</small>
            <strong>{money(monthlySpend)}/mo</strong>
            <em>Across your streams</em>
          </div>
        </div>
      </div>

      <div className="ov-card">
        <div className="ov-card-head">
          <div>
            <h2>Your Subscription Streams</h2>
            <p>On-chain streams from StreamVault where you are the payer.</p>
          </div>
          <Link className="ov-link" to="/subscriptions">View All <ArrowRight size={14} /></Link>
        </div>
        <div className="ov-list">
          {streams.length === 0 && <p style={{ color: 'var(--muted, #999)', fontSize: 13 }}>No streams yet — create one from the Subscriptions page.</p>}
          {owned.slice(0, 4).map(s => (
            <div className="ov-sub" key={s.id.toString()}>
              <span className="ov-sub-logo">{(s.token ?? 'S')[0]}</span>
              <div className="ov-sub-name"><strong>Stream #{s.id.toString()} → {s.recipient.slice(0, 6)}…{s.recipient.slice(-4)}</strong><small>{s.monthly.toFixed(2)} {s.token ?? ''} / month</small></div>
              <span className="ov-pill">{s.paused ? 'Paused' : 'Active'}</span>
              <span className="ov-sub-next">Funded: {s.deposited.toFixed(2)} {s.token ?? ''}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="ov-ai">
        <span className="ov-ai-icon"><Bot size={20} /></span>
        <div className="ov-ai-text">
          <h2>Need to make a move?</h2>
          <p>Use the terminal to check balances, resolve usernames, and send payments with plain commands.</p>
        </div>
        <Link className="ov-btn primary" to="/terminal">Open Terminal <ArrowRight size={14} /></Link>
      </div>

      <div className="ov-card">
        <div className="ov-card-head">
          <div><h2>Recent Activity</h2></div>
          <Link className="ov-link" to="/activity">View All <ArrowRight size={14} /></Link>
        </div>
        <div className="ov-list">
          {activity.length === 0 && <p style={{ color: 'var(--muted, #999)', fontSize: 13 }}>No on-chain activity yet.</p>}
          {activity.map(a => {
            const Icon = a.kind === 'received' ? ArrowDownLeft : Send
            return (
              <div className="ov-tx" key={`${a.hash}-${a.counterparty}-${a.kind}`}>
                <span className="ov-tx-icon"><Icon size={16} /></span>
                <div className="ov-tx-name"><strong>{a.token ?? 'Token'} {a.kind === 'received' ? 'received' : 'sent'}</strong><small>{a.event}</small></div>
                <span className={`ov-tx-amount ${a.kind === 'received' ? 'up' : 'down'}`}>{a.kind === 'received' ? '+' : '−'}{a.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} {a.token ?? ''}</span>
                <span className="ov-tx-when">{timeAgo(a.ts)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  </DashboardShell>
}

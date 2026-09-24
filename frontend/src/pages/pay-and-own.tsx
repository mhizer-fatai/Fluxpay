import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, Percent, TrendingUp, Wallet } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { useProfile } from '@/hooks/profile'
import { listStreams } from '@/lib/streams'
import { money, shortAddr, timeAgo } from '@/lib/format'

const PREFS_KEY = 'fluxpay_prefs'

export default function PayAndOwnPage() {
  const { address } = useProfile()
  const [streams, setStreams] = useState<Awaited<ReturnType<typeof listStreams>>>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [rate, setRate] = useState(2)
  const [minInvest, setMinInvest] = useState(1)

  useEffect(() => {
    try {
      const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}')
      if (typeof prefs.rate === 'number') setRate(prefs.rate)
    } catch { /* defaults */ }
  }, [])

  useEffect(() => {
    if (!address) return
    setLoading(true)
    listStreams(address)
      .then(setStreams)
      .catch(() => setStreams([]))
      .finally(() => setLoading(false))
  }, [address])

  const owned = streams.filter(s => s.role === 'owner' && !s.cancelled)
  const monthlySpend = owned.reduce((s, x) => s + x.monthly, 0)
  const investedAllTime = owned.reduce((s, x) => s + x.deposited, 0)
  const pausedCount = streams.filter(s => s.paused && !s.cancelled).length

  const maxDeposit = Math.max(1, ...streams.map(s => s.deposited))

  const savePrefs = () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}'), rate, minInvest }))
    setEditing(false)
  }

  return <DashboardShell>
    <section className="dashboard-content po">
      <div className="po-head">
        <div>
          <h1>Pay &amp; Own</h1>
          <p className="po-support">Your recurring payments run as on-chain streams — see what flows out, what you hold, and automate it.</p>
        </div>
        <div className="po-head-actions">
          <button className="ov-btn primary" onClick={() => (editing ? savePrefs() : setEditing(true))}>{editing ? 'Save' : 'Configure'}</button>
          <div className="po-status">
            <span>Automation</span>
            <em><i /> {owned.length > 0 ? 'Active' : 'No streams'}</em>
          </div>
        </div>
      </div>

      <div className="po-metrics">
        <div className="ov-stat"><span className="ov-stat-icon"><TrendingUp size={16} /></span><small>Monthly Outgoing</small><strong>{money(monthlySpend)}</strong><em>live stream rates</em></div>
        <div className="ov-stat"><span className="ov-stat-icon"><Wallet size={16} /></span><small>Funded All-Time</small><strong>{money(investedAllTime)}</strong><em>deposited on-chain</em></div>
        <div className="ov-stat"><span className="ov-stat-icon"><CalendarDays size={16} /></span><small>Active Streams</small><strong>{owned.length}</strong><em>{pausedCount > 0 ? `${pausedCount} paused` : 'none paused'}</em></div>
        <div className="ov-stat"><span className="ov-stat-icon"><Percent size={16} /></span><small>Auto-Invest Rate</small><strong>{rate}%</strong><em>your preference</em></div>
      </div>

      <div className="po-card">
        <div className="po-section-head">
          <div>
            <strong className="po-big">{money(investedAllTime)} deposited</strong>
            <em className="po-return">across {owned.length} active {owned.length === 1 ? 'stream' : 'streams'}</em>
          </div>
        </div>
        <div className="po-bars" aria-hidden="true">
          {streams.length === 0 && <span style={{ height: '4%' }} />}
          {streams.slice(0, 12).map(s => (
            <span key={s.id.toString()} title={`Stream #${s.id.toString()}: ${s.deposited.toFixed(2)} ${s.token ?? ''}`} style={{ height: `${Math.max(4, (s.deposited / maxDeposit) * 100)}%` }} />
          ))}
        </div>
        <p className="po-chart-label">Deposited per stream</p>
      </div>

      <div className="po-card">
        <div className="po-section-head">
          <h2>Recent stream activity</h2>
          <Link className="ov-link" to="/activity">View All Activity <ArrowRight size={14} /></Link>
        </div>
        <div className="po-list">
          {loading && <small>Loading streams…</small>}
          {!loading && streams.length === 0 && <small>No streams yet — create one from the Subscriptions page.</small>}
          {streams.slice(0, 5).map(s => (
            <div className="po-inv" key={s.id.toString()}>
              <span className="po-inv-logo">{(s.token ?? 'S')[0]}</span>
              <div className="po-inv-name">
                <strong>Stream #{s.id.toString()}</strong>
                <small>{s.role === 'owner' ? `You pay ${shortAddr(s.recipient)}` : `${shortAddr(s.owner)} pays you`} · {s.monthly.toFixed(2)} {s.token ?? ''}/mo</small>
              </div>
              <span className="po-inv-amount">{s.deposited.toFixed(2)} {s.token ?? ''}</span>
              <span className="po-inv-when">{timeAgo(s.createdAt)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="po-card po-settings-card">
        <div className="po-section-head">
          <h2>Automation settings</h2>
          <div className="po-settings-actions">
            {editing && <button className="ov-btn" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </div>
        <div className="po-settings">
          <div className="po-setting">
            <div><strong>Default investment rate</strong><small>Share of eligible payments reserved for Pay &amp; Own (stored on this device).</small></div>
            {editing ? (
              <input type="number" min={0} max={10} value={rate} onChange={e => setRate(Number(e.target.value))} style={{ width: 72, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '6px 10px', color: 'inherit' }} />
            ) : (
              <span className="po-value">{rate}%</span>
            )}
          </div>
          <div className="po-setting">
            <div><strong>Minimum investment</strong><small>Only execute investments above this amount.</small></div>
            {editing ? (
              <input type="number" min={0} step="0.5" value={minInvest} onChange={e => setMinInvest(Number(e.target.value))} style={{ width: 72, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '6px 10px', color: 'inherit' }} />
            ) : (
              <span className="po-value">${minInvest.toFixed(2)}</span>
            )}
          </div>
          <div className="po-setting">
            <div><strong>Investment funding</strong><small>The asset used to fund investments.</small></div>
            <span className="po-value">USDC</span>
          </div>
        </div>
      </div>
    </section>
  </DashboardShell>
}

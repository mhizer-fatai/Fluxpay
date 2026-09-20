import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, CreditCard, MoreHorizontal, Percent, Plus, TrendingUp, X } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const metrics = [
  { label: 'Active Subscriptions', value: '6', note: 'subscriptions', icon: CalendarDays },
  { label: 'Monthly Spend', value: '$86.47', note: 'spending', icon: CreditCard },
  { label: 'Invested This Month', value: '$2.14', note: 'this month', icon: TrendingUp },
  { label: 'Average Investment Rate', value: '2.5%', note: 'average', icon: Percent },
]

type Sub = { id: string; name: string; amount: number; percent: number; next: string; nextLong: string; asset: string; status: 'active' | 'paused' }

const subscriptions: Sub[] = [
  { id: 'spotify', name: 'Spotify Premium', amount: 11.99, percent: 2, next: 'Sep 24', nextLong: 'September 24, 2026', asset: 'Spotify-related asset', status: 'active' },
  { id: 'youtube', name: 'YouTube Premium', amount: 13.99, percent: 3, next: 'Sep 27', nextLong: 'September 27, 2026', asset: 'Alphabet', status: 'active' },
  { id: 'netflix', name: 'Netflix', amount: 15.49, percent: 2, next: 'Oct 2', nextLong: 'October 2, 2026', asset: 'Netflix', status: 'active' },
  { id: 'disney', name: 'Disney+', amount: 13.99, percent: 2, next: 'Oct 6', nextLong: 'October 6, 2026', asset: 'Disney', status: 'paused' },
]

const investmentHistory = [
  { name: 'Spotify', payment: '$11.99', investment: '$0.24', date: 'Sep 18', status: 'Completed' },
  { name: 'YouTube', payment: '$13.99', investment: '$0.42', date: 'Sep 17', status: 'Completed' },
  { name: 'Netflix', payment: '$15.49', investment: '$0.31', date: 'Sep 16', status: 'Completed' },
  { name: 'Spotify', payment: '$11.99', investment: '$0.24', date: 'Sep 10', status: 'Completed' },
]

const frequencies = ['Monthly', 'Weekly', 'Yearly', 'Custom']
const assets = ['Spotify-related asset', 'Alphabet', 'Netflix', 'Meta', 'NVIDIA']

export default function SubscriptionsPage() {
  const [addOpen, setAddOpen] = useState(false)
  const [detail, setDetail] = useState<Sub | null>(null)
  const [form, setForm] = useState({ name: 'Spotify', amount: '11.99', freq: 'Monthly', percent: 2, asset: 'Spotify-related asset' })
  const estimated = (parseFloat(form.amount) || 0) * form.percent / 100

  return <DashboardShell>
    <section className="dashboard-content su">
      <div className="su-head">
        <div>
          <h1>Subscriptions</h1>
          <p className="su-support">Connect your recurring payments, choose how much to invest from each one, and let FluxPay handle the rest.</p>
        </div>
        <button className="ov-btn primary" onClick={() => setAddOpen(true)}><Plus size={15} /> Add Subscription</button>
      </div>

      <div className="su-metrics">
        {metrics.map(m => {
          const Icon = m.icon
          return (
            <div className="ov-stat" key={m.label}>
              <span className="ov-stat-icon"><Icon size={16} /></span>
              <small>{m.label}</small>
              <strong>{m.value}</strong>
              <em>{m.note}</em>
            </div>
          )
        })}
      </div>

      <div className="su-card">
        <div className="su-section-head">
          <div>
            <h2>Your Subscriptions</h2>
            <p>Manage your active subscriptions and investment preferences.</p>
          </div>
        </div>
        <div className="su-list">
          {subscriptions.map(s => {
            const per = s.amount * s.percent / 100
            return (
              <div className="su-item" key={s.id}>
                <div className="su-item-top">
                  <span className="su-logo">{s.name[0]}</span>
                  <div className="su-item-name"><strong>{s.name}</strong><small>{money(s.amount)} / month</small></div>
                  <span className={s.status === 'active' ? 'su-badge' : 'su-badge su-badge-paused'}>{s.status === 'active' ? 'Active' : 'Paused'}</span>
                </div>
                <div className="su-item-bottom">
                  <div className="su-stat"><small>Investment</small><strong>{s.percent}%</strong></div>
                  <div className="su-stat"><small>Next payment</small><strong>{s.next}</strong></div>
                  <div className="su-stat"><small>Estimated investment</small><strong>{money(per)}</strong></div>
                  <div className="su-item-actions">
                    <button className="su-action" onClick={() => setDetail(s)}>Edit</button>
                    <button className="su-action">{s.status === 'active' ? 'Pause' : 'Resume'}</button>
                    <button className="su-action su-more" aria-label="More options"><MoreHorizontal size={14} /></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="su-card">
        <div className="su-section-head">
          <h2>Subscription Investment History</h2>
          <Link className="ov-link" to="/activity">View All Activity <ArrowRight size={14} /></Link>
        </div>
        <div className="su-table">
          <div className="su-tr su-th"><span>Subscription</span><span>Payment</span><span>Investment</span><span>Date</span><span>Status</span></div>
          {investmentHistory.map((h, i) => (
            <div className="su-tr" key={i}>
              <span className="su-strong">{h.name}</span>
              <span>{h.payment}</span>
              <span className="su-invest">{h.investment}</span>
              <span>{h.date}</span>
              <span className="su-status">{h.status}</span>
            </div>
          ))}
        </div>
      </div>
    </section>

    {addOpen && (
      <div className="su-modal-backdrop" onClick={() => setAddOpen(false)}>
        <div className="su-modal" onClick={e => e.stopPropagation()}>
          <div className="su-modal-head">
            <h2>Add a Subscription</h2>
            <button className="su-close" onClick={() => setAddOpen(false)} aria-label="Close"><X size={16} /></button>
          </div>
          <div className="su-field">
            <label>Subscription name</label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="su-field">
            <label>Monthly amount</label>
            <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="su-field">
            <label>Billing frequency</label>
            <div className="su-seg">
              {frequencies.map(f => <button key={f} className={f === form.freq ? 'on' : ''} onClick={() => setForm({ ...form, freq: f })}>{f}</button>)}
            </div>
          </div>
          <div className="su-field">
            <label>Investment percentage</label>
            <div className="su-range-row">
              <input className="su-range" type="range" min={0} max={10} step={1} value={form.percent} onChange={e => setForm({ ...form, percent: Number(e.target.value) })} />
              <strong>{form.percent}%</strong>
            </div>
            <div className="su-range-scale"><span>0%</span><span>10%</span></div>
          </div>
          <div className="su-estimate"><span>Estimated investment</span><strong>{money(estimated)} per payment</strong></div>
          <div className="su-field">
            <label>Investment asset</label>
            <select value={form.asset} onChange={e => setForm({ ...form, asset: e.target.value })}>
              {assets.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div className="su-modal-actions">
            <button className="ov-btn" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="ov-btn primary" onClick={() => setAddOpen(false)}>Add Subscription</button>
          </div>
        </div>
      </div>
    )}

    {detail && (
      <div className="su-modal-backdrop" onClick={() => setDetail(null)}>
        <div className="su-modal" onClick={e => e.stopPropagation()}>
          <div className="su-modal-head">
            <h2>{detail.name}</h2>
            <button className="su-close" onClick={() => setDetail(null)} aria-label="Close"><X size={16} /></button>
          </div>
          <div className="su-detail-head">
            <span className={detail.status === 'active' ? 'su-badge' : 'su-badge su-badge-paused'}>{detail.status === 'active' ? 'Active' : 'Paused'}</span>
            <span className="su-detail-amount">{money(detail.amount)} / month</span>
          </div>
          <h3 className="su-subhead">Investment Settings</h3>
          <div className="su-detail-grid">
            <div className="su-stat"><small>Investment percentage</small><strong>{detail.percent}%</strong></div>
            <div className="su-stat"><small>Amount per payment</small><strong>{money(detail.amount * detail.percent / 100)}</strong></div>
            <div className="su-stat"><small>Investment asset</small><strong>{detail.asset}</strong></div>
            <div className="su-stat"><small>Next payment</small><strong>{detail.nextLong}</strong></div>
            <div className="su-stat"><small>Estimated monthly investment</small><strong>{money(detail.amount * detail.percent / 100)}</strong></div>
          </div>
          <div className="su-modal-actions">
            <button className="ov-btn primary" onClick={() => setDetail(null)}>Save Changes</button>
          </div>
          <div className="su-modal-actions su-modal-actions-left">
            <button className="ov-btn">Pause Subscription</button>
            <button className="ov-btn su-danger">Delete Subscription</button>
          </div>
          <p className="su-note">Pausing or deleting a subscription stops future investment activity. Your existing investments and ownership are not affected.</p>
        </div>
      </div>
    )}
  </DashboardShell>
}

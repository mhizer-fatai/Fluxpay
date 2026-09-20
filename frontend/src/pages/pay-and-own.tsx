import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, Percent, TrendingUp, Wallet } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'

const metrics = [
  { label: 'Invested This Month', value: '$18.42', note: 'Across 6 subscriptions', icon: TrendingUp },
  { label: 'Ownership Built', value: '$18.42', note: 'All-time', icon: Wallet },
  { label: 'Active Subscriptions', value: '6', note: '2 paused', icon: CalendarDays },
  { label: 'Investment Rate', value: '2.4%', note: 'average', icon: Percent },
]

const investments = [
  { name: 'Spotify', detail: 'Subscription payment → Investment', amount: '+$0.24', when: 'Today' },
  { name: 'Alphabet', detail: 'YouTube Premium → Investment', amount: '+$0.42', when: 'Yesterday' },
  { name: 'Netflix', detail: 'Netflix payment → Investment', amount: '+$0.31', when: 'Sep 17' },
]

const growth = [8, 12, 17, 24, 31, 40, 52, 63, 74, 88, 101, 118]
const growthRanges = ['1M', '3M', '6M', '1Y']

function OwnershipChart() {
  const max = Math.max(...growth)
  return (
    <div className="po-bars" aria-hidden="true">
      {growth.map((v, i) => <span key={i} style={{ height: `${(v / max) * 100}%` }} />)}
    </div>
  )
}

export default function PayAndOwnPage() {
  const [range, setRange] = useState('3M')
  const settingsRef = useRef<HTMLDivElement>(null)
  const scrollToSettings = () => settingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return <DashboardShell>
    <section className="dashboard-content po">
      <div className="po-head">
        <div>
          <h1>Pay &amp; Own</h1>
          <p className="po-support">Set your investment preferences, connect them to your subscriptions, and let FluxPay turn a portion of your spending into ownership.</p>
        </div>
        <div className="po-head-actions">
          <button className="ov-btn primary" onClick={scrollToSettings}>Configure</button>
          <div className="po-status">
            <span>Auto-Invest Setting</span>
            <em><i /> Active</em>
          </div>
        </div>
      </div>

      <div className="po-metrics">
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

      <div className="po-card">
        <div className="po-section-head">
          <div>
            <strong className="po-big">$86.42 invested</strong>
            <em className="po-return">+12.8% portfolio return</em>
          </div>
          <div className="po-ranges">
            {growthRanges.map(r => <button key={r} className={r === range ? 'on' : ''} onClick={() => setRange(r)}>{r}</button>)}
          </div>
        </div>
        <OwnershipChart />
        <p className="po-chart-label">Invested over time</p>
      </div>

      <div className="po-card">
        <div className="po-section-head">
          <h2>Recent investments</h2>
          <Link className="ov-link" to="/activity">View Investment Activity <ArrowRight size={14} /></Link>
        </div>
        <div className="po-list">
          {investments.map(inv => (
            <div className="po-inv" key={inv.name}>
              <span className="po-inv-logo">{inv.name[0]}</span>
              <div className="po-inv-name"><strong>{inv.name}</strong><small>{inv.detail}</small></div>
              <span className="po-inv-amount">{inv.amount}</span>
              <span className="po-inv-when">{inv.when}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="po-card po-settings-card" ref={settingsRef}>
        <div className="po-section-head">
          <h2>Automation settings</h2>
          <div className="po-settings-actions">
            <button className="ov-btn">Edit</button>
            <button className="po-pause">Pause</button>
          </div>
        </div>
        <div className="po-settings">
          <div className="po-setting">
            <div><strong>Pay &amp; Own</strong><small>Automatically invest according to your subscription preferences.</small></div>
            <span className="po-toggle"><i /> ON</span>
          </div>
          <div className="po-setting">
            <div><strong>Minimum investment</strong><small>Only execute investments above your selected minimum.</small></div>
            <span className="po-value">$1.00</span>
          </div>
          <div className="po-setting">
            <div><strong>Investment funding</strong><small>The asset used to fund your investments.</small></div>
            <span className="po-value">USDC</span>
          </div>
        </div>
      </div>
    </section>
  </DashboardShell>
}

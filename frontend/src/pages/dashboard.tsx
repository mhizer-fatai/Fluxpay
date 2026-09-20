import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownLeft, ArrowLeftRight, ArrowRight, Bot, CalendarDays, CreditCard, Download,
  Link2, PieChart, Send, TrendingUp, Wallet, type LucideIcon,
} from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'

const ranges = ['1W', '1M', '3M', '6M', '1Y', 'ALL']

const holdings = [
  { asset: 'NVIDIA', value: '$820.40', ret: '+12.4%' },
  { asset: 'Alphabet', value: '$640.20', ret: '+7.8%' },
  { asset: 'Tesla', value: '$512.60', ret: '+5.2%' },
  { asset: 'Apple', value: '$390.30', ret: '+9.1%' },
]

const subscriptions = [
  { name: 'Spotify', amount: '$11.99', invested: '2%', next: 'Sep 24' },
  { name: 'YouTube Premium', amount: '$13.99', invested: '3%', next: 'Sep 27' },
  { name: 'Netflix', amount: '$15.49', invested: '2%', next: 'Oct 2' },
]

const activity: Array<{ title: string; type: string; amount: string; when: string; icon: LucideIcon }> = [
  { title: 'Spotify subscription', type: 'Payment', amount: '-$11.99', when: 'Today', icon: CreditCard },
  { title: 'NVIDIA investment', type: 'Investment', amount: '+$0.24', when: 'Today', icon: TrendingUp },
  { title: 'USDC received', type: 'Transfer', amount: '+$250.00', when: 'Yesterday', icon: ArrowDownLeft },
  { title: 'MON swapped for USDC', type: 'Swap', amount: '-$50.00', when: 'Sep 17', icon: ArrowLeftRight },
]

const quickActions: Array<{ label: string; icon: LucideIcon; href: string; soon?: boolean }> = [
  { label: 'Send', icon: Send, href: '/send' },
  { label: 'Receive', icon: ArrowDownLeft, href: '/receive' },
  { label: 'Swap', icon: ArrowLeftRight, href: '/swap', soon: true },
  { label: 'Payment Link', icon: Link2, href: '/payment-link' },
]

const portfolioSeries = [
  { label: 'Sep 1', value: 2210, y: 152 },
  { label: 'Sep 3', value: 2280, y: 142 },
  { label: 'Sep 5', value: 2195, y: 160 },
  { label: 'Sep 7', value: 2360, y: 128 },
  { label: 'Sep 9', value: 2310, y: 136 },
  { label: 'Sep 11', value: 2480, y: 102 },
  { label: 'Sep 13', value: 2420, y: 114 },
  { label: 'Sep 15', value: 2610, y: 76 },
  { label: 'Sep 17', value: 2540, y: 90 },
  { label: 'Sep 19', value: 2790, y: 54 },
  { label: 'Today', value: 2845.2, y: 64 },
]

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

function PortfolioChart() {
  const [hover, setHover] = useState<number | null>(null)
  const last = portfolioSeries.length - 1
  const line = portfolioSeries.map((p, i) => `${(i / last) * 600},${p.y}`).join(' ')
  const area = `0,200 ${line} 600,200`

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    setHover(Math.min(last, Math.max(0, Math.round(ratio * last))))
  }

  const pct = (i: number) => (i / last) * 100

  return (
    <div className="ov-chart-wrap" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg className="ov-chart" viewBox="0 0 600 200" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D35A44" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#D35A44" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#portfolioFill)" />
        <polyline points={line} fill="none" stroke="#D35A44" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {hover !== null && (
        <>
          <span className="ov-chart-line" style={{ left: `${pct(hover)}%` }} />
          <span className="ov-chart-dot" style={{ left: `${pct(hover)}%`, top: `${(portfolioSeries[hover].y / 200) * 100}%` }} />
          <span
            className="ov-chart-tip"
            style={{
              left: `${pct(hover)}%`,
              top: `${(portfolioSeries[hover].y / 200) * 100}%`,
              transform: hover === 0 ? 'translate(0,-140%)' : hover === last ? 'translate(-100%,-140%)' : 'translate(-50%,-140%)',
            }}
          >
            <strong>{money(portfolioSeries[hover].value)}</strong>
            <small>{portfolioSeries[hover].label}</small>
          </span>
        </>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const [range, setRange] = useState('1M')
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return <DashboardShell>
    <section className="dashboard-content ov">
      <div className="ov-welcome">
        <div>
          <h1>{greeting}, Timothy</h1>
          <p>Here&apos;s your financial overview.</p>
        </div>
        <div className="ov-welcome-actions">
          <button className="ov-btn primary"><Download size={15} /> Export</button>
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
                <h2>Your Portfolio</h2>
                <strong>$2,845.20</strong>
                <em className="up">+$221.40 (+8.42%)</em>
              </div>
              <div className="ov-ranges">
                {ranges.map(r => <button key={r} className={r === range ? 'on' : ''} onClick={() => setRange(r)}>{r}</button>)}
              </div>
            </div>
            <PortfolioChart />
            <div className="ov-holdings">
              {holdings.map(h => (
                <div className="ov-holding" key={h.asset}>
                  <span className="ov-asset">{h.asset}</span>
                  <span className="ov-holding-val">{h.value}</span>
                  <span className="ov-return up">{h.ret}</span>
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
            <strong>$4,280.50</strong>
            <em>Available balance</em>
          </div>
          <div className="ov-stat">
            <span className="ov-stat-icon"><TrendingUp size={16} /></span>
            <small>Portfolio Value</small>
            <strong>$2,845.20</strong>
            <em className="up">+8.42% all-time</em>
          </div>
          <div className="ov-stat">
            <span className="ov-stat-icon"><PieChart size={16} /></span>
            <small>Total Invested</small>
            <strong>$2,420.00</strong>
            <em>Across 6 assets</em>
          </div>
          <div className="ov-stat">
            <span className="ov-stat-icon"><CalendarDays size={16} /></span>
            <small>Subscription Spend</small>
            <strong>$86.47</strong>
            <em>This month</em>
          </div>
        </div>
      </div>

      <div className="ov-card">
        <div className="ov-card-head">
          <div>
            <h2>Your Subscriptions</h2>
            <p>Your active subscriptions and their investment activity.</p>
          </div>
          <Link className="ov-link" to="/subscriptions">View All <ArrowRight size={14} /></Link>
        </div>
        <div className="ov-list">
          {subscriptions.map(s => (
            <div className="ov-sub" key={s.name}>
              <span className="ov-sub-logo">{s.name[0]}</span>
              <div className="ov-sub-name"><strong>{s.name}</strong><small>{s.amount} / month</small></div>
              <span className="ov-pill">{s.invested} invested</span>
              <span className="ov-sub-next">Next payment: {s.next}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="ov-ai">
        <span className="ov-ai-icon"><Bot size={20} /></span>
        <div className="ov-ai-text">
          <h2>Need to make a move?</h2>
          <p>Ask FluxPay AI to send, swap, pay, or manage your investments for you.</p>
        </div>
        <Link className="ov-btn primary" to="/terminal">Open Terminal <ArrowRight size={14} /></Link>
      </div>

      <div className="ov-card">
        <div className="ov-card-head">
          <div><h2>Recent Activity</h2></div>
          <Link className="ov-link" to="/activity">View All <ArrowRight size={14} /></Link>
        </div>
        <div className="ov-list">
          {activity.map(a => {
            const Icon = a.icon
            const positive = a.amount.startsWith('+')
            return (
              <div className="ov-tx" key={a.title}>
                <span className="ov-tx-icon"><Icon size={16} /></span>
                <div className="ov-tx-name"><strong>{a.title}</strong><small>{a.type}</small></div>
                <span className={`ov-tx-amount ${positive ? 'up' : 'down'}`}>{a.amount}</span>
                <span className="ov-tx-when">{a.when}</span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  </DashboardShell>
}

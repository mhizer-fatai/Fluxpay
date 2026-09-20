import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Boxes, Coins, Plus, TrendingUp, Wallet, X } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const metrics = [
  { label: 'Total Portfolio Value', value: '$2,845.20', note: 'Current market value', icon: Wallet },
  { label: 'Total Invested', value: '$2,420.00', note: 'Across 6 assets', icon: Coins },
  { label: 'Total Return', value: '+$425.20', note: '+17.57%', up: true, icon: TrendingUp },
  { label: 'Assets Owned', value: '6', note: 'Tokenized assets', icon: Boxes },
]

type Holding = { asset: string; owned: string; value: number; cost: number; ret: number; color: string }

const holdings: Holding[] = [
  { asset: 'NVIDIA', owned: '2.84', value: 820.40, cost: 710.00, ret: 15.55, color: '#D35A44' },
  { asset: 'Alphabet', owned: '3.12', value: 640.20, cost: 580.00, ret: 10.38, color: '#2f3b3a' },
  { asset: 'Tesla', owned: '1.91', value: 512.60, cost: 470.00, ret: 9.06, color: '#43504e' },
  { asset: 'Apple', owned: '2.04', value: 390.30, cost: 350.00, ret: 11.51, color: '#7ab8f5' },
  { asset: 'Meta', owned: '0.81', value: 310.20, cost: 250.00, ret: 24.08, color: '#f5a623' },
]

const allocation = [
  { name: 'NVIDIA', pct: 28.8, color: '#D35A44' },
  { name: 'Alphabet', pct: 22.5, color: '#2f3b3a' },
  { name: 'Tesla', pct: 18.0, color: '#43504e' },
  { name: 'Apple', pct: 13.7, color: '#7ab8f5' },
  { name: 'Meta', pct: 10.9, color: '#f5a623' },
  { name: 'Other', pct: 6.1, color: '#d7dbda' },
]

const spendingSources = [
  { name: 'Spotify', amount: 4.82 },
  { name: 'YouTube Premium', amount: 6.14 },
  { name: 'Netflix', amount: 3.76 },
  { name: 'Meta AI', amount: 2.91 },
  { name: 'Other', amount: 7.28 },
]

const ranges = ['1W', '1M', '3M', '6M', '1Y', 'ALL']
const modes = ['Value', 'Return']

const performanceSeries = [
  { label: 'Sep 1', value: 2420, y: 150 },
  { label: 'Sep 3', value: 2455, y: 145 },
  { label: 'Sep 5', value: 2440, y: 152 },
  { label: 'Sep 7', value: 2510, y: 132 },
  { label: 'Sep 9', value: 2495, y: 138 },
  { label: 'Sep 11', value: 2570, y: 118 },
  { label: 'Sep 13', value: 2605, y: 110 },
  { label: 'Sep 15', value: 2640, y: 98 },
  { label: 'Sep 17', value: 2620, y: 104 },
  { label: 'Sep 19', value: 2790, y: 64 },
  { label: 'Today', value: 2845.2, y: 54 },
]

function PerformanceChart() {
  const [hover, setHover] = useState<number | null>(null)
  const last = performanceSeries.length - 1
  const line = performanceSeries.map((p, i) => `${(i / last) * 600},${p.y}`).join(' ')
  const area = `0,200 ${line} 600,200`

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    setHover(Math.min(last, Math.max(0, Math.round(ratio * last))))
  }

  const pct = (i: number) => (i / last) * 100

  return (
    <div className="pf-chart-wrap" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg className="pf-chart" viewBox="0 0 600 200" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="pfFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D35A44" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#D35A44" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#pfFill)" />
        <polyline points={line} fill="none" stroke="#D35A44" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {hover !== null && (
        <>
          <span className="pf-chart-line" style={{ left: `${pct(hover)}%` }} />
          <span className="pf-chart-dot" style={{ left: `${pct(hover)}%`, top: `${(performanceSeries[hover].y / 200) * 100}%` }} />
          <span
            className="pf-chart-tip"
            style={{
              left: `${pct(hover)}%`,
              top: `${(performanceSeries[hover].y / 200) * 100}%`,
              transform: hover === 0 ? 'translate(0,-140%)' : hover === last ? 'translate(-100%,-140%)' : 'translate(-50%,-140%)',
            }}
          >
            <strong>{money(performanceSeries[hover].value)}</strong>
            <small>{performanceSeries[hover].label}</small>
          </span>
        </>
      )}
    </div>
  )
}

function AllocationDonut() {
  let cumulative = 0
  return (
    <svg viewBox="0 0 42 42" className="pf-donut" aria-hidden="true">
      <circle cx="21" cy="21" r="15.9155" fill="none" stroke="#f0f0f0" strokeWidth="6" />
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

export default function PortfolioPage() {
  const [range, setRange] = useState('1M')
  const [mode, setMode] = useState('Value')
  const [asset, setAsset] = useState<Holding | null>(null)
  const totalFromSpending = spendingSources.reduce((sum, s) => sum + s.amount, 0)

  return <DashboardShell>
    <section className="dashboard-content pf">
      <div className="pf-head">
        <div>
          <h1>Portfolio</h1>
          <p className="pf-support">See your investments, performance, and ownership history as your everyday spending turns into long-term ownership.</p>
        </div>
        <div className="pf-head-actions">
          <Link className="ov-btn primary" to="/pay-and-own"><Plus size={15} /> Invest</Link>
          <button className="ov-btn">Withdraw to Wallet</button>
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
        <div className="pf-card-head">
          <div>
            <h2>Portfolio Performance</h2>
            <strong className="pf-big">$2,845.20</strong>
            <em className="pf-return">+$425.20 (+17.57%)</em>
          </div>
          <div className="pf-controls">
            <div className="pf-seg">
              {modes.map(m => <button key={m} className={m === mode ? 'on' : ''} onClick={() => setMode(m)}>{m}</button>)}
            </div>
            <div className="pf-ranges">
              {ranges.map(r => <button key={r} className={r === range ? 'on' : ''} onClick={() => setRange(r)}>{r}</button>)}
            </div>
          </div>
        </div>
        <PerformanceChart />
      </div>

      <div className="pf-card">
        <div className="pf-section-head"><h2>Your Holdings</h2></div>
        <div className="pf-table">
          <div className="pf-tr pf-th"><span>Asset</span><span>Owned</span><span>Value</span><span>Avg. Cost</span><span>Return</span></div>
          {holdings.map(h => (
            <button className="pf-tr pf-holding" key={h.asset} onClick={() => setAsset(h)}>
              <span className="pf-asset"><i style={{ background: h.color }} />{h.asset}</span>
              <span>{h.owned}</span>
              <span>{money(h.value)}</span>
              <span>{money(h.cost)}</span>
              <span className="pf-up">+{h.ret.toFixed(2)}%</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pf-split">
        <div className="pf-card">
          <div className="pf-section-head"><h2>Portfolio Allocation</h2></div>
          <div className="pf-allocation">
            <AllocationDonut />
            <div className="pf-legend">
              {allocation.map(a => (
                <div className="pf-legend-row" key={a.name}>
                  <span className="pf-legend-name"><i style={{ background: a.color }} />{a.name}</span>
                  <strong>{a.pct}%</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="pf-card">
          <div className="pf-section-head"><h2>Built From Your Spending</h2></div>
          <div className="pf-list">
            {spendingSources.map(s => (
              <div className="pf-source" key={s.name}>
                <span className="pf-source-name">{s.name}</span>
                <strong>{money(s.amount)} invested</strong>
              </div>
            ))}
          </div>
          <div className="pf-total"><span>Total from Pay &amp; Own</span><strong>{money(totalFromSpending)}</strong></div>
          <Link className="ov-link" to="/pay-and-own">View Pay &amp; Own <ArrowRight size={14} /></Link>
        </div>
      </div>
    </section>

    {asset && (
      <div className="pf-modal-backdrop" onClick={() => setAsset(null)}>
        <div className="pf-modal" onClick={e => e.stopPropagation()}>
          <div className="pf-modal-head">
            <h2>{asset.asset}</h2>
            <button className="pf-close" onClick={() => setAsset(null)} aria-label="Close"><X size={16} /></button>
          </div>
          <div className="pf-detail-grid">
            <div className="su-stat"><small>Units owned</small><strong>{asset.owned}</strong></div>
            <div className="su-stat"><small>Current value</small><strong>{money(asset.value)}</strong></div>
            <div className="su-stat"><small>Average cost</small><strong>{money(asset.cost)}</strong></div>
            <div className="su-stat"><small>Total return</small><strong className="pf-up">+{asset.ret.toFixed(2)}%</strong></div>
          </div>
          <p className="pf-note">Ownership is built automatically from your subscription payments through Pay &amp; Own.</p>
          <div className="pf-modal-actions">
            <Link className="ov-btn primary" to="/pay-and-own">Invest More</Link>
          </div>
        </div>
      </div>
    )}
  </DashboardShell>
}

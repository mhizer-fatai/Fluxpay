import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowLeftRight, ArrowRight, CreditCard, Download, Link2, Search, TrendingUp, X, type LucideIcon } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'

const metrics = [
  { label: 'Total Spent', value: '$486.72', note: 'This month' },
  { label: 'Total Invested', value: '$24.91', note: 'This month' },
  { label: 'Money Received', value: '$850.00', note: 'This month' },
  { label: 'Transactions', value: '42', note: 'This month' },
]

type Tx = {
  id: string
  date: string
  dateLong: string
  daysAgo: number
  type: 'Investment' | 'Payment' | 'Swap' | 'Transfer' | 'Payment Link'
  details: string
  amount: string
  positive: boolean
  status: 'Completed' | 'Pending' | 'Failed'
  asset?: string
  source?: string
  subscriptionPayment?: string
  investmentRate?: string
  investmentAmount?: string
  ownedAsset?: string
  network: string
  txId: string
}

const transactions: Tx[] = [
  { id: 't1', date: 'Sep 18', dateLong: 'September 18, 2026 — 10:42 AM', daysAgo: 1, type: 'Investment', details: 'Spotify → NVIDIA', amount: '+$0.24', positive: true, status: 'Completed', asset: 'USDC', source: 'Spotify subscription', subscriptionPayment: '$11.99', investmentRate: '2%', investmentAmount: '$0.24 USDC', ownedAsset: 'NVIDIA tokenized asset', network: 'Monad', txId: '0x8f2...a91' },
  { id: 't2', date: 'Sep 18', dateLong: 'September 18, 2026 — 10:42 AM', daysAgo: 1, type: 'Payment', details: 'Spotify Premium', amount: '-$11.99', positive: false, status: 'Completed', asset: 'USDC', source: 'Spotify subscription', network: 'Monad', txId: '0x3c1...7be' },
  { id: 't3', date: 'Sep 17', dateLong: 'September 17, 2026 — 9:15 AM', daysAgo: 2, type: 'Investment', details: 'YouTube → Alphabet', amount: '+$0.42', positive: true, status: 'Completed', asset: 'USDC', source: 'YouTube Premium', subscriptionPayment: '$13.99', investmentRate: '3%', investmentAmount: '$0.42 USDC', ownedAsset: 'Alphabet tokenized asset', network: 'Monad', txId: '0x9d4...2fa' },
  { id: 't4', date: 'Sep 17', dateLong: 'September 17, 2026 — 8:03 AM', daysAgo: 2, type: 'Swap', details: 'MON → USDC', amount: '-$50.00', positive: false, status: 'Completed', asset: 'MON', network: 'Monad', txId: '0x77a...c10' },
  { id: 't5', date: 'Sep 16', dateLong: 'September 16, 2026 — 4:27 PM', daysAgo: 3, type: 'Transfer', details: 'Received from 0x7A...', amount: '+$250.00', positive: true, status: 'Completed', asset: 'USDC', network: 'Monad', txId: '0x1b8...9dd' },
  { id: 't6', date: 'Sep 15', dateLong: 'September 15, 2026 — 1:12 PM', daysAgo: 4, type: 'Payment Link', details: 'Invoice #FLX2041', amount: '+$75.00', positive: true, status: 'Completed', asset: 'USDC', network: 'Monad', txId: '0x5e0...4ac' },
  { id: 't7', date: 'Sep 14', dateLong: 'September 14, 2026 — 7:48 PM', daysAgo: 5, type: 'Payment', details: 'Netflix', amount: '-$15.49', positive: false, status: 'Pending', asset: 'USDC', source: 'Netflix', network: 'Monad', txId: '0x2aa...88f' },
  { id: 't8', date: 'Sep 13', dateLong: 'September 13, 2026 — 11:05 AM', daysAgo: 6, type: 'Investment', details: 'Netflix → Netflix', amount: '+$0.31', positive: true, status: 'Completed', asset: 'USDC', source: 'Netflix', subscriptionPayment: '$15.49', investmentRate: '2%', investmentAmount: '$0.31 USDC', ownedAsset: 'Netflix tokenized asset', network: 'Monad', txId: '0x6f3...b27' },
  { id: 't9', date: 'Sep 12', dateLong: 'September 12, 2026 — 2:33 PM', daysAgo: 7, type: 'Payment', details: 'Meta AI', amount: '-$19.99', positive: false, status: 'Failed', asset: 'USDC', source: 'Meta AI', network: 'Monad', txId: '0x0d7...e64' },
]

const typeMeta: Record<Tx['type'], { icon: LucideIcon; category: string }> = {
  Investment: { icon: TrendingUp, category: 'Investments' },
  Payment: { icon: CreditCard, category: 'Payments' },
  Swap: { icon: ArrowLeftRight, category: 'Swaps' },
  Transfer: { icon: ArrowDownLeft, category: 'Transfers' },
  'Payment Link': { icon: Link2, category: 'Payment Links' },
}

const categories = ['All', 'Payments', 'Investments', 'Transfers', 'Swaps', 'Payment Links']
const dateOptions = ['Today', 'This week', 'This month', 'Custom']
const statusOptions = ['All statuses', 'Completed', 'Pending', 'Failed']
const assetOptions = ['All assets', 'USDC', 'MON']

export default function ActivityPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [dateFilter, setDateFilter] = useState('This month')
  const [statusFilter, setStatusFilter] = useState('All statuses')
  const [assetFilter, setAssetFilter] = useState('All assets')
  const [detail, setDetail] = useState<Tx | null>(null)

  const filtered = useMemo(() => transactions.filter(t => {
    if (category !== 'All' && typeMeta[t.type].category !== category) return false
    if (statusFilter !== 'All statuses' && t.status !== statusFilter) return false
    if (assetFilter !== 'All assets' && t.asset !== assetFilter) return false
    if (dateFilter === 'Today' && t.daysAgo !== 0) return false
    if (dateFilter === 'This week' && t.daysAgo > 7) return false
    if (dateFilter === 'This month' && t.daysAgo > 31) return false
    if (search) {
      const q = search.toLowerCase()
      if (!`${t.details} ${t.type} ${t.amount}`.toLowerCase().includes(q)) return false
    }
    return true
  }), [search, category, dateFilter, statusFilter, assetFilter])

  return <DashboardShell>
    <section className="dashboard-content ac">
      <div className="ac-head">
        <div>
          <h1>Activity</h1>
          <p className="ac-support">Track payments, investments, transfers, swaps, and ownership activity with a complete record of your transactions.</p>
        </div>
        <button className="ov-btn primary"><Download size={15} /> Export Activity</button>
      </div>

      <div className="ac-metrics">
        {metrics.map(m => (
          <div className="ov-stat" key={m.label}>
            <small>{m.label}</small>
            <strong>{m.value}</strong>
            <em>{m.note}</em>
          </div>
        ))}
      </div>

      <div className="ac-card">
        <div className="ac-section-head"><h2>Transaction History</h2></div>

        <div className="ac-search">
          <Search size={15} />
          <input placeholder="Search transactions..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="ac-filters">
          <div className="ac-cats">
            {categories.map(c => <button key={c} className={c === category ? 'on' : ''} onClick={() => setCategory(c)}>{c}</button>)}
          </div>
          <div className="ac-selects">
            <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} aria-label="Date">{dateOptions.map(o => <option key={o}>{o}</option>)}</select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Status">{statusOptions.map(o => <option key={o}>{o}</option>)}</select>
            <select value={assetFilter} onChange={e => setAssetFilter(e.target.value)} aria-label="Asset">{assetOptions.map(o => <option key={o}>{o}</option>)}</select>
          </div>
        </div>

        <div className="ac-table">
          <div className="ac-tr ac-th"><span>Date</span><span>Activity</span><span>Details</span><span>Amount</span><span>Status</span></div>
          {filtered.map(t => {
            const Icon = typeMeta[t.type].icon
            return (
              <button className="ac-tr ac-row" key={t.id} onClick={() => setDetail(t)}>
                <span>{t.date}</span>
                <span className="ac-type"><span className="ac-type-icon"><Icon size={14} /></span>{t.type}</span>
                <span>{t.details}</span>
                <span className={`ac-amount ${t.positive ? 'up' : ''}`}>{t.amount}</span>
                <span className={`ac-status ${t.status.toLowerCase()}`}>{t.status}</span>
              </button>
            )
          })}
          {filtered.length === 0 && <p className="ac-empty">No transactions match your filters.</p>}
        </div>

        <div className="ac-pagination">
          <p>Showing 1–{filtered.length} of {filtered.length} transactions</p>
          <div className="ac-pages">
            <button disabled>← Previous</button>
            <button className="on">1</button>
            <button disabled>Next →</button>
          </div>
          <button className="ov-btn ac-loadmore">Load More</button>
        </div>
      </div>
    </section>

    {detail && (
      <div className="ac-modal-backdrop" onClick={() => setDetail(null)}>
        <div className="ac-modal" onClick={e => e.stopPropagation()}>
          <div className="ac-modal-head">
            <h2>{detail.type}</h2>
            <button className="ac-close" onClick={() => setDetail(null)} aria-label="Close"><X size={16} /></button>
          </div>
          <p className="ac-detail-sub">{detail.details}</p>
          <div className={`ac-detail-amount ${detail.positive ? 'up' : ''}`}>{detail.amount}</div>
          <span className={`ac-status ${detail.status.toLowerCase()}`}>{detail.status}</span>

          {detail.type === 'Investment' && (
            <div className="ac-flow">
              <div className="ac-flow-col"><small>You Paid</small><strong>{detail.source?.replace(' subscription', '')}</strong><b>{detail.subscriptionPayment}</b></div>
              <ArrowRight size={16} />
              <div className="ac-flow-col"><small>FluxPay Invested</small><strong>{detail.investmentAmount}</strong></div>
              <ArrowRight size={16} />
              <div className="ac-flow-col"><small>You Own</small><strong>{detail.ownedAsset?.replace(' tokenized asset', '')}</strong><b>{detail.subscriptionPayment && detail.investmentAmount ? detail.investmentAmount.split(' ')[0] : ''}</b></div>
            </div>
          )}

          <div className="ac-fields">
            <div className="ac-field"><span>Date</span><strong>{detail.dateLong}</strong></div>
            {detail.source && <div className="ac-field"><span>Source</span><strong>{detail.source}</strong></div>}
            {detail.subscriptionPayment && <div className="ac-field"><span>Subscription payment</span><strong>{detail.subscriptionPayment}</strong></div>}
            {detail.investmentRate && <div className="ac-field"><span>Investment rate</span><strong>{detail.investmentRate}</strong></div>}
            {detail.investmentAmount && <div className="ac-field"><span>Investment amount</span><strong>{detail.investmentAmount}</strong></div>}
            {detail.ownedAsset && <div className="ac-field"><span>Asset</span><strong>{detail.ownedAsset}</strong></div>}
            <div className="ac-field"><span>Network</span><strong>{detail.network}</strong></div>
            <div className="ac-field"><span>Transaction ID</span><strong>{detail.txId}</strong></div>
          </div>

          <button className="ov-link ac-explorer">View on Explorer <ArrowRight size={14} /></button>
        </div>
      </div>
    )}
  </DashboardShell>
}

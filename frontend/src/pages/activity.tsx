import { useEffect, useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Download, Search, X, type LucideIcon } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { useProfile } from '@/hooks/profile'
import { fetchActivity, type ActivityItem } from '@/lib/activity'
import { getUsdPrices, TOKENS } from '@/lib/chain'
import { money, shortAddr, timeAgo } from '@/lib/format'
import { EXPLORER_URL } from '@/lib/chain'

const PAGE_SIZE = 10

type Kind = 'All' | 'Sent' | 'Received'

export default function ActivityPage() {
  const { address } = useProfile()
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<Kind>('All')
  const [dateFilter, setDateFilter] = useState('All time')
  const [assetFilter, setAssetFilter] = useState('All assets')
  const [detail, setDetail] = useState<ActivityItem | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!address) return
    setLoading(true)
    setError('')
    fetchActivity(address, 40_000)
      .then(setItems)
      .catch(e => setError((e as Error).message || 'Failed to load activity'))
      .finally(() => setLoading(false))
  }, [address])

  const prices = useMemo(() => ({ current: null as Record<string, number> | null }), [])
  useEffect(() => { void getUsdPrices().then(p => { prices.current = p }) }, [])

  const assetOptions = useMemo(
    () => ['All assets', ...TOKENS.filter(t => items.some(i => i.token === t.key)).map(t => t.key)],
    [items],
  )

  const filtered = useMemo(() => items.filter(i => {
    if (kind === 'Sent' && i.kind !== 'sent') return false
    if (kind === 'Received' && i.kind !== 'received') return false
    if (assetFilter !== 'All assets' && i.token !== assetFilter) return false
    if (dateFilter !== 'All time') {
      const ageDays = (Date.now() / 1000 - i.ts) / 86400
      if (dateFilter === 'Today' && ageDays >= 1) return false
      if (dateFilter === 'This week' && ageDays > 7) return false
      if (dateFilter === 'This month' && ageDays > 31) return false
    }
    if (search) {
      const q = search.toLowerCase()
      if (!`${i.hash} ${i.token ?? ''} ${i.counterparty} ${i.event}`.toLowerCase().includes(q)) return false
    }
    return true
  }), [items, kind, assetFilter, dateFilter, search])

  const usdOf = (i: ActivityItem) => (prices.current && i.token ? i.amount * (prices.current[i.token] ?? 0) : 0)
  const totals = useMemo(() => {
    let sent = 0, received = 0
    for (const i of filtered) {
      const usd = usdOf(i)
      if (i.kind === 'sent') sent += usd
      else received += usd
    }
    return { sent, received, count: filtered.length }
  }, [filtered]) // eslint-disable-line react-hooks/exhaustive-deps

  const exportCsv = () => {
    const header = 'date,type,token,amount,counterparty,tx\n'
    const body = filtered
      .map(i => `${new Date(i.ts * 1000).toISOString()},${i.event},${i.token ?? ''},${i.amount},${i.counterparty},${i.hash}`)
      .join('\n')
    const blob = new Blob([header + body], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'fluxpay-activity.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const TypeIcon: Record<string, LucideIcon> = { PaymentSettled: ArrowUpRight, Transfer: ArrowDownLeft }

  return <DashboardShell>
    <section className="dashboard-content ac">
      <div className="ac-head">
        <div>
          <h1>Activity</h1>
          <p className="ac-support">Your real on-chain history: FluxPay settlements and token transfers, read straight from Monad.</p>
        </div>
        <button className="ov-btn primary" onClick={exportCsv} disabled={exporting || filtered.length === 0}><Download size={15} /> Export Activity</button>
      </div>

      <div className="ac-metrics">
        <div className="ov-stat"><small>Total Sent</small><strong>{money(totals.sent)}</strong><em>USD value</em></div>
        <div className="ov-stat"><small>Total Received</small><strong>{money(totals.received)}</strong><em>USD value</em></div>
        <div className="ov-stat"><small>Transactions</small><strong>{totals.count}</strong><em>Matching filters</em></div>
      </div>

      <div className="ac-card">
        <div className="ac-section-head"><h2>Transaction History</h2></div>

        <div className="ac-search">
          <Search size={15} />
          <input placeholder="Search by hash, token, or address..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="ac-filters">
          <div className="ac-cats">
            {(['All', 'Sent', 'Received'] as Kind[]).map(c => <button key={c} className={c === kind ? 'on' : ''} onClick={() => { setKind(c); setVisible(PAGE_SIZE) }}>{c}</button>)}
          </div>
          <div className="ac-selects">
            <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} aria-label="Date">
              {['All time', 'Today', 'This week', 'This month'].map(o => <option key={o}>{o}</option>)}
            </select>
            <select value={assetFilter} onChange={e => setAssetFilter(e.target.value)} aria-label="Asset">
              {assetOptions.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        </div>

        <div className="ac-table">
          <div className="ac-tr ac-th"><span>Date</span><span>Type</span><span>Counterparty</span><span>Amount</span><span>Status</span></div>
          {loading && <p className="ac-empty">Reading on-chain history…</p>}
          {error && <p className="ac-empty">{error}</p>}
          {!loading && !error && filtered.slice(0, visible).map((t, idx) => {
            const Icon = TypeIcon[t.event] ?? ArrowUpRight
            return (
              <button className="ac-tr ac-row" key={`${t.hash}-${idx}`} onClick={() => setDetail(t)}>
                <span>{timeAgo(t.ts)}</span>
                <span className="ac-type"><span className="ac-type-icon"><Icon size={14} /></span>{t.event === 'PaymentSettled' ? 'Payment' : 'Transfer'}</span>
                <span>{shortAddr(t.counterparty)}</span>
                <span className={`ac-amount ${t.kind === 'received' ? 'up' : ''}`}>{t.kind === 'received' ? '+' : '−'}{t.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} {t.token ?? ''}</span>
                <span className="ac-status completed">Confirmed</span>
              </button>
            )
          })}
          {!loading && !error && filtered.length === 0 && <p className="ac-empty">No on-chain transactions match your filters.</p>}
        </div>

        <div className="ac-pagination">
          <p>Showing 1–{Math.min(visible, filtered.length)} of {filtered.length} transactions</p>
          <button className="ov-btn ac-loadmore" onClick={() => setVisible(v => v + PAGE_SIZE)} disabled={visible >= filtered.length}>Load More</button>
        </div>
      </div>
    </section>

    {detail && (
      <div className="ac-modal-backdrop" onClick={() => setDetail(null)}>
        <div className="ac-modal" onClick={e => e.stopPropagation()}>
          <div className="ac-modal-head">
            <h2>{detail.event === 'PaymentSettled' ? 'FluxPay Payment' : 'Token Transfer'}</h2>
            <button className="ac-close" onClick={() => setDetail(null)} aria-label="Close"><X size={16} /></button>
          </div>
          <p className="ac-detail-sub">{detail.kind === 'received' ? 'Received' : 'Sent'} on Monad Testnet</p>
          <div className={`ac-detail-amount ${detail.kind === 'received' ? 'up' : ''}`}>
            {detail.kind === 'received' ? '+' : '−'}{detail.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} {detail.token ?? detail.tokenAddress}
          </div>
          <span className="ac-status completed">Confirmed</span>

          <div className="ac-fields">
            <div className="ac-field"><span>Date</span><strong>{detail.ts ? new Date(detail.ts * 1000).toLocaleString('en-US') : '—'}</strong></div>
            <div className="ac-field"><span>Block</span><strong>{detail.blockNumber.toString()}</strong></div>
            <div className="ac-field"><span>From</span><strong>{detail.kind === 'received' ? shortAddr(detail.counterparty) : 'You'}</strong></div>
            <div className="ac-field"><span>To</span><strong>{detail.kind === 'sent' ? shortAddr(detail.counterparty) : 'You'}</strong></div>
            <div className="ac-field"><span>Token</span><strong>{detail.token ?? detail.tokenAddress}</strong></div>
            <div className="ac-field"><span>Event</span><strong>{detail.event}</strong></div>
            <div className="ac-field"><span>Transaction ID</span><strong style={{ wordBreak: 'break-all' }}>{detail.hash}</strong></div>
          </div>

          <a className="ov-link ac-explorer" href={`${EXPLORER_URL}/tx/${detail.hash}`} target="_blank" rel="noreferrer">View on Explorer <ArrowRight size={14} /></a>
        </div>
      </div>
    )}
  </DashboardShell>
}

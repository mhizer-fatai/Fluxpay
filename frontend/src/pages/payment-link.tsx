import { useState } from 'react'
import { Copy, MoreHorizontal, Plus, QrCode as QrCodeIcon, Search, Share2, X } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { Dropdown } from '@/components/dropdown'
import { QrCode } from '@/components/qr-code'

const metrics = [
  { label: 'Total Received', value: '$1,280.00' },
  { label: 'Active Links', value: '4' },
  { label: 'Pending Payments', value: '$350.00' },
  { label: 'Payments This Month', value: '18' },
]

type LinkItem = { id: string; title: string; amount: number; status: 'Pending' | 'Paid' | 'Expired'; created: string; description: string; expires: string }

const links: LinkItem[] = [
  { id: 'FLX-8291', title: 'Website Design', amount: 250, status: 'Pending', created: 'Sep 19', description: 'Payment for website design and development', expires: 'Never' },
  { id: 'FLX-7214', title: 'Logo Design', amount: 100, status: 'Paid', created: 'Sep 17', description: 'Brand logo design and revisions', expires: 'Never' },
  { id: 'FLX-6412', title: 'Consultation', amount: 75, status: 'Paid', created: 'Sep 15', description: 'One hour product consultation', expires: '7 days' },
  { id: 'FLX-5920', title: 'Subscription', amount: 20, status: 'Expired', created: 'Sep 10', description: 'Monthly plan subscription', expires: '24 hours' },
]

const filters = ['All', 'Active', 'Paid', 'Pending', 'Expired']
const receiveOptions = ['USDC', 'MON']
const expirationOptions = ['Never', '24 hours', '7 days', 'Custom date']

export default function PaymentLinkPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [generated, setGenerated] = useState<{ title: string; amount: string; id: string } | null>(null)
  const [detail, setDetail] = useState<LinkItem | null>(null)
  const [preview, setPreview] = useState<{ title: string; amount: string; description: string } | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [copied, setCopied] = useState('')
  const [form, setForm] = useState({ title: 'Website Design', amount: '$250.00', asset: 'USDC', description: 'Payment for website design and development', expiration: 'Never', reference: 'FLX-2026-001' })

  const filtered = links.filter(l => {
    if (filter === 'Active' && l.status !== 'Pending') return false
    if (filter !== 'All' && filter !== 'Active' && l.status !== filter) return false
    if (search && !`${l.title} ${l.id}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).catch(() => {})
    setCopied(key)
    setTimeout(() => setCopied(''), 1600)
  }
  const share = async (title: string, url: string) => {
    if (navigator.share) {
      try { await navigator.share({ title, url }) } catch { /* ignore */ }
    } else copy(url, url)
  }
  const createLink = () => {
    setGenerated({ title: form.title, amount: form.amount, id: 'FLX-9021' })
    setCreateOpen(false)
  }

  return <DashboardShell>
    <section className="dashboard-content pl">
      <div className="pl-head">
        <div>
          <h1>Payment Links</h1>
          <p className="pl-support">Create a payment request, share it anywhere, and receive supported assets directly into your FluxPay wallet.</p>
        </div>
        <button className="ov-btn primary" onClick={() => setCreateOpen(true)}><Plus size={15} /> Create Payment Link</button>
      </div>

      <div className="pl-metrics">
        {metrics.map(m => (
          <div className="ov-stat" key={m.label}><small>{m.label}</small><strong>{m.value}</strong></div>
        ))}
      </div>

      <div className="pl-card">
        <div className="pl-section-head"><h2>Your Payment Links</h2></div>
        <div className="pl-search">
          <Search size={15} />
          <input placeholder="Search payment links..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="pl-filters">
          {filters.map(f => <button key={f} className={f === filter ? 'on' : ''} onClick={() => setFilter(f)}>{f}</button>)}
        </div>
        <div className="pl-table">
          <div className="pl-tr pl-th"><span>Payment</span><span>Amount</span><span>Status</span><span>Created</span><span /></div>
          {filtered.map(l => (
            <button className="pl-tr pl-row" key={l.id} onClick={() => setDetail(l)}>
              <span className="pl-title">{l.title}</span>
              <span>${l.amount.toFixed(2)}</span>
              <span className={`pl-status ${l.status.toLowerCase()}`}>{l.status}</span>
              <span>{l.created}</span>
              <span className="pl-more"><MoreHorizontal size={16} /></span>
            </button>
          ))}
          {filtered.length === 0 && <p className="pl-empty">No payment links match your search.</p>}
        </div>
      </div>
    </section>

    {createOpen && (
      <div className="pl-modal-backdrop" onClick={() => setCreateOpen(false)}>
        <div className="pl-modal" onClick={e => e.stopPropagation()}>
          <div className="pl-modal-head"><h2>Create Payment Link</h2><button className="pl-close" onClick={() => setCreateOpen(false)} aria-label="Close"><X size={16} /></button></div>
          <div className="pl-field"><label>Payment title</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
          <div className="pl-field"><label>Amount</label><input value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="pl-field"><label>Receive in</label><Dropdown value={form.asset} options={receiveOptions.map(o => ({ value: o, label: o }))} onChange={v => setForm({ ...form, asset: v })} /></div>
          <div className="pl-field"><label>Description</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          <div className="pl-field"><label>Expiration</label><Dropdown value={form.expiration} options={expirationOptions.map(o => ({ value: o, label: o }))} onChange={v => setForm({ ...form, expiration: v })} /></div>
          <div className="pl-field"><label>Payment reference <span className="pl-optional">(optional)</span></label><input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} /></div>
          <div className="pl-modal-actions">
            <button className="ov-btn" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="ov-btn primary" onClick={createLink}>Create Payment Link</button>
          </div>
        </div>
      </div>
    )}

    {generated && (
      <div className="pl-modal-backdrop" onClick={() => setGenerated(null)}>
        <div className="pl-modal pl-modal-center" onClick={e => e.stopPropagation()}>
          <div className="pl-modal-head"><h2>Payment Link Created</h2><button className="pl-close" onClick={() => setGenerated(null)} aria-label="Close"><X size={16} /></button></div>
          <div className="pl-created">
            <strong>{generated.title}</strong>
            <span>{generated.amount} {form.asset}</span>
          </div>
          <p className="pl-url-label">Your payment link</p>
          <p className="pl-url">fluxpay.app/pay/{generated.id}</p>
          <div className="pl-modal-actions pl-actions-center">
            <button className="ov-btn primary" onClick={() => copy(`fluxpay.app/pay/${generated.id}`, 'gen')}><Copy size={14} /> {copied === 'gen' ? 'Copied' : 'Copy Link'}</button>
            <button className="ov-btn" onClick={() => share(generated.title, `fluxpay.app/pay/${generated.id}`)}><Share2 size={14} /> Share</button>
            <button className="ov-btn" onClick={() => setPreview({ title: generated.title, amount: generated.amount, description: form.description })}>View Payment Page</button>
          </div>
          <div className="pl-qr-wrap">
            <QrCode className="pl-qr" />
            <span>Scan to Pay</span>
          </div>
        </div>
      </div>
    )}

    {detail && (
      <div className="pl-modal-backdrop" onClick={() => setDetail(null)}>
        <div className="pl-modal" onClick={e => e.stopPropagation()}>
          <div className="pl-modal-head"><h2>{detail.title}</h2><button className="pl-close" onClick={() => setDetail(null)} aria-label="Close"><X size={16} /></button></div>
          <p className="pl-detail-amount">${detail.amount.toFixed(2)} USDC</p>
          <span className={`pl-status ${detail.status.toLowerCase()}`}>{detail.status}</span>
          <div className="pl-fields">
            <div className="pl-field-row"><span>Created</span><strong>September {detail.created.split(' ')[1]}, 2026</strong></div>
            <div className="pl-field-row"><span>Expires</span><strong>{detail.expires}</strong></div>
            <div className="pl-field-row"><span>Reference</span><strong>{detail.id}</strong></div>
            <div className="pl-field-row"><span>Description</span><strong>{detail.description}</strong></div>
          </div>
          <p className="pl-url-label">Payment URL</p>
          <p className="pl-url">fluxpay.app/pay/{detail.id}</p>
          <div className="pl-modal-actions pl-actions-center">
            <button className="ov-btn" onClick={() => copy(`fluxpay.app/pay/${detail.id}`, detail.id)}><Copy size={14} /> {copied === detail.id ? 'Copied' : 'Copy Link'}</button>
            <button className="ov-btn" onClick={() => share(detail.title, `fluxpay.app/pay/${detail.id}`)}><Share2 size={14} /> Share</button>
            <button className="ov-btn"><QrCodeIcon size={14} /> QR Code</button>
          </div>
          <div className="pl-activity">
            <div className="pl-field-row"><span>Created</span><strong>Sep {detail.created.split(' ')[1]}, 2026</strong></div>
            <div className="pl-field-row"><span>Opened</span><strong>Sep {detail.created.split(' ')[1]}, 2026</strong></div>
            <div className="pl-field-row"><span>Payment</span><strong className={detail.status === 'Paid' ? 'up' : ''}>{detail.status === 'Paid' ? `+$${detail.amount.toFixed(2)} USDC` : detail.status}</strong></div>
          </div>
          {detail.status === 'Paid' && <p className="pl-tx">Transaction: 0x8f2...a91 · View on Explorer →</p>}
        </div>
      </div>
    )}

    {preview && (
      <div className="pl-modal-backdrop" onClick={() => setPreview(null)}>
        <div className="pl-checkout" onClick={e => e.stopPropagation()}>
          <span className="pl-checkout-brand">FluxPay</span>
          <span className="pl-checkout-tag">Payment Request</span>
          <strong className="pl-checkout-title">{preview.title}</strong>
          <p className="pl-checkout-amount">{preview.amount}<em>USDC</em></p>
          <p className="pl-checkout-desc">{preview.description}</p>
          <button className="ov-btn primary pl-checkout-btn">Pay {preview.amount}</button>
          <span className="pl-checkout-powered">Powered by FluxPay</span>
        </div>
      </div>
    )}
  </DashboardShell>
}

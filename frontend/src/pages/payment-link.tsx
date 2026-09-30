import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, ExternalLink, MoreHorizontal, Plus, QrCode as QrCodeIcon, Search, Share2, X } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { SmartWalletGate } from '@/components/guard'
import { QrCode } from '@/components/qr-code'
import { useWallet } from '@/hooks/useWallet'
import { TOKENS, explorerTx, tokenByAddress } from '@/lib/chain'
import { createPaymentLink, fetchMyLinks, type PaymentLinkDto } from '@/lib/api'
import { linkUrl } from '@/lib/links'
import { money, timeAgo } from '@/lib/format'

const USDC = TOKENS.find(t => t.key === 'USDC')!

const amountOf = (l: PaymentLinkDto) => {
  const decimals = tokenByAddress(l.token)?.decimals ?? 6
  return Number(BigInt(l.amount)) / 10 ** decimals
}
const symbolOf = (l: PaymentLinkDto) => tokenByAddress(l.token)?.symbol ?? 'USDC'
const createdTs = (l: PaymentLinkDto) => Math.floor(new Date(l.createdAt).getTime() / 1000)

export default function PaymentLinkPage() {
  return <SmartWalletGate><PaymentLinkContent /></SmartWalletGate>
}

function PaymentLinkContent() {
  const navigate = useNavigate()
  // Links pay into the smart account — creator identity is smart-only.
  const { smartAddress } = useWallet()
  const address = smartAddress as string
  const [links, setLinks] = useState<PaymentLinkDto[]>([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [generated, setGenerated] = useState<PaymentLinkDto | null>(null)
  const [detail, setDetail] = useState<PaymentLinkDto | null>(null)
  const [previewLink, setPreviewLink] = useState<PaymentLinkDto | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [copied, setCopied] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({ title: '', amount: '', description: '' })

  const refresh = useCallback(async () => {
    if (!address) return
    setLoading(true)
    try {
      setLinks(await fetchMyLinks(address))
    } catch {
      setLinks([])
    } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const statusOf = (l: PaymentLinkDto) =>
    l.status === 'paid' ? 'Paid' : l.status === 'expired' ? 'Expired' : 'Pending'

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

  const createLink = async () => {
    setError('')
    if (!address) return setError('Wallet not ready')
    const amount = Number(form.amount.replace(/[^0-9.]/g, ''))
    if (!form.title.trim() || !amount || amount <= 0) return setError('Enter a title and a valid amount')
    setBusy('Creating link…')
    try {
      const rawAmount = BigInt(Math.round(amount * 10 ** USDC.decimals)).toString()
      const link = await createPaymentLink({
        creatorAddress: address,
        title: form.title.trim(),
        description: form.description.trim(),
        token: USDC.address!,
        amountRaw: rawAmount,
      })
      setGenerated(link)
      setCreateOpen(false)
      setForm({ title: '', amount: '', description: '' })
      void refresh()
    } catch (e) {
      const err = e as Error & { status?: number }
      setError(err.message || 'Failed to create link')
    } finally {
      setBusy('')
    }
  }

  const filtered = links.filter(l => {
    const s = statusOf(l)
    if (filter === 'Active' && s !== 'Pending') return false
    if (filter !== 'All' && filter !== 'Active' && s !== filter) return false
    if (search && !`${l.title} ${l.id}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const totals = {
    created: links.length,
    pendingUsd: links.filter(l => statusOf(l) === 'Pending').reduce((s, l) => s + amountOf(l), 0),
    paidUsd: links.filter(l => statusOf(l) === 'Paid').reduce((s, l) => s + amountOf(l), 0),
  }
  const metrics = [
    { label: 'Links Created', value: String(totals.created) },
    { label: 'Awaiting Payment', value: money(totals.pendingUsd) },
    { label: 'Paid', value: money(totals.paidUsd) },
    { label: 'Settlement', value: 'Direct to wallet' },
  ]
  const filters = ['All', 'Active', 'Pending', 'Paid']

  return <DashboardShell>
    <section className="dashboard-content pl">
      <div className="pl-head">
        <div>
          <h1>Payment Links</h1>
          <p className="pl-support">Create a payment request, share it anywhere — the payer pays straight into your wallet and the link marks itself paid.</p>
        </div>
        <button className="ov-btn primary" onClick={() => setCreateOpen(true)}><Plus size={15} /> Create Payment Link</button>
      </div>

      <div className="pl-metrics">
        {metrics.map(m => (
          <div className="ov-stat" key={m.label}><small>{m.label}</small><strong>{m.value}</strong></div>
        ))}
      </div>

      {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
      {busy && <p style={{ fontSize: 13 }}>{busy}</p>}

      <div className="pl-card">
        <div className="pl-section-head"><h2>Your Payment Links</h2><button className="wa-btn" onClick={() => void refresh()} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button></div>
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
              <span>{amountOf(l).toFixed(2)} {symbolOf(l)}</span>
              <span className={`pl-status ${statusOf(l).toLowerCase()}`}>{statusOf(l)}</span>
              <span>{timeAgo(createdTs(l))}</span>
              <span className="pl-more"><MoreHorizontal size={16} /></span>
            </button>
          ))}
          {filtered.length === 0 && <p className="pl-empty">No payment links yet — create one to start getting paid.</p>}
        </div>
      </div>
    </section>

    {createOpen && (
      <div className="pl-modal-backdrop" onClick={() => !busy && setCreateOpen(false)}>
        <div className="pl-modal" onClick={e => e.stopPropagation()}>
          <div className="pl-modal-head"><h2>Create Payment Link</h2><button className="pl-close" onClick={() => !busy && setCreateOpen(false)} aria-label="Close"><X size={16} /></button></div>
          <div className="pl-field"><label>Payment title</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Website Design" /></div>
          <div className="pl-field"><label>Amount (USDC)</label><input value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="100.00" inputMode="decimal" /></div>
          <div className="pl-field"><label>Description</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What is this for?" /></div>
          {error && <p style={{ color: '#ef4444', fontSize: 12 }}>{error}</p>}
          <div className="pl-modal-actions">
            <button className="ov-btn" onClick={() => setCreateOpen(false)} disabled={!!busy}>Cancel</button>
            <button className="ov-btn primary" onClick={createLink} disabled={!!busy}>{busy ? 'Working…' : 'Create Payment Link'}</button>
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
            <span>{amountOf(generated).toFixed(2)} {symbolOf(generated)}</span>
          </div>
          <p className="pl-url-label">Your payment link</p>
          <p className="pl-url" style={{ wordBreak: 'break-all', fontSize: 11 }}>{linkUrl(generated.id)}</p>
          <div className="pl-modal-actions pl-actions-center">
            <button className="ov-btn primary" onClick={() => copy(linkUrl(generated.id), 'gen')}><Copy size={14} /> {copied === 'gen' ? 'Copied' : 'Copy Link'}</button>
            <button className="ov-btn" onClick={() => share(generated.title, linkUrl(generated.id))}><Share2 size={14} /> Share</button>
            <button className="ov-btn" onClick={() => { setPreviewLink(generated); setGenerated(null) }}>View Payment Page</button>
          </div>
          <div className="pl-qr-wrap">
            <QrCode className="pl-qr" value={linkUrl(generated.id)} />
            <span>Scan to Pay</span>
          </div>
        </div>
      </div>
    )}

    {detail && (
      <div className="pl-modal-backdrop" onClick={() => setDetail(null)}>
        <div className="pl-modal" onClick={e => e.stopPropagation()}>
          <div className="pl-modal-head"><h2>{detail.title}</h2><button className="pl-close" onClick={() => setDetail(null)} aria-label="Close"><X size={16} /></button></div>
          <p className="pl-detail-amount">{amountOf(detail).toFixed(2)} {symbolOf(detail)}</p>
          <span className={`pl-status ${statusOf(detail).toLowerCase()}`}>{statusOf(detail)}</span>
          <div className="pl-fields">
            <div className="pl-field-row"><span>Created</span><strong>{new Date(detail.createdAt).toLocaleString('en-US')}</strong></div>
            <div className="pl-field-row"><span>Link ID</span><strong style={{ wordBreak: 'break-all', fontSize: 11 }}>{detail.id}</strong></div>
            <div className="pl-field-row"><span>Description</span><strong>{detail.description || '—'}</strong></div>
          </div>
          <div className="pl-modal-actions pl-actions-center">
            <button className="ov-btn" onClick={() => copy(linkUrl(detail.id), detail.id)}><Copy size={14} /> {copied === detail.id ? 'Copied' : 'Copy Link'}</button>
            <button className="ov-btn" onClick={() => share(detail.title, linkUrl(detail.id))}><Share2 size={14} /> Share</button>
          </div>
          {detail.txHash && <a className="ov-link" href={explorerTx(detail.txHash)} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Payment tx on explorer</a>}
        </div>
      </div>
    )}

    {previewLink && (
      <div className="pl-modal-backdrop" onClick={() => setPreviewLink(null)}>
        <div className="pl-checkout" onClick={e => e.stopPropagation()}>
          <span className="pl-checkout-brand">FluxPay</span>
          <span className="pl-checkout-tag">Payment Request</span>
          <strong className="pl-checkout-title">{previewLink.title}</strong>
          <p className="pl-checkout-amount">{amountOf(previewLink).toFixed(2)}<em>{symbolOf(previewLink)}</em></p>
          {previewLink.description && <p className="pl-checkout-desc">{previewLink.description}</p>}
          <button className="ov-btn primary pl-checkout-btn" onClick={() => navigate(`/pay?id=${previewLink.id}`)}><QrCodeIcon size={14} /> Open Checkout</button>
          <span className="pl-checkout-powered">Powered by FluxPay</span>
        </div>
      </div>
    )}
  </DashboardShell>
}

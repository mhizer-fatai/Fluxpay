import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, ExternalLink, MoreHorizontal, Plus, QrCode as QrCodeIcon, Search, Share2, X } from 'lucide-react'
import { formatUnits, getContract, type Address } from 'viem'
import { DashboardShell } from '@/components/dashboard-shell'
import { Dropdown } from '@/components/dropdown'
import { QrCode } from '@/components/qr-code'
import { useProfile } from '@/hooks/profile'
import { useWallet } from '@/hooks/useWallet'
import { erc20Abi, LINK_ESCROW_ADDRESS, linkEscrowAbi, monadTestnet, publicClient, TOKENS, explorerTx } from '@/lib/chain'
import { expiryFromOption, expiryLabel, generateEphemeral, linkUrl, loadLinks, NEVER_EXPIRY, randomLinkId, saveLink, type StoredLink } from '@/lib/links'
import { money, timeAgo } from '@/lib/format'

const USDC = TOKENS.find(t => t.key === 'USDC')!

interface ChainLinkState {
  depositor: string
  amount: bigint
  claimed: boolean
  refunded: boolean
  expiry: number
}

type LinkStatus = 'Pending' | 'Paid' | 'Expired' | 'Refunded'

export default function PaymentLinkPage() {
  const navigate = useNavigate()
  const { address } = useProfile()
  const { getWalletClient } = useWallet()
  const [links, setLinks] = useState<StoredLink[]>([])
  const [chainState, setChainState] = useState<Record<string, ChainLinkState>>({})
  const [createOpen, setCreateOpen] = useState(false)
  const [generated, setGenerated] = useState<StoredLink | null>(null)
  const [detail, setDetail] = useState<StoredLink | null>(null)
  const [previewLink, setPreviewLink] = useState<StoredLink | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [copied, setCopied] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({ title: '', amount: '', description: '', expiration: 'Never' })

  const refreshStatuses = useCallback(async () => {
    const stored = loadLinks()
    setLinks(stored)
    const escrow = getContract({ address: LINK_ESCROW_ADDRESS, abi: linkEscrowAbi, client: publicClient })
    const entries = await Promise.all(
      stored.map(async l => {
        try {
          const raw = (await escrow.read.links([l.id])) as readonly [Address, Address, bigint, number, Address, Address, boolean, boolean]
          const [depositor, , amount, expiry, , , claimed, refunded] = raw
          return [l.id, { depositor, amount, claimed, refunded, expiry }] as const
        } catch {
          return null
        }
      }),
    )
    const next: Record<string, ChainLinkState> = {}
    for (const e of entries) if (e) next[e[0]] = e[1]
    setChainState(next)
  }, [])

  useEffect(() => {
    void refreshStatuses()
  }, [refreshStatuses])

  const statusOf = (l: StoredLink): LinkStatus => {
    const cs = chainState[l.id]
    if (!cs) return 'Pending'
    if (cs.claimed) return 'Paid'
    if (cs.refunded) return 'Refunded'
    if (cs.expiry !== 0 && cs.expiry < 2 ** 40 - 1 && cs.expiry * 1000 < Date.now()) return 'Expired'
    return 'Pending'
  }

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
    setBusy('Creating link — confirm in your wallet…')
    try {
      const walletClient = await getWalletClient()
      if (!walletClient) throw new Error('wallet_unavailable')
      const rawAmount = BigInt(Math.round(amount * 10 ** USDC.decimals))
      const id = randomLinkId()
      const { privateKey, address: ephemeralAddress } = generateEphemeral()
      // approve, then deposit
      const approveHash = await walletClient.writeContract({
        account: address as `0x${string}`, chain: monadTestnet,
        address: USDC.address!, abi: erc20Abi, functionName: 'approve', args: [LINK_ESCROW_ADDRESS, rawAmount],
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })
      const expiry = expiryFromOption(form.expiration)
      const depositHash = await walletClient.writeContract({
        account: address as `0x${string}`, chain: monadTestnet,
        address: LINK_ESCROW_ADDRESS, abi: linkEscrowAbi, functionName: 'deposit',
        args: [id, USDC.address!, rawAmount, expiry, ephemeralAddress, '0x0000000000000000000000000000000000000000'],
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash: depositHash })
      if (receipt.status !== 'success') throw new Error('deposit_reverted')
      const link: StoredLink = {
        id, title: form.title.trim(), description: form.description.trim(), amount,
        token: 'USDC', createdAt: Math.floor(Date.now() / 1000),
        expiry: expiry >= NEVER_EXPIRY ? 0 : expiry,
        secret: privateKey, txHash: depositHash,
      }
      saveLink(link)
      setGenerated(link)
      setCreateOpen(false)
      setForm({ title: '', amount: '', description: '', expiration: 'Never' })
      void refreshStatuses()
    } catch (e) {
      const err = e as Error & { shortMessage?: string }
      setError(err.shortMessage || err.message || 'Failed to create link')
    } finally {
      setBusy('')
    }
  }

  const refund = async (l: StoredLink) => {
    setError('')
    setBusy('Refunding…')
    try {
      const walletClient = await getWalletClient()
      if (!walletClient) throw new Error('wallet_unavailable')
      const hash = await walletClient.writeContract({
        account: address as `0x${string}`, chain: monadTestnet,
        address: LINK_ESCROW_ADDRESS, abi: linkEscrowAbi, functionName: 'refund', args: [l.id],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      void refreshStatuses()
      setDetail(null)
    } catch (e) {
      const err = e as Error & { shortMessage?: string }
      setError(err.shortMessage || err.message || 'Refund failed')
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
    pendingUsd: links.filter(l => statusOf(l) === 'Pending').reduce((s, l) => s + l.amount, 0),
    paidUsd: links.filter(l => statusOf(l) === 'Paid').reduce((s, l) => s + l.amount, 0),
  }
  const metrics = [
    { label: 'Links Created', value: String(totals.created) },
    { label: 'Awaiting Payment', value: money(totals.pendingUsd) },
    { label: 'Paid', value: money(totals.paidUsd) },
    { label: 'Settlement', value: 'On-chain escrow' },
  ]
  const filters = ['All', 'Active', 'Pending', 'Paid', 'Expired']

  return <DashboardShell>
    <section className="dashboard-content pl">
      <div className="pl-head">
        <div>
          <h1>Payment Links</h1>
          <p className="pl-support">Each link is a real PaymentLinkEscrow deposit on Monad — the recipient claims with the secret embedded in the URL.</p>
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
        <div className="pl-section-head"><h2>Your Payment Links</h2><button className="wa-btn" onClick={() => void refreshStatuses()}>Refresh</button></div>
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
              <span>{l.amount.toFixed(2)} {l.token}</span>
              <span className={`pl-status ${statusOf(l).toLowerCase()}`}>{statusOf(l)}</span>
              <span>{timeAgo(l.createdAt)}</span>
              <span className="pl-more"><MoreHorizontal size={16} /></span>
            </button>
          ))}
          {filtered.length === 0 && <p className="pl-empty">No payment links yet — create one to receive escrowed payments.</p>}
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
          <div className="pl-field"><label>Expiration</label><Dropdown value={form.expiration} options={['Never', '24 hours', '7 days'].map(o => ({ value: o, label: o }))} onChange={v => setForm({ ...form, expiration: v })} /></div>
          {error && <p style={{ color: '#ef4444', fontSize: 12 }}>{error}</p>}
          <div className="pl-modal-actions">
            <button className="ov-btn" onClick={() => setCreateOpen(false)} disabled={!!busy}>Cancel</button>
            <button className="ov-btn primary" onClick={createLink} disabled={!!busy}>{busy ? 'Working…' : 'Deposit & Create Link'}</button>
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
            <span>{generated.amount.toFixed(2)} {generated.token}</span>
          </div>
          <p className="pl-url-label">Your payment link</p>
          <p className="pl-url" style={{ wordBreak: 'break-all', fontSize: 11 }}>{linkUrl(generated)}</p>
          <div className="pl-modal-actions pl-actions-center">
            <button className="ov-btn primary" onClick={() => copy(linkUrl(generated), 'gen')}><Copy size={14} /> {copied === 'gen' ? 'Copied' : 'Copy Link'}</button>
            <button className="ov-btn" onClick={() => share(generated.title, linkUrl(generated))}><Share2 size={14} /> Share</button>
            <button className="ov-btn" onClick={() => { setPreviewLink(generated); setGenerated(null) }}>View Payment Page</button>
          </div>
          <div className="pl-qr-wrap">
            <QrCode className="pl-qr" value={linkUrl(generated)} />
            <span>Scan to Pay</span>
          </div>
          <a className="ov-link" href={explorerTx(generated.txHash)} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Deposit tx on explorer</a>
        </div>
      </div>
    )}

    {detail && (
      <div className="pl-modal-backdrop" onClick={() => setDetail(null)}>
        <div className="pl-modal" onClick={e => e.stopPropagation()}>
          <div className="pl-modal-head"><h2>{detail.title}</h2><button className="pl-close" onClick={() => setDetail(null)} aria-label="Close"><X size={16} /></button></div>
          <p className="pl-detail-amount">{detail.amount.toFixed(2)} {detail.token}</p>
          <span className={`pl-status ${statusOf(detail).toLowerCase()}`}>{statusOf(detail)}</span>
          <div className="pl-fields">
            <div className="pl-field-row"><span>Created</span><strong>{new Date(detail.createdAt * 1000).toLocaleString('en-US')}</strong></div>
            <div className="pl-field-row"><span>Expires</span><strong>{expiryLabel(detail.expiry)}</strong></div>
            <div className="pl-field-row"><span>Link ID</span><strong style={{ wordBreak: 'break-all', fontSize: 11 }}>{detail.id}</strong></div>
            <div className="pl-field-row"><span>Description</span><strong>{detail.description || '—'}</strong></div>
          </div>
          <div className="pl-modal-actions pl-actions-center">
            <button className="ov-btn" onClick={() => copy(linkUrl(detail), detail.id)}><Copy size={14} /> {copied === detail.id ? 'Copied' : 'Copy Link'}</button>
            <button className="ov-btn" onClick={() => share(detail.title, linkUrl(detail))}><Share2 size={14} /> Share</button>
            {statusOf(detail) === 'Expired' && (
              <button className="ov-btn" onClick={() => refund(detail)} disabled={!!busy}>Refund to wallet</button>
            )}
          </div>
          <a className="ov-link" href={explorerTx(detail.txHash)} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Deposit tx on explorer</a>
        </div>
      </div>
    )}

    {previewLink && (
      <div className="pl-modal-backdrop" onClick={() => setPreviewLink(null)}>
        <div className="pl-checkout" onClick={e => e.stopPropagation()}>
          <span className="pl-checkout-brand">FluxPay</span>
          <span className="pl-checkout-tag">Payment Request</span>
          <strong className="pl-checkout-title">{previewLink.title}</strong>
          <p className="pl-checkout-amount">{previewLink.amount.toFixed(2)}<em>{previewLink.token}</em></p>
          {previewLink.description && <p className="pl-checkout-desc">{previewLink.description}</p>}
          <button className="ov-btn primary pl-checkout-btn" onClick={() => navigate(`/pay?id=${previewLink.id}&s=${previewLink.secret}&t=${encodeURIComponent(previewLink.title)}`)}><QrCodeIcon size={14} /> Open Checkout</button>
          <span className="pl-checkout-powered">Powered by FluxPay · PaymentLinkEscrow</span>
        </div>
      </div>
    )}
  </DashboardShell>
}

export const formatRawUsdc = (raw: bigint) => Number(formatUnits(raw, USDC.decimals))

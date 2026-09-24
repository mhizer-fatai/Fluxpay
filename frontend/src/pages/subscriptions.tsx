import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, CalendarDays, CreditCard, Plus, X } from 'lucide-react'
import type { Address } from 'viem'
import { DashboardShell } from '@/components/dashboard-shell'
import { useProfile } from '@/hooks/profile'
import { useWallet } from '@/hooks/useWallet'
import { listStreams, type StreamRow } from '@/lib/streams'
import { erc20Abi, monadTestnet, publicClient, STREAM_VAULT_ADDRESS, streamVaultAbi, TOKENS, type TokenKey } from '@/lib/chain'
import { resolveUsernameApi } from '@/lib/api'
import { money, shortAddr } from '@/lib/format'

const PAY_TOKENS: TokenKey[] = ['USDC', 'AUSD', 'WMON', 'WETH']
const SECONDS_PER_MONTH = 2_592_000

export default function SubscriptionsPage() {
  const { address } = useProfile()
  const { getWalletClient } = useWallet()
  const [streams, setStreams] = useState<StreamRow[]>([])
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [detail, setDetail] = useState<StreamRow | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({ recipient: '', amount: '', asset: 'USDC' as TokenKey, months: 1 })

  const refresh = useCallback(async () => {
    if (!address) return
    setLoading(true)
    try {
      setStreams(await listStreams(address))
    } catch {
      setStreams([])
    } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const owned = streams.filter(s => s.role === 'owner' && !s.cancelled)
  const incoming = streams.filter(s => s.role === 'recipient' && !s.cancelled)
  const monthlySpend = owned.reduce((s, x) => s + x.monthly, 0)
  const monthlyIncoming = incoming.reduce((s, x) => s + x.monthly, 0)
  const funded = owned.reduce((s, x) => s + x.deposited, 0)

  const resolveRecipient = async (input: string): Promise<string | null> => {
    const v = input.trim()
    if (/^0x[a-fA-F0-9]{40}$/.test(v)) return v
    if (/^@[a-z0-9_]{3,32}$/.test(v) || /^[a-z0-9_]{3,32}$/.test(v)) {
      try {
        const r = await resolveUsernameApi(v.replace(/^@/, ''))
        return r.address
      } catch { return null }
    }
    return null
  }

  const createStream = async () => {
    setError('')
    if (!address) return
    const amount = Number(form.amount)
    if (!(amount > 0)) return setError('Enter a valid monthly amount')
    setBusy('Resolving recipient…')
    try {
      const recipient = await resolveRecipient(form.recipient)
      if (!recipient) return setError('Recipient must be a valid address or registered @username')
      const token = TOKENS.find(t => t.key === form.asset)!
      const walletClient = await getWalletClient()
      if (!walletClient) throw new Error('wallet_unavailable')
      const rawMonthly = BigInt(Math.round(amount * 10 ** token.decimals))
      // ratePerSecondX18 = rawMonthly * 1e18 / secondsPerMonth
      const rateX18 = (rawMonthly * 10n ** 18n) / BigInt(SECONDS_PER_MONTH)
      const initialDeposit = rawMonthly * BigInt(Math.max(1, Math.floor(form.months)))
      setBusy('Approving token…')
      const approveHash = await walletClient.writeContract({
        account: address as `0x${string}`, chain: monadTestnet,
        address: token.address!, abi: erc20Abi, functionName: 'approve', args: [STREAM_VAULT_ADDRESS, initialDeposit],
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })
      setBusy('Creating stream…')
      const hash = await walletClient.writeContract({
        account: address as `0x${string}`, chain: monadTestnet,
        address: STREAM_VAULT_ADDRESS, abi: streamVaultAbi, functionName: 'create',
        args: [recipient as Address, token.address!, rateX18, initialDeposit],
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('create_reverted')
      setAddOpen(false)
      setForm({ recipient: '', amount: '', asset: 'USDC', months: 1 })
      void refresh()
    } catch (e) {
      const err = e as Error & { shortMessage?: string }
      setError(err.shortMessage || err.message || 'Failed to create stream')
    } finally {
      setBusy('')
    }
  }

  const streamAction = async (s: StreamRow, action: 'pause' | 'resume' | 'cancel' | 'withdraw') => {
    setError('')
    if (!address) return
    setBusy(`${action}…`)
    try {
      const walletClient = await getWalletClient()
      if (!walletClient) throw new Error('wallet_unavailable')
      const hash = await walletClient.writeContract({
        account: address as `0x${string}`, chain: monadTestnet,
        address: STREAM_VAULT_ADDRESS, abi: streamVaultAbi, functionName: action, args: [s.id],
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error(`${action}_reverted`)
      setDetail(null)
      void refresh()
    } catch (e) {
      const err = e as Error & { shortMessage?: string }
      setError(err.shortMessage || err.message || 'Action failed')
    } finally {
      setBusy('')
    }
  }

  const StreamRowView = ({ s, onClick }: { s: StreamRow; onClick: () => void }) => (
    <button className="su-item su-item-clickable" onClick={onClick} style={{ width: '100%', textAlign: 'left' }}>
      <div className="su-item-top">
        <span className="su-logo">{(s.token ?? 'S')[0]}</span>
        <div className="su-item-name">
          <strong>Stream #{s.id.toString()} · {s.role === 'owner' ? `→ ${shortAddr(s.recipient)}` : `← ${shortAddr(s.owner)}`}</strong>
          <small>{s.monthly.toFixed(2)} {s.token ?? ''} / month · {s.role === 'owner' ? 'you pay' : 'you receive'}</small>
        </div>
        <span className={s.cancelled ? 'su-badge su-badge-paused' : s.paused ? 'su-badge su-badge-paused' : 'su-badge'}>
          {s.cancelled ? 'Cancelled' : s.paused ? 'Paused' : 'Active'}
        </span>
      </div>
      <div className="su-item-bottom">
        <div className="su-stat"><small>Deposited</small><strong>{s.deposited.toFixed(2)} {s.token ?? ''}</strong></div>
        {s.role === 'recipient' && <div className="su-stat"><small>Withdrawable</small><strong>{s.withdrawable.toFixed(4)} {s.token ?? ''}</strong></div>}
        <div className="su-stat"><small>Started</small><strong>{new Date(s.createdAt * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</strong></div>
      </div>
    </button>
  )

  return <DashboardShell>
    <section className="dashboard-content su">
      <div className="su-head">
        <div>
          <h1>Subscriptions</h1>
          <p className="su-support">Real on-chain payment streams from StreamVault — fund a monthly rate, pause, resume, or cancel anytime.</p>
        </div>
        <button className="ov-btn primary" onClick={() => setAddOpen(true)}><Plus size={15} /> New Stream</button>
      </div>

      <div className="su-metrics">
        <div className="ov-stat"><span className="ov-stat-icon"><CalendarDays size={16} /></span><small>Active Streams</small><strong>{owned.length + incoming.length}</strong><em>on StreamVault</em></div>
        <div className="ov-stat"><span className="ov-stat-icon"><CreditCard size={16} /></span><small>Monthly Outgoing</small><strong>{money(monthlySpend)}</strong><em>across {owned.length} streams</em></div>
        <div className="ov-stat"><small>Monthly Incoming</small><strong>{money(monthlyIncoming)}</strong><em>across {incoming.length} streams</em></div>
        <div className="ov-stat"><small>Total Funded</small><strong>{money(funded)}</strong><em>deposited by you</em></div>
      </div>

      {(busy || error) && <p style={{ fontSize: 13, margin: '8px 0' }}>{busy}{error && <span style={{ color: '#ef4444' }}> {error}</span>}</p>}

      <div className="su-card">
        <div className="su-section-head">
          <div>
            <h2>Your Streams</h2>
            <p>Outgoing and incoming payment streams, read live from Monad.</p>
          </div>
          <button className="wa-btn" onClick={() => void refresh()} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
        <div className="su-list">
          {loading && streams.length === 0 && <p style={{ color: 'var(--muted, #999)', fontSize: 13 }}>Reading StreamVault…</p>}
          {!loading && streams.length === 0 && <p style={{ color: 'var(--muted, #999)', fontSize: 13 }}>No streams yet — create one to start a recurring on-chain payment.</p>}
          {streams.map(s => <StreamRowView key={s.id.toString()} s={s} onClick={() => setDetail(s)} />)}
        </div>
      </div>
    </section>

    {addOpen && (
      <div className="su-modal-backdrop" onClick={() => !busy && setAddOpen(false)}>
        <div className="su-modal" onClick={e => e.stopPropagation()}>
          <div className="su-modal-head">
            <h2>New Payment Stream</h2>
            <button className="su-close" onClick={() => setAddOpen(false)} aria-label="Close"><X size={16} /></button>
          </div>
          <div className="su-field">
            <label>Pay to (address or @username)</label>
            <input type="text" value={form.recipient} onChange={e => setForm({ ...form, recipient: e.target.value })} placeholder="0x… or @alice" />
          </div>
          <div className="su-field">
            <label>Monthly amount</label>
            <input type="number" min={0} step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="su-field">
            <label>Asset</label>
            <select value={form.asset} onChange={e => setForm({ ...form, asset: e.target.value as TokenKey })}>
              {PAY_TOKENS.map(k => <option key={k}>{k}</option>)}
            </select>
          </div>
          <div className="su-field">
            <label>Pre-fund (months)</label>
            <input type="number" min={1} step={1} value={form.months} onChange={e => setForm({ ...form, months: Number(e.target.value) })} />
          </div>
          <div className="su-estimate">
            <span>Upfront cost (amount × months + gas)</span>
            <strong>{((parseFloat(form.amount) || 0) * Math.max(1, Math.floor(form.months))).toFixed(2)} {form.asset}</strong>
          </div>
          {error && <p style={{ color: '#ef4444', fontSize: 12 }}>{error}</p>}
          <div className="su-modal-actions">
            <button className="ov-btn" onClick={() => setAddOpen(false)} disabled={!!busy}>Cancel</button>
            <button className="ov-btn primary" onClick={createStream} disabled={!!busy || !form.recipient || !form.amount}>{busy ? 'Working…' : 'Approve & Create'}</button>
          </div>
        </div>
      </div>
    )}

    {detail && (
      <div className="su-modal-backdrop" onClick={() => !busy && setDetail(null)}>
        <div className="su-modal" onClick={e => e.stopPropagation()}>
          <div className="su-modal-head">
            <h2>Stream #{detail.id.toString()}</h2>
            <button className="su-close" onClick={() => setDetail(null)} aria-label="Close"><X size={16} /></button>
          </div>
          <div className="su-detail-head">
            <span className={detail.cancelled || detail.paused ? 'su-badge su-badge-paused' : 'su-badge'}>
              {detail.cancelled ? 'Cancelled' : detail.paused ? 'Paused' : 'Active'}
            </span>
            <span className="su-detail-amount">{detail.monthly.toFixed(2)} {detail.token ?? ''} / month</span>
          </div>
          <div className="su-detail-grid">
            <div className="su-stat"><small>Role</small><strong>{detail.role === 'owner' ? 'You pay' : 'You receive'}</strong></div>
            <div className="su-stat"><small>{detail.role === 'owner' ? 'Recipient' : 'Payer'}</small><strong>{shortAddr(detail.role === 'owner' ? detail.recipient : detail.owner)}</strong></div>
            <div className="su-stat"><small>Deposited</small><strong>{detail.deposited.toFixed(2)} {detail.token ?? ''}</strong></div>
            {detail.role === 'recipient' && <div className="su-stat"><small>Withdrawable now</small><strong>{detail.withdrawable.toFixed(6)} {detail.token ?? ''}</strong></div>}
          </div>
          {error && <p style={{ color: '#ef4444', fontSize: 12 }}>{error}</p>}
          <div className="su-modal-actions">
            {detail.role === 'owner' && !detail.cancelled && (detail.paused
              ? <button className="ov-btn primary" onClick={() => streamAction(detail, 'resume')} disabled={!!busy}>Resume</button>
              : <button className="ov-btn" onClick={() => streamAction(detail, 'pause')} disabled={!!busy}>Pause</button>)}
            {detail.role === 'recipient' && !detail.cancelled && detail.withdrawable > 0 && (
              <button className="ov-btn primary" onClick={() => streamAction(detail, 'withdraw')} disabled={!!busy}>Withdraw</button>
            )}
            {!detail.cancelled && (
              <button className="ov-btn su-danger" onClick={() => streamAction(detail, 'cancel')} disabled={!!busy}>Cancel stream</button>
            )}
          </div>
        </div>
      </div>
    )}
  </DashboardShell>
}

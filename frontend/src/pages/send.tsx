import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Clipboard, ExternalLink, QrCode } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { SmartWalletGate } from '@/components/guard'
import { Dropdown } from '@/components/dropdown'
import { useProfile } from '@/hooks/profile'
import { useBalances } from '@/hooks/useBalances'
import { useWallet } from '@/hooks/useWallet'
import { buildSettleCalls, getUserOpReceipt, sendGasless } from '@/lib/gasless'
import { fetchActivity } from '@/lib/activity'
import { getUsdPrices, TOKENS, type TokenKey } from '@/lib/chain'
import { resolveUsernameApi, createPaymentIntent, patchPaymentIntent } from '@/lib/api'
import { money, shortAddr } from '@/lib/format'
import { EXPLORER_URL, publicClient } from '@/lib/chain'

type Step = 'form' | 'confirm' | 'sending' | 'pending' | 'success'

const SENDABLE: TokenKey[] = ['USDC', 'KUSDC', 'AUSD', 'WMON', 'WETH', 'MON']

const PENDING_KEY = 'fluxpay_pending_intents'
const PENDING_TTL_MS = 15 * 60_000

interface PendingIntent {
  key: string
  intentId: string
  to: string
  asset: string
  amount: string
  at: number
  userOpHash?: string
  txHash?: string
}

function loadPending(): PendingIntent[] {
  try {
    const list = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]') as PendingIntent[]
    return list.filter(p => Date.now() - p.at < PENDING_TTL_MS)
  } catch {
    return []
  }
}

function savePending(list: PendingIntent[]) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list))
  } catch { /* ignore */ }
}

function SlideToSend({ onComplete, disabled }: { onComplete: () => void; disabled?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const startX = useRef(0)
  const [x, setX] = useState(0)
  const [done, setDone] = useState(false)

  const onDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || done) return
    dragging.current = true
    startX.current = e.clientX - x
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !trackRef.current) return
    const max = trackRef.current.clientWidth - 52
    const next = Math.max(0, Math.min(max, e.clientX - startX.current))
    setX(next)
    if (next >= max - 1) {
      dragging.current = false
      setDone(true)
      onComplete()
    }
  }
  const onUp = () => {
    if (!dragging.current) return
    dragging.current = false
    setX(0)
  }

  return (
    <div className={`sn-slide ${disabled ? 'is-disabled' : ''}`} ref={trackRef} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <span className="sn-slide-label">{done ? 'Preparing…' : 'Slide to send'}</span>
      <button className="sn-slide-handle" style={{ transform: `translateX(${x}px)` }} onPointerDown={onDown} aria-label="Slide to send" disabled={disabled}>
        <ArrowRight size={16} />
      </button>
    </div>
  )
}

export default function SendPage() {
  return <SmartWalletGate><SendContent /></SmartWalletGate>
}

function SendContent() {
  const { address } = useProfile()
  const { smartAddress, getWalletClient } = useWallet()
  // Smart account only — balances, spend, and QRs never touch the EOA.
  // (The EOA remains the invisible signer for userOps inside sendGasless.)
  const { rows, refresh: refreshSmart } = useBalances(smartAddress)

  const [step, setStep] = useState<Step>('form')
  const [assetSym, setAssetSym] = useState<TokenKey>('USDC')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [prices, setPrices] = useState<Record<string, number> | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [resolvedTo, setResolvedTo] = useState<string | null>(null)
  const [copiedSmart, setCopiedSmart] = useState(false)
  const [recents, setRecents] = useState<Array<{ addr: string; last: string }>>([])
  // Confirmation tracking: userOp hash (exists the moment the bundler accepts),
  // elapsed seconds while confirming, and the on-chain receipt for "View Receipt".
  const [intentId, setIntentId] = useState<string | null>(null)
  const [userOpHash, setUserOpHash] = useState<string | null>(null)
  // Ref mirror: the confirmSend closure outlives re-renders, so the catch block
  // reads the ref (current) instead of stale state when deciding recovery.
  const userOpHashRef = useRef<string | null>(null)
  const [confirmSecs, setConfirmSecs] = useState(0)
  const [checking, setChecking] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [receipt, setReceipt] = useState<{ status: string; blockNumber: string; gasUsed: string } | null>(null)

  // All sends go from the smart account (sponsored, invisible to the user).
  const spendAddress = smartAddress as string
  const spendRows = rows

  const asset = TOKENS.find(t => t.key === assetSym)!
  const balanceRow = spendRows.find(r => r.key === assetSym)
  const balance = balanceRow?.amount ?? 0
  const amt = parseFloat(amount) || 0
  const usd = prices ? amt * (prices[assetSym] ?? 0) : 0
  const canContinue = recipient.trim().length > 3 && amt > 0 && amt <= balance

  useEffect(() => { void getUsdPrices().then(setPrices) }, [])
  useEffect(() => {
    if (!address) return
    fetchActivity(address)
      .then(items => {
        const seen = new Set<string>()
        const out: Array<{ addr: string; last: string }> = []
        for (const i of items) {
          const c = i.counterparty.toLowerCase()
          if (seen.has(c)) continue
          seen.add(c)
          out.push({ addr: c, last: `${i.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${i.token ?? ''}` })
          if (out.length >= 3) break
        }
        setRecents(out)
      })
      .catch(() => setRecents([]))
  }, [address])

  const paste = async () => {
    try { const text = await navigator.clipboard.readText(); if (text) setRecipient(text.trim()) } catch { /* ignore */ }
  }
  const reset = () => {
    setStep('form'); setRecipient(''); setAmount(''); setTxHash(null); setResolvedTo(null); setError('')
    setIntentId(null); setUserOpHash(null); userOpHashRef.current = null; setConfirmSecs(0); setReceipt(null); setShowReceipt(false); setBusy('')
  }

  // Dismiss the progress/receipt popup. Does NOT cancel the on-chain transaction
  // (that already reached the bundler) — it just stops tracking it here and
  // returns to the form; the result stays visible in Activity.
  const dismiss = () => {
    if (intentId) savePending(loadPending().filter(p => p.intentId !== intentId))
    reset()
  }

  // Elapsed-time ticker while waiting for on-chain confirmation.
  useEffect(() => {
    if (step !== 'sending' || !userOpHash) return
    const t = setInterval(() => setConfirmSecs(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [step, userOpHash])

  // Resume an in-flight send after a reload/navigation. The step/success state is
  // otherwise in-memory and would be lost, so a send that already reached the
  // bundler would never show its confirmation or receipt.
  useEffect(() => {
    const list = loadPending()
    // Only resume sends that actually reached the bundler (have a userOpHash).
    // An entry saved before submission isn't actionable and shouldn't trap the UI.
    const p = [...list].reverse().find(x => x.userOpHash)
    if (!p) return
    const meta = TOKENS.find(t => t.key === p.asset)
    if (!meta) return
    setAssetSym(p.asset as TokenKey)
    setRecipient(p.to)
    setResolvedTo(p.to)
    setAmount(String(Number(p.amount) / 10 ** meta.decimals))
    setIntentId(p.intentId)
    if (p.userOpHash) { userOpHashRef.current = p.userOpHash; setUserOpHash(p.userOpHash) }
    if (p.txHash) { setTxHash(p.txHash); setStep('success'); return }
    setStep(p.userOpHash ? 'sending' : 'pending')
    setBusy(p.userOpHash ? 'Submitted — waiting for on-chain confirmation…' : 'Waiting for your wallet approval…')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-poll a submitted userOp so the completed + receipt screen appears
  // without the user having to click "Check status".
  useEffect(() => {
    if (!userOpHash || (step !== 'sending' && step !== 'pending')) return
    let cancelled = false
    const poll = async () => {
      const r = await getUserOpReceipt(userOpHash as `0x${string}`)
      if (cancelled || !r) return
      const tx = r.receipt.transactionHash
      if (intentId) void patchPaymentIntent(intentId, { status: 'confirmed', txHash: tx }).catch(() => {})
      savePending(loadPending().filter(p => p.intentId !== intentId))
      setTxHash(tx)
      void refreshSmart()
      setBusy('')
      setStep('success')
    }
    void poll()
    const t = setInterval(poll, 8000)
    return () => { cancelled = true; clearInterval(t) }
  }, [userOpHash, step, intentId, refreshSmart])

  const fmtElapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  /** Recovery path: the confirmation wait timed out but the tx may still land. Never resend blindly. */
  const checkStatus = async () => {
    if (!userOpHash) return
    setChecking(true)
    setError('')
    try {
      const r = await getUserOpReceipt(userOpHash as `0x${string}`)
      if (!r) {
        setError('Still pending with the bundler — wait a bit and check again. Do not resend: this transaction may still land.')
        return
      }
      const tx = r.receipt.transactionHash
      if (intentId) void patchPaymentIntent(intentId, { status: 'confirmed', txHash: tx }).catch(() => {})
      setTxHash(tx)
      void refreshSmart()
      setBusy('')
      setStep('success')
    } finally {
      setChecking(false)
    }
  }

  /** On-demand on-chain receipt for the "View Receipt" panel. */
  const loadReceipt = async () => {
    if (receipt || !txHash) { setShowReceipt(v => !v); return }
    setReceiptLoading(true)
    try {
      const r = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` })
      setReceipt({ status: r.status, blockNumber: r.blockNumber.toString(), gasUsed: r.gasUsed.toString() })
      setShowReceipt(true)
    } catch {
      setError('Receipt not available yet — try again in a moment')
    } finally {
      setReceiptLoading(false)
    }
  }

  const resolveRecipient = async (): Promise<string | null> => {
    const v = recipient.trim()
    if (/^0x[a-fA-F0-9]{40}$/.test(v)) return v
    try {
      const r = await resolveUsernameApi(v.replace(/^@/, ''))
      return r.address
    } catch {
      return null
    }
  }

  const confirmSend = async () => {
    setError('')
    if (!address) return setError('Wallet not ready')
    setBusy('Resolving recipient…')
    let intentId: string | null = null
    try {
      const to = await resolveRecipient()
      if (!to) return setError('Recipient must be a valid 0x address or a registered @username')
      setResolvedTo(to)
      const walletClient = await getWalletClient()
      if (!walletClient) throw new Error('wallet_unavailable')

      if (!spendAddress) throw new Error('Account not ready — wait a moment and try again')

      // Idempotency: same (to, asset, amount) within 15 min reuses the pending intent
      // instead of building a second payment.
      const rawAmount = BigInt(Math.round(amt * 10 ** asset.decimals)).toString()
      const dupe = loadPending().find(
        p => p.to.toLowerCase() === to.toLowerCase() && p.asset === asset.key && p.amount === rawAmount,
      )
      if (dupe) {
        return setError('This exact send is already pending — check Activity before trying again.')
      }
      const idempotencyKey = crypto.randomUUID().replace(/-/g, '')
      const intent = await createPaymentIntent({
        idempotencyKey,
        fromAddress: spendAddress,
        toAddress: to,
        asset: asset.key,
        amountRaw: rawAmount,
      })
      intentId = intent.intentId
      setIntentId(intent.intentId)
      if (intent.status === 'confirmed') {
        setTxHash(intent.txHash)
        setBusy('')
        setStep('success')
        return
      }
      savePending([
        ...loadPending().filter(p => p.intentId !== intent.intentId),
        { key: idempotencyKey, intentId: intent.intentId, to, asset: asset.key, amount: rawAmount, at: Date.now() },
      ])
      // Move to the progress screen BEFORE touching the wallet: the user always
      // sees live status (signing → submitted → confirming) instead of a dead button.
      setStep('sending')
      setUserOpHash(null)
      userOpHashRef.current = null
      setConfirmSecs(0)
      setReceipt(null)
      setShowReceipt(false)
      const calls = buildSettleCalls({ token: asset, amountHuman: amt, to: to as `0x${string}` })
      const result = await sendGasless({
        walletClient,
        ownerAddress: address as `0x${string}`,
        calls,
        onStatus: s => {
          setBusy(s === 'signing' ? 'Confirm in your wallet…' : s === 'submitted' ? 'Submitted — waiting for on-chain confirmation…' : 'Confirming on Monad…')
          if (s === 'submitted' && intentId) {
            void patchPaymentIntent(intentId, { status: 'submitted' }).catch(() => {})
          }
        },
        onUserOpHash: h => {
          userOpHashRef.current = h
          setUserOpHash(h)
          // Persist the hash so a reload/navigation mid-send can still resume
          // confirmation and surface the receipt.
          const list = loadPending()
          const i = list.findIndex(p => p.intentId === intentId)
          if (i >= 0) { list[i] = { ...list[i], userOpHash: h }; savePending(list) }
        },
      })
      if (intentId) {
        savePending(loadPending().filter(p => p.intentId !== intentId))
        void patchPaymentIntent(intentId, { status: 'confirmed', txHash: result.txHash }).catch(() => {})
      }
      setTxHash(result.txHash)
      void refreshSmart()
      setBusy('')
      setStep('success')
    } catch (e) {
      const err = e as Error & { shortMessage?: string; body?: { error?: string; message?: string } }
      const msg = err.shortMessage || err.message || 'Send failed — please try again'
      // Confirmation timeout ≠ failure: the userOp is with the bundler and may
      // still land. Park on the recovery screen (with the userOp hash) instead
      // of bouncing back to confirm, where a retry could double-send.
      if (/still waiting on confirmation/i.test(msg) && userOpHashRef.current) {
        setBusy('')
        setError('')
        setStep('pending')
        return
      }
      const detail = err.body?.message || err.body?.error
      setError(detail ? `${msg} (${detail})` : msg)
      setBusy('')
      setStep('confirm')
    }
  }

  const summary = useMemo(() => (
    <>
      <div className="sn-sum-row"><span>You&apos;re sending</span><strong>{amt.toLocaleString('en-US', { maximumFractionDigits: 6 })} {asset.symbol}</strong></div>
      <div className="sn-sum-row"><span>To</span><strong>{resolvedTo ? shortAddr(resolvedTo) : recipient}</strong></div>
      <div className="sn-sum-row"><span>Network</span><strong>Monad Testnet</strong></div>
      <div className="sn-sum-row sn-sum-total"><span>Total</span><strong>{amt.toLocaleString('en-US', { maximumFractionDigits: 6 })} {asset.symbol}</strong></div>
    </>
  ), [amt, asset.symbol, resolvedTo, recipient])

  return <DashboardShell>
    <section className="dashboard-content sn">
      <div className="sn-head">
        <h1>Send</h1>
      </div>

      {step === 'form' ? (
        <div className="sn-form-wrap">
          <div className="sn-panel">
            <h3>Send</h3>
            <div className="sn-field">
              <label>From</label>
              <div className="sn-static sn-wallet-static">
                <div><strong>FluxPay Wallet</strong><small>{spendAddress ?? 'connecting…'}</small></div>
                <span className="sn-wallet-bal">{balance.toLocaleString('en-US', { maximumFractionDigits: 4 })} {asset.symbol}</span>
              </div>
              <div className="sn-input-row sn-input-row-btns">
                <button className="sn-inline" onClick={() => { if (spendAddress) navigator.clipboard?.writeText(spendAddress).catch(() => {}); setCopiedSmart(true); setTimeout(() => setCopiedSmart(false), 1500) }}>
                  {copiedSmart ? 'Copied' : 'Copy wallet address'}
                </button>
              </div>
              {balance === 0 && (
                <p className="sn-hint">Send funds to this address once to start using FluxPay.</p>
              )}
            </div>
            <div className="sn-field">
              <label>Asset</label>
              <Dropdown value={assetSym} options={SENDABLE.map(k => ({ value: k, label: `${k} — ${TOKENS.find(t => t.key === k)!.name}` }))} onChange={v => setAssetSym(v as TokenKey)} />
              <p className="sn-hint">{balance.toLocaleString('en-US', { maximumFractionDigits: 6 })} {asset.symbol} available</p>
            </div>
          </div>

          <div className="sn-panel">
            <h3>Receive</h3>
            <div className="sn-field">
              <label>Recipient address or @username</label>
              <input placeholder="0x… or @name" value={recipient} onChange={e => setRecipient(e.target.value)} spellCheck={false} />
              <div className="sn-input-row sn-input-row-btns">
                <button className="sn-inline" onClick={paste}><Clipboard size={13} /> Paste</button>
                <Link className="sn-inline" to="/receive"><QrCode size={13} /> My QR</Link>
              </div>
              <p className="sn-hint">@usernames resolve through FluxPay's registry.</p>
            </div>
          </div>

          <div className="sn-panel sn-panel-pay">
            <h3>Amount</h3>
            <div className="sn-field">
              <label>Amount</label>
              <div className="sn-input-row">
                <input placeholder={`0.00 ${asset.symbol}`} value={amount} inputMode="decimal" onChange={e => setAmount(e.target.value)} />
                <button className="sn-inline" onClick={() => setAmount(String(balance))}>Max</button>
              </div>
              <p className="sn-hint">Available: {balance.toLocaleString('en-US', { maximumFractionDigits: 6 })} {asset.symbol}{usd > 0 && <> · ≈ {money(usd)}</>}</p>
            </div>
            <SlideToSend disabled={!canContinue || !!busy} onComplete={() => setStep('confirm')} />
            {!canContinue && <p className="sn-hint sn-hint-center">Enter a recipient and a valid amount (≤ balance) to continue.</p>}
          </div>
        </div>
      ) : step === 'confirm' ? (
        <div className="sn-card">
          <div className="sn-step">
            <h2>Confirm Transfer</h2>
            <div className="sn-summary">{summary}</div>
            <p className="sn-warning">Transactions on the blockchain cannot be reversed once confirmed. Please verify the recipient before continuing.</p>
            {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
            <div className="sn-actions">
              <button className="ov-btn" onClick={() => setStep('form')} disabled={!!busy}>Back</button>
              <button className="ov-btn primary" onClick={confirmSend} disabled={!!busy}>{busy || 'Confirm & Send'}</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="pl-modal-backdrop">
          <div className={`pl-modal${step === 'success' ? ' pl-modal-center' : ''}`}>
          {step === 'sending' && (
            <div className="sn-step">
              <h2>{userOpHash ? 'Transaction in progress' : 'Waiting for approval'}</h2>
              <p className="sn-hint">{busy || 'Waiting for confirmation on Monad…'}</p>
              <div className="sn-summary">
                <div className="sn-sum-row"><span>Amount</span><strong>{amt.toLocaleString('en-US', { maximumFractionDigits: 6 })} {asset.symbol}</strong></div>
                <div className="sn-sum-row"><span>To</span><strong>{resolvedTo ? shortAddr(resolvedTo) : recipient}</strong></div>
                {userOpHash && (
                  <div className="sn-sum-row"><span>UserOp</span><strong style={{ wordBreak: 'break-all' }}>{shortAddr(userOpHash)}</strong></div>
                )}
                {userOpHash && (
                  <div className="sn-sum-row"><span>Elapsed</span><strong>{fmtElapsed(confirmSecs)}</strong></div>
                )}
              </div>
              {userOpHash
                ? <p className="sn-hint">Submitted to the bundler — your funds are safe. You can leave this page; the result will appear in Activity.</p>
                : <p className="sn-hint">Waiting for your wallet approval…</p>}
              <div className="sn-actions" style={{ marginTop: 12 }}>
                <button className="ov-btn" onClick={dismiss}>Cancel</button>
              </div>
            </div>
          )}

          {step === 'pending' && (
            <div className="sn-step">
              <h2>Submitted — status unknown</h2>
              <p className="sn-warning">Confirmation is taking longer than usual, but your transaction was submitted and may still land. <strong>Do not send again</strong> — that could transfer twice.</p>
              <div className="sn-summary">
                <div className="sn-sum-row"><span>Amount</span><strong>{amt.toLocaleString('en-US', { maximumFractionDigits: 6 })} {asset.symbol}</strong></div>
                <div className="sn-sum-row"><span>To</span><strong>{resolvedTo ? shortAddr(resolvedTo) : recipient}</strong></div>
                {userOpHash && (
                  <div className="sn-sum-row"><span>UserOp</span><strong style={{ wordBreak: 'break-all' }}>{shortAddr(userOpHash)}</strong></div>
                )}
              </div>
              {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
              <div className="sn-actions">
                <button className="ov-btn primary" onClick={checkStatus} disabled={checking}>{checking ? 'Checking…' : 'Check status'}</button>
                <button className="ov-btn" onClick={dismiss}>Cancel</button>
                <Link className="ov-btn" to="/activity">View Activity</Link>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="sn-step sn-success">
              <span className="sn-success-icon"><Check size={22} /></span>
              <h2>Transaction successful</h2>
              <p className="sn-success-amount">{amt.toLocaleString('en-US', { maximumFractionDigits: 6 })} {asset.symbol}</p>
              <p className="sn-success-sub">sent to {resolvedTo ? shortAddr(resolvedTo) : recipient} · confirmed on Monad Testnet.</p>
              <div className="sn-summary">
                <div className="sn-sum-row"><span>To</span><strong>{resolvedTo ? shortAddr(resolvedTo) : recipient}</strong></div>
                <div className="sn-sum-row"><span>Transaction</span><strong style={{ wordBreak: 'break-all' }}>{txHash ? shortAddr(txHash) : '—'}</strong></div>
                <div className="sn-sum-row"><span>Network</span><strong>Monad Testnet</strong></div>
              </div>
              <div className="sn-actions">
                <button className="ov-btn" onClick={loadReceipt} disabled={receiptLoading}>{receiptLoading ? 'Loading…' : showReceipt ? 'Hide Receipt' : 'View Receipt'}</button>
                {txHash && <a className="ov-btn" href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Explorer</a>}
              </div>
              {showReceipt && receipt && (
                <div className="sn-summary" style={{ marginTop: 12 }}>
                  <div className="sn-sum-row"><span>Status</span><strong style={{ color: receipt.status === 'success' ? '#16a34a' : '#ef4444' }}>{receipt.status === 'success' ? 'Success' : 'Reverted'}</strong></div>
                  <div className="sn-sum-row"><span>Block</span><strong>#{Number(receipt.blockNumber).toLocaleString('en-US')}</strong></div>
                  <div className="sn-sum-row"><span>Gas used</span><strong>{Number(receipt.gasUsed).toLocaleString('en-US')}</strong></div>
                  {userOpHash && <div className="sn-sum-row"><span>UserOp</span><strong style={{ wordBreak: 'break-all' }}>{shortAddr(userOpHash)}</strong></div>}
                  {txHash && <div className="sn-sum-row"><span>Tx hash</span><strong style={{ wordBreak: 'break-all', fontSize: 12 }}>{txHash}</strong></div>}
                </div>
              )}
              <div className="sn-actions" style={{ marginTop: 12 }}>
                <button className="ov-btn" onClick={dismiss}>Close</button>
                <button className="ov-btn" onClick={reset}>Send Again</button>
                <Link className="ov-btn primary" to="/wallet">Back to Wallet</Link>
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      {recents.length > 0 && (
        <div className="sn-recents">
          <div className="sn-recents-head"><h2>Recent Recipients</h2></div>
          {recents.map(r => (
            <button className="sn-recent" key={r.addr} onClick={() => { setRecipient(r.addr); setStep('form') }}>
              <span className="sn-recent-addr">{shortAddr(r.addr)}</span>
              <span className="sn-recent-last">Last: {r.last}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  </DashboardShell>
}

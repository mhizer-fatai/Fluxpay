import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Clipboard, ExternalLink, QrCode } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { Dropdown } from '@/components/dropdown'
import { useProfile } from '@/hooks/profile'
import { useBalances } from '@/hooks/useBalances'
import { useWallet } from '@/hooks/useWallet'
import { sendFunds, estimateFeeMon } from '@/lib/transfers'
import { buildSettleCalls, getGaslessAddress, hasPimlicoKey, sendGasless } from '@/lib/gasless'
import { fetchActivity } from '@/lib/activity'
import { getUsdPrices, TOKENS, type TokenKey } from '@/lib/chain'
import { resolveUsernameApi } from '@/lib/api'
import { money, shortAddr } from '@/lib/format'
import { EXPLORER_URL } from '@/lib/chain'

type Step = 'form' | 'confirm' | 'sending' | 'success'

const SENDABLE: TokenKey[] = ['USDC', 'AUSD', 'WMON', 'WETH', 'MON']

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
  const { address } = useProfile()
  const { getWalletClient } = useWallet()
  const { rows } = useBalances(address)

  const [step, setStep] = useState<Step>('form')
  const [assetSym, setAssetSym] = useState<TokenKey>('USDC')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [feeMon, setFeeMon] = useState<number | null>(null)
  const [prices, setPrices] = useState<Record<string, number> | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [resolvedTo, setResolvedTo] = useState<string | null>(null)
  const [gasless, setGasless] = useState(() => hasPimlicoKey())
  const [smartAddress, setSmartAddress] = useState<string | null>(null)
  const [userOpHash, setUserOpHash] = useState<string | null>(null)
  const [copiedSmart, setCopiedSmart] = useState(false)
  const [recents, setRecents] = useState<Array<{ addr: string; last: string }>>([])

  const { rows: smartRows, refresh: refreshSmart } = useBalances(smartAddress)

  const spendAddress = gasless && smartAddress ? smartAddress : address
  const spendRows = gasless && smartAddress ? smartRows : rows

  const asset = TOKENS.find(t => t.key === assetSym)!
  const balanceRow = spendRows.find(r => r.key === assetSym)
  const balance = balanceRow?.amount ?? 0
  const amt = parseFloat(amount) || 0
  const usd = prices ? amt * (prices[assetSym] ?? 0) : 0
  const canContinue = recipient.trim().length > 3 && amt > 0 && amt <= balance

  // Derive the deterministic gasless smart-account address once the wallet is ready.
  useEffect(() => {
    if (!gasless || !address || smartAddress) return
    let alive = true
    void getWalletClient()
      .then(async wc => {
        if (!wc || !alive) return
        try {
          const sa = await getGaslessAddress(address as `0x${string}`, wc)
          if (alive) setSmartAddress(sa)
        } catch { /* gasless unavailable — falls back to EOA */ }
      })
      .catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gasless, address])

  useEffect(() => { void getUsdPrices().then(setPrices) }, [])
  useEffect(() => {
    if (!address) return
    fetchActivity(address, 10_000)
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

  useEffect(() => {
    if (gasless) { setFeeMon(null); return } // sponsored — no fee to estimate
    if (!address || !canContinue) { setFeeMon(null); return }
    let alive = true
    const to = /^0x[a-fA-F0-9]{40}$/.test(recipient.trim()) ? (recipient.trim() as `0x${string}`) : null
    if (!to) { setFeeMon(null); return }
    void estimateFeeMon({ from: address as `0x${string}`, token: asset, amountHuman: amt, to })
      .then(f => { if (alive) setFeeMon(f) })
      .catch(() => { if (alive) setFeeMon(null) })
    return () => { alive = false }
  }, [address, recipient, amt, asset, canContinue, gasless])

  const paste = async () => {
    try { const text = await navigator.clipboard.readText(); if (text) setRecipient(text.trim()) } catch { /* ignore */ }
  }
  const reset = () => { setStep('form'); setRecipient(''); setAmount(''); setTxHash(null); setResolvedTo(null); setUserOpHash(null); setError('') }

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
    try {
      const to = await resolveRecipient()
      if (!to) return setError('Recipient must be a valid 0x address or a registered @username')
      setResolvedTo(to)
      const walletClient = await getWalletClient()
      if (!walletClient) throw new Error('wallet_unavailable')

      if (gasless) {
        if (!spendAddress) throw new Error('gasless account not ready — toggle it off or wait a moment')
        const calls = buildSettleCalls({ token: asset, amountHuman: amt, to: to as `0x${string}` })
        const result = await sendGasless({
          walletClient,
          ownerAddress: address as `0x${string}`,
          calls,
          onStatus: s => setBusy(s === 'signing' ? 'Signing sponsored userOp…' : s === 'submitted' ? 'Bundler submitted — waiting…' : 'Confirming…'),
        })
        setUserOpHash(result.userOpHash)
        setTxHash(result.txHash)
        void refreshSmart()
      } else {
        const result = await sendFunds({
          walletClient,
          from: address as `0x${string}`,
          token: asset,
          amountHuman: amt,
          to: to as `0x${string}`,
          onStep: s => setBusy(s === 'approving' ? 'Approving token spend…' : 'Sending…'),
        })
        setTxHash(result.txHash)
      }
      setBusy('')
      setStep('success')
    } catch (e) {
      const err = e as Error & { shortMessage?: string }
      const msg = err.shortMessage || err.message || 'Send failed'
      setError(
        /sponsor|paymaster|policy/i.test(msg)
          ? 'Sponsorship rejected — the Pimlico policy needs funding in the Pimlico dashboard. Toggle gasless off to pay gas yourself.'
          : /insufficient funds/i.test(msg)
            ? 'Not enough gas — get testnet MON from faucet.monad.xyz, or toggle gasless on.'
            : msg,
      )
      setBusy('')
      setStep('confirm')
    }
  }

  const total = feeMon != null ? amt + feeMon : amt

  const summary = useMemo(() => (
    <>
      <div className="sn-sum-row"><span>You&apos;re sending</span><strong>{amt.toLocaleString('en-US', { maximumFractionDigits: 6 })} {asset.symbol}</strong></div>
      <div className="sn-sum-row"><span>To</span><strong>{resolvedTo ? shortAddr(resolvedTo) : recipient}</strong></div>
      <div className="sn-sum-row"><span>Network</span><strong>Monad Testnet</strong></div>
      <div className="sn-sum-row"><span>Network fee</span><strong>{gasless ? 'Sponsored (Pimlico)' : feeMon != null ? `~${feeMon.toFixed(5)} MON` : 'estimating…'}</strong></div>
      <div className="sn-sum-row sn-sum-total"><span>Total</span><strong>{total.toLocaleString('en-US', { maximumFractionDigits: 6 })} {asset.symbol === 'MON' ? 'MON' : `${asset.symbol} + gas`}</strong></div>
    </>
  ), [amt, asset.symbol, resolvedTo, recipient, feeMon, total])

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
                <div><strong>{gasless ? 'Gasless smart wallet' : 'FluxPay Wallet'}</strong><small>{spendAddress ?? 'connecting…'}</small></div>
                <span className="sn-wallet-bal">{balance.toLocaleString('en-US', { maximumFractionDigits: 4 })} {asset.symbol}</span>
              </div>
              <div className="sn-input-row sn-input-row-btns">
                <button
                  className={`sn-inline${gasless ? '' : ' is-soon'}`}
                  onClick={() => setGasless(g => !g)}
                  title={gasless ? 'Pay your own gas from your wallet' : 'Sponsor gas via Pimlico paymaster'}
                >
                  ⚡ {gasless ? 'Gasless: ON' : 'Gasless: OFF'}
                </button>
                {gasless && smartAddress && (
                  <button className="sn-inline" onClick={() => { navigator.clipboard?.writeText(smartAddress).catch(() => {}); setCopiedSmart(true); setTimeout(() => setCopiedSmart(false), 1500) }}>
                    {copiedSmart ? 'Copied' : 'Copy gasless address'}
                  </button>
                )}
              </div>
              {gasless && smartAddress && balance === 0 && (
                <p className="sn-hint">Fund your gasless address once from your wallet, then all future sends cost you no gas.</p>
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
            <div className="sn-fee-row"><span>Gas fee</span><strong>{gasless ? 'Sponsored (Pimlico)' : feeMon != null ? `~${feeMon.toFixed(5)} MON` : 'estimating…'}</strong></div>
            <SlideToSend disabled={!canContinue || !!busy} onComplete={() => setStep('confirm')} />
            {!canContinue && <p className="sn-hint sn-hint-center">Enter a recipient and a valid amount (≤ balance) to continue.</p>}
          </div>
        </div>
      ) : (
        <div className="sn-card">
          {step === 'confirm' && (
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
          )}

          {step === 'sending' && (
            <div className="sn-step">
              <h2>Sending…</h2>
              <p className="sn-hint">{busy || 'Waiting for confirmation on Monad…'}</p>
            </div>
          )}

          {step === 'success' && (
            <div className="sn-step sn-success">
              <span className="sn-success-icon"><Check size={22} /></span>
              <h2>Transfer Sent</h2>
              <p className="sn-success-amount">{amt.toLocaleString('en-US', { maximumFractionDigits: 6 })} {asset.symbol}</p>
              <p className="sn-success-sub">confirmed on Monad testnet.</p>
              <div className="sn-summary">
                <div className="sn-sum-row"><span>To</span><strong>{resolvedTo ? shortAddr(resolvedTo) : recipient}</strong></div>
                <div className="sn-sum-row"><span>Transaction ID</span><strong style={{ wordBreak: 'break-all' }}>{txHash ? shortAddr(txHash) : '—'}</strong></div>
                {userOpHash && <div className="sn-sum-row"><span>UserOp</span><strong style={{ wordBreak: 'break-all' }}>{shortAddr(userOpHash)}</strong></div>}
                <div className="sn-sum-row"><span>Network</span><strong>Monad Testnet{gasless ? ' · gasless' : ''}</strong></div>
              </div>
              <div className="sn-actions">
                {txHash && <a className="ov-btn" href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noreferrer"><ExternalLink size={14} /> View Transaction</a>}
                <button className="ov-btn" onClick={reset}>Send Again</button>
                <Link className="ov-btn primary" to="/wallet">Back to Wallet</Link>
              </div>
            </div>
          )}
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

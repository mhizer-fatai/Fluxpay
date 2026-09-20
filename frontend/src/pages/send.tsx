import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Clipboard, QrCode } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { Dropdown } from '@/components/dropdown'

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const short = (a: string) => a.length > 14 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a

const ADDRESS = '0x7A3F...92B1'
const FEE = 0.02

const assets = [
  { symbol: 'USDC', name: 'USD Coin', balance: 1435.30, price: 1 },
  { symbol: 'MON', name: 'Monad', balance: 18.42, price: 2.32 },
]

const recents = [
  { addr: '0x83F4...A21F', last: '$100 USDC' },
  { addr: '0x71A2...4B92', last: '$50 USDC' },
]

type Step = 'form' | 'confirm' | 'success'

const networks = ['Monad Mainnet', 'Monad Testnet']

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
      <span className="sn-slide-label">{done ? 'Sending…' : 'Slide to send'}</span>
      <button className="sn-slide-handle" style={{ transform: `translateX(${x}px)` }} onPointerDown={onDown} aria-label="Slide to send" disabled={disabled}>
        <ArrowRight size={16} />
      </button>
    </div>
  )
}

export default function SendPage() {
  const [step, setStep] = useState<Step>('form')
  const [assetSym, setAssetSym] = useState('USDC')
  const [network, setNetwork] = useState('Monad Mainnet')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')

  const asset = assets.find(a => a.symbol === assetSym) ?? assets[0]
  const amt = parseFloat(amount) || 0
  const usd = amt * asset.price
  const total = amt + FEE
  const canContinue = recipient.trim().length > 0 && amt > 0 && amt <= asset.balance

  const paste = async () => {
    try { const text = await navigator.clipboard.readText(); if (text) setRecipient(text) } catch { /* ignore */ }
  }
  const reset = () => { setStep('form'); setRecipient(''); setAmount('') }

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
                <div><strong>FluxPay Wallet</strong><small>{ADDRESS}</small></div>
                <span className="sn-wallet-bal">{money(asset.balance)} {asset.symbol}</span>
              </div>
            </div>
            <div className="sn-field">
              <label>Asset</label>
              <Dropdown value={assetSym} options={assets.map(a => ({ value: a.symbol, label: `${a.symbol} — ${a.name}` }))} onChange={setAssetSym} />
              <p className="sn-hint">{asset.balance.toLocaleString()} {asset.symbol} available</p>
            </div>
          </div>

          <div className="sn-panel">
            <h3>Receive</h3>
            <div className="sn-field">
              <label>Recipient wallet address</label>
              <input placeholder="Enter 0x address" value={recipient} onChange={e => setRecipient(e.target.value)} />
              <div className="sn-input-row sn-input-row-btns">
                <button className="sn-inline" onClick={paste}><Clipboard size={13} /> Paste</button>
                <button className="sn-inline"><QrCode size={13} /> Scan QR</button>
              </div>
              <p className="sn-hint">Make sure the recipient address supports the selected network and asset.</p>
            </div>
            <div className="sn-field">
              <label>Network</label>
              <Dropdown value={network} options={networks.map(n => ({ value: n, label: n }))} onChange={setNetwork} />
            </div>
          </div>

          <div className="sn-panel sn-panel-pay">
            <h3>Amount</h3>
            <div className="sn-field">
              <label>Amount</label>
              <div className="sn-input-row">
                <input placeholder={`0.00 ${asset.symbol}`} value={amount} inputMode="decimal" onChange={e => setAmount(e.target.value)} />
                <button className="sn-inline" onClick={() => setAmount(String(asset.balance))}>Max</button>
              </div>
              <p className="sn-hint">Available: {asset.balance.toLocaleString()} {asset.symbol} · ≈ {money(usd)}</p>
            </div>
            <div className="sn-fee-row"><span>Gas fee</span><strong>~{money(FEE)}</strong></div>
            <SlideToSend disabled={!canContinue} onComplete={() => setStep('confirm')} />
            {!canContinue && <p className="sn-hint sn-hint-center">Enter a recipient and a valid amount to continue.</p>}
          </div>
        </div>
      ) : (
        <div className="sn-card">
          {step === 'confirm' && (
            <div className="sn-step">
              <h2>Confirm Transfer</h2>
              <div className="sn-summary">
                <div className="sn-sum-row"><span>You&apos;re sending</span><strong>{amt.toFixed(2)} {asset.symbol}</strong></div>
                <div className="sn-sum-row"><span>To</span><strong>{short(recipient)}</strong></div>
                <div className="sn-sum-row"><span>Network</span><strong>{network}</strong></div>
                <div className="sn-sum-row"><span>Network fee</span><strong>~{money(FEE)}</strong></div>
                <div className="sn-sum-row sn-sum-total"><span>Total</span><strong>{total.toFixed(2)} {asset.symbol}</strong></div>
              </div>
              <p className="sn-warning">Transactions on the blockchain cannot be reversed once confirmed. Please verify the recipient address before continuing.</p>
              <div className="sn-actions">
                <button className="ov-btn" onClick={() => setStep('form')}>Back</button>
                <button className="ov-btn primary" onClick={() => setStep('success')}>Confirm &amp; Send</button>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="sn-step sn-success">
              <span className="sn-success-icon"><Check size={22} /></span>
              <h2>Transfer Sent</h2>
              <p className="sn-success-amount">{amt.toFixed(2)} {asset.symbol}</p>
              <p className="sn-success-sub">sent successfully.</p>
              <div className="sn-summary">
                <div className="sn-sum-row"><span>To</span><strong>{short(recipient)}</strong></div>
                <div className="sn-sum-row"><span>Transaction ID</span><strong>0x8f2...a91</strong></div>
                <div className="sn-sum-row"><span>Network</span><strong>{network}</strong></div>
              </div>
              <div className="sn-actions">
                <button className="ov-btn">View Transaction</button>
                <button className="ov-btn" onClick={reset}>Send Again</button>
                <Link className="ov-btn primary" to="/wallet">Back to Wallet</Link>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="sn-recents">
        <div className="sn-recents-head"><h2>Recent Recipients</h2></div>
        {recents.map(r => (
          <button className="sn-recent" key={r.addr} onClick={() => { setRecipient(r.addr); setStep('form') }}>
            <span className="sn-recent-addr">{r.addr}</span>
            <span className="sn-recent-last">Last sent: {r.last}</span>
          </button>
        ))}
      </div>
    </section>
  </DashboardShell>
}

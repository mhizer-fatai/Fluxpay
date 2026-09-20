import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownLeft, ArrowLeftRight, ArrowRight, Copy, Link2, QrCode, Send, X } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const assets = [
  { id: 'usdc', symbol: 'USDC', name: 'USD Coin', value: 1435.30, amount: '1,435.30 USDC', color: '#2775CA' },
  { id: 'mon', symbol: 'MON', name: 'Monad', value: 42.80, amount: '18.42 MON', color: '#6E56CF' },
  { id: 'inv', symbol: 'INV', name: 'Investments · Tokenized assets', value: 2845.20, amount: '6 assets', color: '#D35A44' },
]

const walletActivity = [
  { title: 'USDC received', sub: 'From 0x83...A21F', amount: '+$250.00', positive: true, when: 'Today' },
  { title: 'USDC sent', sub: 'To 0x71...4B92', amount: '-$50.00', positive: false, when: 'Yesterday' },
  { title: 'MON → USDC', sub: 'Swap', amount: '+$48.20 USDC', positive: true, when: 'Sep 17' },
]

const ADDRESS = '0x7A3F...92B1'

export default function WalletPage() {
  const [asset, setAsset] = useState<typeof assets[number] | null>(null)
  const [copied, setCopied] = useState(false)

  const copyAddress = () => {
    navigator.clipboard?.writeText(ADDRESS).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return <DashboardShell>
    <section className="dashboard-content wa">
      <div className="wa-head">
        <div>
          <h1>Wallet</h1>
          <p className="wa-support">View your balances, manage your assets, and send or receive funds on Monad.</p>
        </div>
      </div>

      <div className="wa-balance">
        <div className="wa-balance-info">
          <span className="wa-label">Total Balance</span>
          <strong className="wa-total">$4,280.50</strong>
          <span className="wa-change">+2.4% this month</span>
          <div className="wa-balance-stats">
            <div><span>Available to spend</span><strong>$1,435.30</strong></div>
            <div><span>Invested</span><strong>$2,845.20</strong></div>
          </div>
          <div className="wa-balance-actions">
            <Link className="wa-btn primary" to="/send"><Send size={15} /> Send</Link>
            <Link className="wa-btn" to="/receive"><ArrowDownLeft size={15} /> Receive</Link>
            <Link className="wa-btn is-soon" to="/swap" aria-disabled="true" onClick={e => e.preventDefault()}><ArrowLeftRight size={15} /> Swap <span className="soon-badge">Soon</span></Link>
            <Link className="wa-btn" to="/payment-link"><Link2 size={15} /> Payment Links</Link>
          </div>
        </div>
        <div className="wa-wallet">
          <div className="wa-wallet-inner">
            <span className="wa-wallet-label">Your FluxPay Wallet</span>
            <p className="wa-addr">{ADDRESS}</p>
            <div className="wa-addr-actions">
              <button className="wa-btn" onClick={copyAddress}><Copy size={14} /> {copied ? 'Copied' : 'Copy Address'}</button>
              <button className="wa-btn"><QrCode size={14} /> QR Code</button>
            </div>
          </div>
        </div>
      </div>

      <div className="wa-card">
        <div className="wa-section-head"><h2>Your Assets</h2></div>
        <div className="wa-assets">
          {assets.map(a => (
            <button className="wa-asset" key={a.id} onClick={() => setAsset(a)}>
              <span className="wa-asset-logo" style={{ background: a.color }}>{a.symbol.slice(0, 2)}</span>
              <span className="wa-asset-name"><strong>{a.symbol}</strong><small>{a.name}</small></span>
              <span className="wa-asset-val"><strong>{money(a.value)}</strong><small>{a.amount}</small></span>
            </button>
          ))}
        </div>
      </div>

      <div className="wa-card">
        <div className="wa-section-head">
          <h2>Recent Wallet Activity</h2>
          <Link className="ov-link" to="/activity">View All Activity <ArrowRight size={14} /></Link>
        </div>
        <div className="wa-activity-list">
          {walletActivity.map(a => (
            <div className="wa-activity" key={a.title}>
              <div className="wa-activity-name"><strong>{a.title}</strong><small>{a.sub}</small></div>
              <span className={`wa-amount ${a.positive ? 'up' : ''}`}>{a.amount}</span>
              <span className="wa-when">{a.when}</span>
            </div>
          ))}
        </div>
      </div>
    </section>

    {asset && (
      <div className="su-modal-backdrop" onClick={() => setAsset(null)}>
        <div className="su-modal" onClick={e => e.stopPropagation()}>
          <div className="su-modal-head">
            <h2>{asset.symbol}</h2>
            <button className="su-close" onClick={() => setAsset(null)} aria-label="Close"><X size={16} /></button>
          </div>
          <div className="pf-detail-grid">
            <div className="su-stat"><small>Asset</small><strong>{asset.name}</strong></div>
            <div className="su-stat"><small>Value</small><strong>{money(asset.value)}</strong></div>
            <div className="su-stat"><small>Balance</small><strong>{asset.amount}</strong></div>
            <div className="su-stat"><small>Network</small><strong>Monad</strong></div>
          </div>
          <div className="pf-modal-actions">
            <Link className="ov-btn primary" to="/send">Send</Link>
            <Link className="ov-btn is-soon" to="/swap" aria-disabled="true" onClick={e => e.preventDefault()}>Swap <span className="soon-badge">Soon</span></Link>
          </div>
        </div>
      </div>
    )}
  </DashboardShell>
}

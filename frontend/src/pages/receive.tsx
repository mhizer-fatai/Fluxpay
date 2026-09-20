import { useState } from 'react'
import { Copy, Maximize2, Share2 } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { QrCode } from '@/components/qr-code'

const ADDRESS = '0x7A3F...92B1'

export default function ReceivePage() {
  const [copied, setCopied] = useState(false)

  const copyAddress = () => {
    navigator.clipboard?.writeText(ADDRESS).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'FluxPay Wallet', text: ADDRESS }) } catch { /* ignore */ }
    } else copyAddress()
  }

  return <DashboardShell>
    <section className="dashboard-content rc">
      <div className="rc-head">
        <h1>Receive</h1>
      </div>

      <div className="rc-card rc-main">
        <h2>Your Wallet</h2>
        <div className="rc-network"><span>Network</span><strong>Monad</strong></div>
        <QrCode className="rc-qr" />
        <button className="rc-fullscreen"><Maximize2 size={13} /> QR fullscreen</button>
        <p className="rc-addr-label">Wallet Address</p>
        <p className="rc-addr">{ADDRESS}</p>
        <div className="rc-actions">
          <button className="ov-btn primary" onClick={copyAddress}><Copy size={15} /> {copied ? 'Copied' : 'Copy Address'}</button>
          <button className="ov-btn" onClick={share}><Share2 size={15} /> Share</button>
        </div>
      </div>
    </section>
  </DashboardShell>
}

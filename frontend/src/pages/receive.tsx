import { useState } from 'react'
import { Copy, Maximize2, Share2, X } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { QrCode } from '@/components/qr-code'
import { useProfile } from '@/hooks/profile'
import { shortAddr } from '@/lib/format'

export default function ReceivePage() {
  const { address, profile } = useProfile()
  const [copied, setCopied] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const copyAddress = () => {
    if (!address) return
    navigator.clipboard?.writeText(address).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }
  const share = async () => {
    if (!address) return
    if (navigator.share) {
      try { await navigator.share({ title: `Pay me on FluxPay${profile?.username ? ` (@${profile.username})` : ''}`, text: address }) } catch { /* ignore */ }
    } else copyAddress()
  }

  return <DashboardShell>
    <section className="dashboard-content rc">
      <div className="rc-head">
        <h1>Receive</h1>
      </div>

      <div className="rc-card rc-main">
        <h2>Your Wallet</h2>
        <div className="rc-network"><span>Network</span><strong>Monad Testnet</strong></div>
        {address ? (
          <QrCode className="rc-qr" value={address} />
        ) : (
          <div className="rc-qr" style={{ display: 'grid', placeItems: 'center' }}>Connecting wallet…</div>
        )}
        <button className="rc-fullscreen" onClick={() => setFullscreen(true)} disabled={!address}><Maximize2 size={13} /> QR fullscreen</button>
        {profile?.username && <p className="rc-addr-label">Your username</p>}
        {profile?.username && <p className="rc-addr">@{profile.username}</p>}
        <p className="rc-addr-label">Wallet Address</p>
        <p className="rc-addr">{address ?? 'connecting…'}</p>
        <div className="rc-actions">
          <button className="ov-btn primary" onClick={copyAddress} disabled={!address}><Copy size={15} /> {copied ? 'Copied' : 'Copy Address'}</button>
          <button className="ov-btn" onClick={share} disabled={!address}><Share2 size={15} /> Share</button>
        </div>
      </div>
    </section>

    {fullscreen && address && (
      <div className="su-modal-backdrop" onClick={() => setFullscreen(false)}>
        <div className="su-modal" onClick={e => e.stopPropagation()}>
          <div className="su-modal-head">
            <h2>Scan to pay</h2>
            <button className="su-close" onClick={() => setFullscreen(false)} aria-label="Close"><X size={16} /></button>
          </div>
          <div style={{ display: 'grid', placeItems: 'center', padding: 12 }}>
            <QrCode value={address} size={320} />
            <p style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 12, wordBreak: 'break-all' }}>{shortAddr(address)} · Monad Testnet</p>
          </div>
        </div>
      </div>
    )}
  </DashboardShell>
}

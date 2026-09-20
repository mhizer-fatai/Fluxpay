import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Bell, ChevronRight, Copy, ExternalLink, LifeBuoy, Lock, Minus, Palette, Plug, Plus, ShieldCheck, TrendingUp, User, Wallet, type LucideIcon } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'

function Toggle({ on, onChange, disabled }: { on: boolean; onChange?: () => void; disabled?: boolean }) {
  return <button type="button" className={`st-toggle${on ? ' on' : ''}`} onClick={onChange} disabled={disabled} aria-pressed={on}><span /></button>
}

function Row({ title, desc, children }: { title: string; desc?: string; children?: React.ReactNode }) {
  return (
    <div className="st-row">
      <div className="st-row-text"><strong>{title}</strong>{desc && <small>{desc}</small>}</div>
      {children && <div className="st-row-control">{children}</div>}
    </div>
  )
}

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div className="st-card">
      <div className="st-card-head"><span className="st-card-icon"><Icon size={16} /></span><h2>{title}</h2></div>
      <div className="st-card-body">{children}</div>
    </div>
  )
}

export default function SettingsPage() {
  const [theme, setTheme] = useState('System')
  const [rate, setRate] = useState(2)
  const [notif, setNotif] = useState({ tx: true, payment: true, investment: true, subscription: true, portfolio: true, security: true, product: false })
  const [channels, setChannels] = useState({ email: true, inapp: true, telegram: false, discord: false })
  const [connected, setConnected] = useState({ telegram: true, discord: false, google: true, apple: false })

  const flip = <T extends object>(set: React.Dispatch<React.SetStateAction<T>>, key: keyof T) => set(p => ({ ...p, [key]: !p[key] }))

  return <DashboardShell>
    <section className="dashboard-content st">
      <div className="st-head">
        <h1>Settings</h1>
        <p className="st-support">Manage your account, security, preferences, and connected wallets.</p>
      </div>

      <Section icon={User} title="Profile">
        <div className="st-profile">
          <span className="st-avatar">JD</span>
          <div className="st-profile-fields">
            <Row title="Full Name"><strong>Timothy Bayode</strong></Row>
            <Row title="Email"><strong>timothy@example.com</strong></Row>
            <Row title="Username"><strong>@timothy</strong></Row>
            <Row title="Account ID"><strong>FLX-829104</strong></Row>
            <Row title="Login provider" desc="Connected via social login"><span className="st-chip">Google</span></Row>
          </div>
        </div>
        <div className="st-actions"><button className="ov-btn primary">Edit Profile</button></div>
      </Section>

      <Section icon={Wallet} title="Wallets & Connections">
        <div className="st-sub">Primary Wallet</div>
        <div className="st-wallet">
          <span className="st-wallet-addr">0x7A3F...92B1</span>
          <span className="st-chip">Monad</span>
          <span className="st-chip st-chip-solid">Primary</span>
          <div className="st-wallet-actions">
            <button className="st-icon-action" aria-label="Copy address"><Copy size={14} /></button>
            <Link className="st-icon-action" to="/wallet" aria-label="View wallet"><ExternalLink size={14} /></Link>
          </div>
        </div>
        <div className="st-sub">Linked Wallets</div>
        <div className="st-wallet">
          <span className="st-wallet-addr">0x83F4...A21F</span>
          <span className="st-chip">Monad</span>
          <div className="st-wallet-actions">
            <button className="st-text-btn">Set as Primary</button>
            <button className="st-text-btn st-danger">Remove</button>
          </div>
        </div>
        <div className="st-sub">Recovery Wallet</div>
        <div className="st-wallet">
          <span className="st-wallet-addr">0x92...71AC</span>
          <span className="st-chip">Monad</span>
          <span className="st-muted">Recovery wallet connected</span>
          <div className="st-wallet-actions"><button className="st-text-btn">Change Recovery Wallet</button></div>
        </div>
        <div className="st-actions"><button className="ov-btn"><Plus size={14} /> Add Wallet</button></div>
      </Section>

      <Section icon={ShieldCheck} title="Security">
        <Row title="Wallet authentication" desc="Sign in with your connected wallet"><span className="st-chip st-chip-solid">Enabled</span></Row>
        <Row title="Telegram Recovery" desc="Use Telegram to recover access to your account if you lose your primary wallet.">
          <span className="st-status on">Connected</span>
          <button className="st-text-btn">Manage</button>
        </Row>
        <Row title="Discord Recovery" desc="Add Discord as a backup recovery method.">
          <span className="st-status">Not Connected</span>
          <button className="st-text-btn">Connect Discord</button>
        </Row>
        <Row title="Recovery Wallet" desc="0x92...71AC is set as your recovery wallet.">
          <span className="st-status on">Connected</span>
          <button className="st-text-btn">Manage</button>
        </Row>
        <div className="st-sub">Active Sessions</div>
        <Row title="MacBook Pro · Lagos" desc="Current session · Chrome"><button className="st-text-btn st-danger">Sign out</button></Row>
        <Row title="iPhone 15 · Lagos" desc="Last active 2 days ago"><button className="st-text-btn st-danger">Sign out</button></Row>
        <div className="st-actions"><button className="ov-btn">Sign out of all devices</button></div>
        <div className="st-sub">Security Activity</div>
        <div className="st-activity">
          <div className="st-activity-row"><span>Wallet connected</span><small>Today, 10:42 AM</small></div>
          <div className="st-activity-row"><span>Recovery method added</span><small>Sep 17, 9:12 AM</small></div>
          <div className="st-activity-row"><span>New device login</span><small>Sep 14, 6:03 PM</small></div>
        </div>
      </Section>

      <Section icon={TrendingUp} title="Pay & Own Preferences">
        <Row title="Pay & Own" desc="Automatically invest according to your preferences."><Toggle on={true} /></Row>
        <Row title="Default Investment Rate" desc={`${rate}% of eligible payments`}>
          <div className="st-stepper">
            <button onClick={() => setRate(r => Math.max(0, r - 1))} aria-label="Decrease"><Minus size={14} /></button>
            <strong>{rate}%</strong>
            <button onClick={() => setRate(r => Math.min(10, r + 1))} aria-label="Increase"><Plus size={14} /></button>
          </div>
        </Row>
        <Row title="Minimum Investment" desc="Investments below this amount are held until the threshold is reached."><span className="st-value">$1.00</span></Row>
        <Row title="Investment Funding Asset"><span className="st-value">USDC</span></Row>
        <Row title="Default Investment Asset"><span className="st-value">NVIDIA</span></Row>
        <Row title="Automatic Investment"><Toggle on={true} /></Row>
      </Section>

      <Section icon={Bell} title="Notifications">
        <Row title="Transaction confirmations"><Toggle on={notif.tx} onChange={() => flip(setNotif, 'tx')} /></Row>
        <Row title="Payment received"><Toggle on={notif.payment} onChange={() => flip(setNotif, 'payment')} /></Row>
        <Row title="Investment executed"><Toggle on={notif.investment} onChange={() => flip(setNotif, 'investment')} /></Row>
        <Row title="Subscription investment"><Toggle on={notif.subscription} onChange={() => flip(setNotif, 'subscription')} /></Row>
        <Row title="Portfolio updates"><Toggle on={notif.portfolio} onChange={() => flip(setNotif, 'portfolio')} /></Row>
        <Row title="Security alerts" desc="Important security notifications cannot be disabled."><Toggle on={notif.security} disabled /></Row>
        <Row title="Product updates"><Toggle on={notif.product} onChange={() => flip(setNotif, 'product')} /></Row>
        <div className="st-sub">Channels</div>
        <div className="st-chips">
          <button className={`st-channel${channels.email ? ' on' : ''}`} onClick={() => flip(setChannels, 'email')}>Email</button>
          <button className={`st-channel${channels.inapp ? ' on' : ''}`} onClick={() => flip(setChannels, 'inapp')}>In-app</button>
          <button className={`st-channel${channels.telegram ? ' on' : ''}`} onClick={() => flip(setChannels, 'telegram')}>Telegram</button>
          <button className={`st-channel${channels.discord ? ' on' : ''}`} onClick={() => flip(setChannels, 'discord')}>Discord</button>
        </div>
      </Section>

      <Section icon={Palette} title="Appearance">
        <Row title="Theme">
          <div className="st-seg">
            {['System', 'Light', 'Dark'].map(t => <button key={t} className={t === theme ? 'on' : ''} onClick={() => setTheme(t)}>{t}</button>)}
          </div>
        </Row>
        <Row title="Currency"><span className="st-value">USD</span></Row>
        <Row title="Language"><span className="st-value">English</span></Row>
        <Row title="Time zone"><span className="st-value">GMT+1 · Lagos</span></Row>
      </Section>

      <Section icon={Plug} title="Connected Services">
        {([['telegram', 'Telegram'], ['discord', 'Discord'], ['google', 'Google'], ['apple', 'Apple']] as const).map(([key, label]) => (
          <Row title={label} key={key}>
            <span className={`st-status${connected[key] ? ' on' : ''}`}>{connected[key] ? 'Connected' : 'Not Connected'}</span>
            <button className="st-text-btn" onClick={() => flip(setConnected, key)}>{connected[key] ? 'Manage' : 'Connect'}</button>
          </Row>
        ))}
      </Section>

      <Section icon={Lock} title="Privacy & Data">
        <Row title="Privacy settings" desc="Control what data FluxPay can access."><button className="st-text-btn">Manage</button></Row>
        <Row title="Data preferences" desc="Choose how your data is used to improve FluxPay."><button className="st-text-btn">Manage</button></Row>
        <Row title="Download account data" desc="Get a copy of your account and transaction data."><button className="st-text-btn">Download</button></Row>
        <Row title="Delete account" desc="Permanently delete your account and associated data."><button className="st-text-btn st-danger">Delete</button></Row>
      </Section>

      <Section icon={LifeBuoy} title="Support">
        <div className="st-links">
          <Link to="/help">Help Center <ChevronRight size={14} /></Link>
          <Link to="/help">Contact Support <ChevronRight size={14} /></Link>
          <Link to="/help">Report a Problem <ChevronRight size={14} /></Link>
          <Link to="/help">Terms of Service <ChevronRight size={14} /></Link>
          <Link to="/help">Privacy Policy <ChevronRight size={14} /></Link>
        </div>
      </Section>

      <div className="st-card st-danger-zone">
        <div className="st-card-head"><span className="st-card-icon danger"><AlertTriangle size={16} /></span><h2>Danger Zone</h2></div>
        <div className="st-card-body">
          <Row title="Disconnect all wallets" desc="Remove every wallet connected to your account."><button className="st-text-btn st-danger">Disconnect</button></Row>
          <Row title="Sign out of all devices" desc="End every active session across all devices."><button className="st-text-btn st-danger">Sign out</button></Row>
          <Row title="Delete FluxPay account" desc="Permanently delete your account and associated data."><button className="ov-btn st-danger-btn">Delete Account</button></Row>
        </div>
      </div>
    </section>
  </DashboardShell>
}

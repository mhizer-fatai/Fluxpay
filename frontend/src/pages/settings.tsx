import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, Bell, ChevronRight, Copy, ExternalLink, LifeBuoy, Lock, Minus, Palette, Plus, ShieldCheck, TrendingUp, User, Wallet, type LucideIcon } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { useProfile } from '@/hooks/profile'
import { useWallet } from '@/hooks/useWallet'
import { saveProfile } from '@/lib/api'
import { initials, shortAddr } from '@/lib/format'
import { EXPLORER_URL } from '@/lib/chain'

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

const PREFS_KEY = 'fluxpay_prefs'
const loadPrefs = () => {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') } catch { return {} }
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const { profile, refresh } = useProfile()
  const { address, logout, user } = useWallet()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  const prefs = loadPrefs()
  const [rate, setRate] = useState<number>(prefs.rate ?? 2)
  const [notif, setNotif] = useState<Record<string, boolean>>({ tx: true, payment: true, investment: true, subscription: true, portfolio: true, product: false, ...(prefs.notif ?? {}) })
  const [theme, setTheme] = useState(prefs.theme ?? 'Dark')

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ rate, notif, theme }))
  }, [rate, notif, theme])

  const providers = [user?.google ? 'Google' : null, user?.twitter ? 'X / Twitter' : null, user?.apple ? 'Apple' : null, user?.email ? 'Email' : null, user?.wallet ? 'Wallet' : null].filter(Boolean) as string[]

  const save = async () => {
    if (!address || !name.trim()) return
    setSaving(true)
    try {
      await saveProfile({ address, fullName: name.trim(), email: email.trim() || undefined })
      await refresh()
      setEditing(false)
      setSavedMsg('Profile saved')
      setTimeout(() => setSavedMsg(''), 2000)
    } catch (e) {
      setSavedMsg((e as Error).message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const signOut = () => {
    void logout().finally(() => navigate('/auth'))
  }

  const displayName = profile?.fullName || '—'
  const flipNotif = (k: string) => setNotif(p => ({ ...p, [k]: !p[k] }))

  return <DashboardShell>
    <section className="dashboard-content st">
      <div className="st-head">
        <h1>Settings</h1>
        <p className="st-support">Manage your account, security, preferences, and connected wallets.</p>
      </div>

      <Section icon={User} title="Profile">
        <div className="st-profile">
          <span className="st-avatar">{initials(profile?.fullName || profile?.username || 'U')}</span>
          <div className="st-profile-fields">
            {editing ? (
              <>
                <Row title="Full Name"><input value={name} onChange={e => setName(e.target.value)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '6px 10px', color: 'inherit' }} /></Row>
                <Row title="Email"><input value={email} onChange={e => setEmail(e.target.value)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '6px 10px', color: 'inherit' }} /></Row>
                <div className="st-actions">
                  <button className="ov-btn primary" onClick={save} disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save'}</button>
                  <button className="ov-btn" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <Row title="Full Name"><strong>{displayName}</strong></Row>
                <Row title="Email"><strong>{profile?.email || '—'}</strong></Row>
                <Row title="Username"><strong>{profile?.username ? `@${profile.username}` : '—'}</strong></Row>
                <Row title="Wallet"><strong>{address ? shortAddr(address) : '—'}</strong></Row>
                <Row title="Login provider" desc="Managed by Privy authentication"><span className="st-chip">{providers[0] ?? 'Privy'}</span></Row>
                <div className="st-actions">
                  <button className="ov-btn primary" onClick={() => { setName(profile?.fullName || ''); setEmail(profile?.email || ''); setEditing(true) }}>Edit Profile</button>
                  {savedMsg && <small style={{ marginLeft: 10 }}>{savedMsg}</small>}
                </div>
              </>
            )}
          </div>
        </div>
      </Section>

      <Section icon={Wallet} title="Wallet">
        <div className="st-sub">Primary Wallet (Privy-managed)</div>
        <div className="st-wallet">
          <span className="st-wallet-addr">{address ?? 'connecting…'}</span>
          <span className="st-chip">Monad</span>
          <span className="st-chip st-chip-solid">Primary</span>
          <div className="st-wallet-actions">
            <button className="st-icon-action" aria-label="Copy address" onClick={() => { if (address) { navigator.clipboard?.writeText(address).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500) } }}><Copy size={14} /></button>
            {address && <a className="st-icon-action" href={`${EXPLORER_URL}/address/${address}`} target="_blank" rel="noreferrer" aria-label="View on explorer"><ExternalLink size={14} /></a>}
          </div>
        </div>
        {copied && <small>Copied to clipboard</small>}
      </Section>

      <Section icon={ShieldCheck} title="Security">
        <Row title="Authentication" desc="Social login + Privy embedded wallet signing on Monad testnet"><span className="st-chip st-chip-solid">Active</span></Row>
        <Row title="Active session" desc={typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 80) : undefined}><button className="st-text-btn st-danger" onClick={signOut}>Sign out</button></Row>
        <Row title="Sign out of all devices" desc="Ends this Privy session; re-login required."><button className="st-text-btn st-danger" onClick={signOut}>Sign out everywhere</button></Row>
        <div className="st-sub">Login methods</div>
        {providers.length === 0 && <small>No providers loaded yet.</small>}
        {providers.map(p => <Row title={p} key={p}><span className="st-status on">Linked</span></Row>)}
      </Section>

      <Section icon={TrendingUp} title="Pay & Own Preferences">
        <Row title="Default Investment Rate" desc={`${rate}% of eligible payments (stored on this device)`}>
          <div className="st-stepper">
            <button onClick={() => setRate(r => Math.max(0, r - 1))} aria-label="Decrease"><Minus size={14} /></button>
            <strong>{rate}%</strong>
            <button onClick={() => setRate(r => Math.min(10, r + 1))} aria-label="Increase"><Plus size={14} /></button>
          </div>
        </Row>
        <Row title="Investment Funding Asset"><span className="st-value">USDC</span></Row>
        <Row title="Automatic Investment"><Toggle on={prefs.autoInvest !== false} onChange={() => { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs, autoInvest: prefs.autoInvest === false })) }} /></Row>
      </Section>

      <Section icon={Bell} title="Notifications">
        {[['tx', 'Transaction confirmations'], ['payment', 'Payment received'], ['investment', 'Investment executed'], ['subscription', 'Subscription investment'], ['product', 'Product updates']].map(([k, label]) => (
          <Row title={label} key={k}><Toggle on={notif[k] !== false} onChange={() => flipNotif(k)} /></Row>
        ))}
        <Row title="Security alerts" desc="Always on"><Toggle on disabled /></Row>
      </Section>

      <Section icon={Palette} title="Appearance">
        <Row title="Theme">
          <div className="st-seg">
            {['System', 'Light', 'Dark'].map(t => <button key={t} className={t === theme ? 'on' : ''} onClick={() => setTheme(t)}>{t}</button>)}
          </div>
        </Row>
        <Row title="Currency"><span className="st-value">USD</span></Row>
        <Row title="Language"><span className="st-value">English</span></Row>
      </Section>

      <Section icon={LifeBuoy} title="Support">
        <div className="st-links">
          <Link to="/help">Help Center <ChevronRight size={14} /></Link>
          <Link to="/terminal">AI Terminal <ChevronRight size={14} /></Link>
          <Link to="/help">Report a Problem <ChevronRight size={14} /></Link>
        </div>
      </Section>

      <div className="st-card st-danger-zone">
        <div className="st-card-head"><span className="st-card-icon danger"><AlertTriangle size={16} /></span><h2>Danger Zone</h2></div>
        <div className="st-card-body">
          <Row title="Sign out" desc="Log out of FluxPay on this device."><button className="st-text-btn st-danger" onClick={signOut}>Sign out</button></Row>
        </div>
      </div>
    </section>
  </DashboardShell>
}

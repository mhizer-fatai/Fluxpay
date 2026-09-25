import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '@/hooks/useWallet'
import { useProfile } from '@/hooks/profile'
import { checkUsername } from '@/lib/api'

const USERNAME_RE = /^[a-z0-9_]{3,32}$/

type Phase = 'form' | 'saving' | 'done'

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { ready, authenticated, address } = useWallet()
  const { completeOnboarding, profile, status } = useProfile()

  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [avail, setAvail] = useState<'idle' | 'checking' | 'free' | 'taken' | 'invalid' | 'error'>('idle')
  const [phase, setPhase] = useState<Phase>('form')
  const [error, setError] = useState('')
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Already onboarded? go straight in.
  useEffect(() => {
    if (status === 'onboarded' && profile?.username) navigate('/dashboard', { replace: true })
  }, [status, profile, navigate])

  useEffect(() => {
    if (ready && !authenticated) navigate('/auth', { replace: true })
  }, [ready, authenticated, navigate])

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    const u = username.trim().toLowerCase()
    if (!u) { setAvail('idle'); return }
    if (!USERNAME_RE.test(u)) { setAvail('invalid'); return }
    setAvail('checking')
    debounce.current = setTimeout(async () => {
      try {
        const r = await checkUsername(u)
        setAvail(r.available ? 'free' : 'taken')
      } catch {
        setAvail('error')
      }
    }, 400)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [username])

  const submit = async () => {
    setError('')
    if (!fullName.trim()) return setError('Enter your full name')
    if (avail !== 'free') return setError('Pick a valid, available username')
    if (!address) return setError('Wallet not ready yet — try again in a moment')
    try {
      setPhase('saving')
      const u = username.trim().toLowerCase()
      await completeOnboarding({ username: u, fullName: fullName.trim() })
      setPhase('done')
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setPhase('form')
      const e = err as Error & { status?: number }
      if (e.status === 409) {
        setAvail('taken')
        setError(`@${username} was just taken — pick another`)
      } else {
        setError(e.message || 'Could not save your account — try again')
      }
    }
  }

  const busy = phase === 'saving'

  return (
    <main className="auth-page">
      <div className="auth-card" style={{ gridTemplateColumns: '1fr' }}>
        <div className="auth-form" style={{ padding: 32 }}>
          <p className="auth-welcome">Set up your FluxPay account</p>
          <h2 style={{ margin: '0 0 18px', fontSize: 22 }}>Claim your username</h2>

          <p className="auth-email-label">Full name</p>
          <input
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="e.g. Ada Lovelace"
            autoComplete="name"
            disabled={busy}
          />

          <p className="auth-email-label">Username</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--muted, #999)' }}>@</span>
            <input
              value={username}
              onChange={e => setUsername(e.target.value.toLowerCase().replace(/^@+/, ''))}
              placeholder="ada"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              style={{ flex: 1 }}
            />
          </div>
          <p style={{ minHeight: 18, margin: '6px 0 14px', fontSize: 12 }}>
            {avail === 'checking' && 'Checking availability…'}
            {avail === 'error' && <span style={{ color: '#f59e0b' }}>Availability check failed — try again in a moment.</span>}
            {avail === 'free' && <span style={{ color: '#22c55e' }}>@{username} is available</span>}
            {avail === 'taken' && <span style={{ color: '#ef4444' }}>@{username} is already taken</span>}
            {avail === 'invalid' && username && <span style={{ color: '#ef4444' }}>3–32 chars: a-z, 0-9, _</span>}
          </p>

          <p className="auth-email-label">Wallet</p>
          <p style={{ fontFamily: 'monospace', fontSize: 12, margin: '0 0 16px', wordBreak: 'break-all' }}>
            {address ?? 'connecting…'}
          </p>

          {error && <p style={{ color: '#ef4444', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}

          <button className="auth-submit" disabled={busy || avail !== 'free' || !fullName.trim()} onClick={submit}>
            {busy ? 'Saving…' : 'Create account'}
          </button>
          {busy && <p style={{ fontSize: 12, marginTop: 10 }}>Reserving @{username}…</p>}
          <p style={{ fontSize: 11, marginTop: 14, color: 'var(--muted, #999)' }}>
            Usernames are first-come, first-served — no gas needed.
          </p>
        </div>
      </div>
    </main>
  )
}

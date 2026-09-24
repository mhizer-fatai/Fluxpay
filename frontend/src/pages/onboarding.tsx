import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '@/hooks/useWallet'
import { useProfile } from '@/hooks/profile'
import { checkUsername } from '@/lib/api'
import { FLUXPAY_ADDRESS, REGISTRY_ADDRESS, USERNAME_HASH, EXPLORER_URL, monadTestnet, publicClient, registryAbi } from '@/lib/chain'
import type { Hash } from 'viem'

const USERNAME_RE = /^[a-z0-9_]{3,32}$/

type Phase = 'form' | 'sending' | 'mining' | 'saving' | 'done' | 'error'

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { ready, authenticated, address, getWalletClient } = useWallet()
  const { completeOnboarding, profile, status } = useProfile()

  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [avail, setAvail] = useState<'idle' | 'checking' | 'free' | 'taken' | 'invalid'>('idle')
  const [phase, setPhase] = useState<Phase>('form')
  const [txHash, setTxHash] = useState<Hash | null>(null)
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
        setAvail('invalid')
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
      const walletClient = await getWalletClient()
      if (!walletClient) throw new Error('wallet_unavailable')
      setPhase('sending')
      const u = username.trim().toLowerCase()
      const hash = await walletClient.writeContract({
        account: address as `0x${string}`,
        chain: monadTestnet,
        address: REGISTRY_ADDRESS,
        abi: registryAbi,
        functionName: 'register',
        args: [USERNAME_HASH(u), u],
      })
      setTxHash(hash)
      setPhase('mining')
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('tx_reverted')
      setPhase('saving')
      await completeOnboarding({ username: u, txHash: hash, fullName: fullName.trim() })
      setPhase('done')
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setPhase('form')
      const e = err as Error & { shortMessage?: string; details?: string }
      const msg = e.shortMessage || e.details || e.message || 'Something went wrong'
      setError(
        /insufficient funds/i.test(msg)
          ? 'Your wallet has no gas. Get testnet MON from the faucet (faucet.monad.xyz) and try again.'
          : msg,
      )
    }
  }

  const busy = phase === 'sending' || phase === 'mining' || phase === 'saving'

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
              onChange={e => setUsername(e.target.value.toLowerCase())}
              placeholder="ada"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              style={{ flex: 1 }}
            />
          </div>
          <p style={{ minHeight: 18, margin: '6px 0 14px', fontSize: 12 }}>
            {avail === 'checking' && 'Checking availability…'}
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
            {phase === 'sending' && 'Confirm in wallet…'}
            {phase === 'mining' && 'Registering on-chain…'}
            {phase === 'saving' && 'Saving profile…'}
            {!busy && 'Create account'}
          </button>
          {busy && <p style={{ fontSize: 12, marginTop: 10 }}>Registering @{username} on Monad testnet — this costs a little gas.</p>}
          {txHash && (
            <p style={{ fontSize: 11, marginTop: 8, wordBreak: 'break-all' }}>
              tx: <a href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noreferrer">{txHash}</a>
            </p>
          )}
          <p style={{ fontSize: 11, marginTop: 14, color: 'var(--muted, #999)' }}>
            Contract: {REGISTRY_ADDRESS} · Paymaster: {FLUXPAY_ADDRESS.slice(0, 10)}…
          </p>
        </div>
      </div>
    </main>
  )
}

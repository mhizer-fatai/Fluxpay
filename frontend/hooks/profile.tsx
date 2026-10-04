import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useWallet } from './useWallet'
import { claimUsername, resolveProfile, setTokenProvider, setTokenRefresher, type Profile } from '../lib/api'

type ProfileStatus = 'loading' | 'onboarded' | 'needs_onboarding' | 'anonymous' | 'unreachable' | 'session_expired'

interface ProfileCtx {
  status: ProfileStatus
  profile: Profile | null
  address: string | null
  refresh: () => Promise<void>
  completeOnboarding: (args: { username: string; fullName: string; email?: string }) => Promise<Profile>
}

const Ctx = createContext<ProfileCtx | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, address, smartAddress, getAccessToken, logout } = useWallet()
  const [status, setStatus] = useState<ProfileStatus>('loading')
  const [profile, setProfile] = useState<Profile | null>(null)
  // Guards the best-effort Privy logout so a dead session can't trigger a
  // logout storm across re-renders/retries.
  const sessionEndedRef = useRef(false)

  useEffect(() => {
    setTokenProvider(getAccessToken)
    setTokenRefresher(getAccessToken)
  }, [getAccessToken])

  // A new successful login re-arms the session-ended guard.
  useEffect(() => {
    if (authenticated) sessionEndedRef.current = false
  }, [authenticated])

  // Identity lives on the EOA row; money routes to the smart account row when present.
  const refresh = useCallback(async () => {
    if (!authenticated) {
      setStatus('anonymous')
      setProfile(null)
      return
    }
    // Session already ended this cycle: don't hammer the backend; stay routed
    // to /auth until a fresh login re-arms the guard.
    if (sessionEndedRef.current) {
      setProfile(null)
      setStatus('session_expired')
      return
    }
    // Embedded wallet may still be creating right after login — wait for an address
    if (!address) {
      setStatus('loading')
      return
    }
    setStatus('loading')
    try {
      // One call across candidates: smart-account profile first, legacy EOA row second.
      const candidates = [smartAddress, address].filter((a): a is string => Boolean(a))
      const p = await resolveProfile(candidates)
      setProfile(p)
      setStatus('onboarded')
    } catch (err) {
      const e = err as { status?: number; code?: string }
      if (e.status === 404) {
        setProfile(null)
        setStatus('needs_onboarding')
      } else if (e.status === 401) {
        // Token missing or rejected even after the single refresh retry. This is
        // a session problem, not a backend blip: route to /auth and clear the
        // dead Privy session ONCE (best-effort — logout 400s if it is already gone).
        if (!sessionEndedRef.current) {
          sessionEndedRef.current = true
          try { await logout() } catch { /* session already invalid */ }
        }
        setProfile(null)
        setStatus('session_expired')
      } else {
        // Backend down / 5xx / network blip: this is NOT "no account".
        // Mark unreachable so guards show a retry screen instead of
        // bouncing a logged-in user into the onboarding funnel.
        setProfile(null)
        setStatus('unreachable')
      }
    }
  }, [authenticated, address, smartAddress, logout])

  useEffect(() => {
    if (!ready) return
    void refresh()
  }, [ready, refresh])

  // Transient backend outage: retry with backoff instead of stranding the user.
  // refresh() flips status itself (onboarded / needs_onboarding on success),
  // which cleans this loop up; repeated failures just reschedule.
  useEffect(() => {
    if (status !== 'unreachable') return
    let cancelled = false
    let tries = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    const attempt = async () => {
      if (cancelled) return
      await refresh()
      if (cancelled) return
      tries += 1
      if (tries < 8) timer = setTimeout(attempt, Math.min(2000 * tries, 15000))
    }
    timer = setTimeout(attempt, 2000)
    const onOnline = () => { if (timer) clearTimeout(timer); void attempt() }
    window.addEventListener('online', onOnline)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      window.removeEventListener('online', onOnline)
    }
  }, [status, refresh])

  // If authenticated but wallet not ready yet, poll briefly before deciding anything.
  useEffect(() => {
    if (!ready || !authenticated || address) return
    let tries = 0
    const timer = setInterval(() => {
      tries += 1
      if (address || tries > 15) {
        clearInterval(timer)
        void refresh()
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [ready, authenticated, address, refresh])

  const completeOnboarding = useCallback(
    async (args: { username: string; fullName: string; email?: string }) => {
      // Bind the username to the smart (money) account when known so payments
      // resolve there; otherwise fall back to the EOA.
      const bindAddress = smartAddress ?? address
      if (!bindAddress) throw new Error('wallet_not_ready')
      const p = await claimUsername({ ...args, address: bindAddress })
      setProfile(p)
      setStatus('onboarded')
      return p
    },
    [address, smartAddress],
  )

  return <Ctx.Provider value={{ status, profile, address, refresh, completeOnboarding }}>{children}</Ctx.Provider>
}

export function useProfile() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}

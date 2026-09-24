import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useWallet } from './useWallet'
import { claimUsername, fetchProfile, setTokenProvider, type Profile } from '../lib/api'

type ProfileStatus = 'loading' | 'onboarded' | 'needs_onboarding' | 'anonymous'

interface ProfileCtx {
  status: ProfileStatus
  profile: Profile | null
  address: string | null
  refresh: () => Promise<void>
  completeOnboarding: (args: { username: string; txHash: string; fullName: string; email?: string }) => Promise<Profile>
}

const Ctx = createContext<ProfileCtx | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, address, getAccessToken } = useWallet()
  const [status, setStatus] = useState<ProfileStatus>('loading')
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    setTokenProvider(getAccessToken)
  }, [getAccessToken])

  const refresh = useCallback(async () => {
    if (!authenticated) {
      setStatus('anonymous')
      setProfile(null)
      return
    }
    // Embedded wallet may still be creating right after login — wait for an address
    if (!address) {
      setStatus('loading')
      return
    }
    setStatus('loading')
    try {
      const p = await fetchProfile(address)
      setProfile(p)
      setStatus('onboarded')
    } catch (err) {
      const e = err as { status?: number }
      if (e.status === 404) {
        setProfile(null)
        setStatus('needs_onboarding')
      } else {
        // backend unreachable: keep the user where they are instead of dead-ending
        setProfile(null)
        setStatus('needs_onboarding')
      }
    }
  }, [authenticated, address])

  useEffect(() => {
    if (!ready) return
    void refresh()
  }, [ready, refresh])

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
    async (args: { username: string; txHash: string; fullName: string; email?: string }) => {
      if (!address) throw new Error('wallet_not_ready')
      const p = await claimUsername({ ...args, address })
      setProfile(p)
      setStatus('onboarded')
      return p
    },
    [address],
  )

  return <Ctx.Provider value={{ status, profile, address, refresh, completeOnboarding }}>{children}</Ctx.Provider>
}

export function useProfile() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}

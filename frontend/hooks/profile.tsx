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
    if (!authenticated || !address) {
      setStatus('anonymous')
      setProfile(null)
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
        // network/other error: treat as onboarding-needed to avoid dead ends, keep null profile
        setProfile(null)
        setStatus('needs_onboarding')
      }
    }
  }, [authenticated, address])

  useEffect(() => {
    if (ready) void refresh()
  }, [ready, refresh])

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

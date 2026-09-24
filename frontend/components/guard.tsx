import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useProfile } from '../hooks/profile'

/** Full-screen loading state shared by guards. */
export function GuardLoading() {
  return <div className="guard-loading">Loading…</div>
}

/** Blocks dashboard routes unless authenticated AND onboarded. */
export function RequireProfile({ children }: { children: ReactNode }) {
  const { status } = useProfile()
  const location = useLocation()
  if (status === 'anonymous') return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  if (status === 'needs_onboarding') return <Navigate to="/onboarding" replace />
  if (status === 'loading') return <GuardLoading />
  return <>{children}</>
}

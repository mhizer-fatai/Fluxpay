import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useProfile } from '../hooks/profile'
import { useWallet } from '../hooks/useWallet'
import { DashboardShell } from './dashboard-shell'

/** Full-screen loading state shared by guards. */
export function GuardLoading() {
  return <div className="guard-loading">Loading…</div>
}

/** Blocks dashboard routes unless authenticated AND onboarded. */
export function RequireProfile({ children }: { children: ReactNode }) {
  const { status, refresh } = useProfile()
  const location = useLocation()
  if (status === 'anonymous') return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  if (status === 'needs_onboarding') return <Navigate to="/onboarding" replace />
  if (status === 'loading') return <GuardLoading />
  // Backend outage: hold position with a retry instead of dumping to onboarding.
  if (status === 'unreachable') {
    return (
      <div className="guard-loading">
        <p style={{ margin: '0 0 12px' }}>Can&apos;t reach FluxPay servers — your account is safe.</p>
        <button className="ov-btn primary" onClick={() => void refresh()}>Retry</button>
      </div>
    )
  }
  return <>{children}</>
}

/**
 * Smart-account gate for money pages: renders children only once the smart
 * (money) account is known. Until then a skeleton — the UI never flashes
 * EOA balances, EOA QRs, or EOA activity. Cached after first login, so this
 * is instant on every subsequent load.
 */
export function SmartWalletGate({ children }: { children: ReactNode }) {
  const { smartAddress } = useWallet()
  if (!smartAddress) {
    return (
      <DashboardShell>
        <section className="dashboard-content">
          <p className="ac-empty">Setting up your smart wallet…</p>
        </section>
      </DashboardShell>
    )
  }
  return <>{children}</>
}

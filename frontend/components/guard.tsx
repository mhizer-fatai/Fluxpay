import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useProfile } from '../hooks/profile'
import { useWallet } from '../hooks/useWallet'
import { DashboardShell } from './dashboard-shell'

/** Centered spinner used by every full-page waiting state. */
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="guard-loading">
      <span className="page-spinner" aria-hidden />
      {label && <p style={{ margin: 0 }}>{label}</p>}
    </div>
  )
}

/** Full-screen loading state shared by guards. */
export function GuardLoading() {
  return <Spinner label="Loading…" />
}

/** Blocks dashboard routes unless authenticated AND onboarded. */
export function RequireProfile({ children }: { children: ReactNode }) {
  const { status, hydrated, refresh } = useProfile()
  const location = useLocation()
  if (status === 'anonymous' || status === 'session_expired') return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  if (status === 'needs_onboarding') return <Navigate to="/onboarding" replace />
  // Only the FIRST resolution blocks the page. A later background refresh flips
  // status to 'loading' but must NOT unmount the page (that would wipe in-page
  // state, e.g. a send in progress).
  if (!hydrated) return <GuardLoading />
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
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (smartAddress) { setSlow(false); return }
    const t = setTimeout(() => setSlow(true), 12_000)
    return () => clearTimeout(t)
  }, [smartAddress])
  if (!smartAddress) {
    return (
      <DashboardShell>
        <section className="dashboard-content">
          {slow ? (
            <div className="guard-loading">
              <p style={{ margin: '0 0 12px' }}>Setting up your wallet is taking longer than expected.</p>
              <button className="ov-btn primary" onClick={() => location.reload()}>Reload page</button>
            </div>
          ) : (
            <Spinner label="Setting up your smart wallet…" />
          )}
        </section>
      </DashboardShell>
    )
  }
  return <>{children}</>
}

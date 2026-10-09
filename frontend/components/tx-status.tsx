import type { ReactNode } from 'react'
import { Check, X } from 'lucide-react'

export type TxState = 'idle' | 'pending' | 'done' | 'error'

export interface TxStatusValue {
  state: TxState
  message?: string
  detail?: ReactNode
}

const DEFAULT_MESSAGE: Record<Exclude<TxState, 'idle'>, string> = {
  pending: 'Transaction in progress…',
  done: 'Transaction completed',
  error: 'Transaction failed',
}

/**
 * Progress indicator for gasless transactions: a spinner while the userOp is in
 * flight, then a check (or cross) once it settles. Shared by the write flows.
 */
export function TxStatus({ status }: { status: TxStatusValue }) {
  if (status.state === 'idle') return null
  return (
    <div className={`tx-status ${status.state}`} role="status" aria-live="polite">
      <span className="tx-icon" aria-hidden>
        {status.state === 'pending' && <span className="tx-spinner" />}
        {status.state === 'done' && <Check size={13} strokeWidth={3} />}
        {status.state === 'error' && <X size={13} strokeWidth={3} />}
      </span>
      <span className="tx-copy">
        <strong>{status.message ?? DEFAULT_MESSAGE[status.state]}</strong>
        {status.detail && <small>{status.detail}</small>}
      </span>
    </div>
  )
}

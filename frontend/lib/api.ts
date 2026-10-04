const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

/** Typed API failure: `status` is HTTP (0 = never reached the backend), `code` is the backend error/reason. */
export class ApiError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

let tokenProvider: () => Promise<string | null> = async () => null
let tokenRefresher: () => Promise<string | null> = async () => null

export function setTokenProvider(fn: () => Promise<string | null>) {
  tokenProvider = fn
}

/**
 * Optional: force a fresh access token after a 401, used for the single retry.
 * Backed by Privy's `getAccessToken`, which refreshes when the token is
 * expired or expiring.
 */
export function setTokenRefresher(fn: () => Promise<string | null>) {
  tokenRefresher = fn
}

/** Raw access token for transports that need an Authorization header (e.g. the AA proxy). */
export async function getAuthToken(): Promise<string | null> {
  try {
    return await tokenProvider()
  } catch {
    return null
  }
}

function requestHeaders(token: string | null, init?: RequestInit): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...init?.headers,
  }
}

async function toApiError(path: string, res: Response): Promise<ApiError> {
  let body: unknown = null
  try { body = await res.json() } catch { /* non-JSON body */ }
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  const code = typeof record?.reason === 'string' ? record.reason
    : typeof record?.error === 'string' ? record.error
    : undefined
  return new ApiError(res.status, `API ${res.status}: ${path}`, code)
}

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  let token: string | null = null
  try {
    token = await tokenProvider()
  } catch (err) {
    // The token provider itself failed (e.g. Privy refresh threw). Do NOT send
    // a protected request with no credentials — surface the real failure.
    throw new ApiError(401, `token_unavailable: ${path}: ${err instanceof Error ? err.message : String(err)}`, 'token_unavailable')
  }

  let res = await fetch(`${API_URL}${path}`, { ...init, headers: requestHeaders(token, init) })

  // One bounded retry with a freshly acquired token on 401. Covers the case
  // where the token was stale but Privy can still mint a valid one.
  if (res.status === 401) {
    let fresh: string | null = null
    try { fresh = await tokenRefresher() } catch { fresh = null }
    if (fresh && fresh !== token) {
      token = fresh
      res = await fetch(`${API_URL}${path}`, { ...init, headers: requestHeaders(token, init) })
    }
  }

  if (!res.ok) throw await toApiError(path, res)
  return res.json() as Promise<T>
}

export interface Profile {
  address: string
  username: string | null
  fullName: string
  email: string | null
  createdAt?: string
}

export const fetchProfile = (address: string) => api<Profile>(`/api/v1/profile?address=${address.toLowerCase()}`)

/** Single-call resolve across candidate addresses (smart first, legacy EOA second). */
export const resolveProfile = (addresses: string[]) =>
  api<Profile>(`/api/v1/profile/resolve?addresses=${addresses.map(a => a.toLowerCase()).join(',')}`)

export const saveProfile = (body: { address: string; fullName: string; email?: string }) =>
  api<Profile>('/api/v1/profile', { method: 'PUT', body: JSON.stringify(body) })

export const claimUsername = (body: { address: string; username: string; fullName: string; email?: string }) =>
  api<Profile>('/api/v1/profile/claim-username', { method: 'POST', body: JSON.stringify(body) })

export const checkUsername = (username: string) =>
  api<{ username: string; available: boolean }>(`/api/v1/registry/available?username=${encodeURIComponent(username)}`)

export const resolveUsernameApi = (username: string) =>
  api<{ username: string; address: string }>(`/api/v1/registry/resolve?username=${encodeURIComponent(username)}`)

export interface PaymentLinkDto {
  id: string
  creatorAddress: string
  title: string
  description: string
  token: string
  amount: string
  status: 'pending' | 'paid' | 'expired'
  txHash: string | null
  createdAt: string
}

export const createPaymentLink = (body: { creatorAddress: string; title: string; description?: string; token: string; amountRaw: string }) =>
  api<PaymentLinkDto>('/api/v1/payment-links', { method: 'POST', body: JSON.stringify(body) })

export const fetchMyLinks = (address: string, limit = 50) =>
  api<PaymentLinkDto[]>(`/api/v1/payment-links/mine?address=${address.toLowerCase()}&limit=${limit}`)

export const fetchLink = (id: string) => api<PaymentLinkDto>(`/api/v1/payment-links/${encodeURIComponent(id)}`)

export const recordLinkPaid = (id: string, body: { txHash: string; payerAddress: string }) =>
  api<PaymentLinkDto>(`/api/v1/payment-links/${encodeURIComponent(id)}/paid`, { method: 'POST', body: JSON.stringify(body) })

export interface PaymentIntent {
  intentId: string
  status: 'created' | 'submitted' | 'confirmed' | 'failed'
  toAddress: string
  asset: string
  amount: string
  useropHash: string | null
  txHash: string | null
  deduped: boolean
}

export const createPaymentIntent = (body: { idempotencyKey: string; fromAddress: string; toAddress: string; asset: string; amountRaw: string }) =>
  api<PaymentIntent>('/api/v1/payments/intents', { method: 'POST', body: JSON.stringify(body) })

export const patchPaymentIntent = (intentId: string, body: { status: 'submitted' | 'confirmed' | 'failed'; useropHash?: string; txHash?: string }) =>
  api<PaymentIntent>(`/api/v1/payments/intents/${encodeURIComponent(intentId)}`, { method: 'PATCH', body: JSON.stringify(body) })

// --- Dev-only diagnostics (never shipped in a production build) ---------------
// Run in the browser console:  await __fluxpay.tokenInfo()
// Tells you whether the current Privy access token is valid *relative to this
// device's clock* — the key signal when a login 401s.
function decodeJwtPart(part: string): Record<string, unknown> {
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  return JSON.parse(atob(padded)) as Record<string, unknown>
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__fluxpay = {
    apiUrl: API_URL,
    async tokenInfo() {
      const token = await getAuthToken()
      if (!token) return { token: null }
      const [header, payload] = token.split('.')
      const h = header ? decodeJwtPart(header) : {}
      const p = payload ? decodeJwtPart(payload) : {}
      const deviceNow = Math.floor(Date.now() / 1000)
      const exp = typeof p.exp === 'number' ? p.exp : undefined
      return {
        alg: h.alg, kid: h.kid,
        iss: p.iss, aud: p.aud, sub: p.sub,
        iat: p.iat, exp,
        deviceNow,
        deviceUtc: new Date().toISOString(),
        secondsUntilExpiry: exp !== undefined ? exp - deviceNow : null,
        expiredByDeviceClock: exp !== undefined ? deviceNow > exp : null,
      }
    },
  }
}

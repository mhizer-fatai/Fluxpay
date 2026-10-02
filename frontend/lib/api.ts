const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

let tokenProvider: () => Promise<string | null> = async () => null

export function setTokenProvider(fn: () => Promise<string | null>) {
  tokenProvider = fn
}

/** Raw access token for transports that need an Authorization header (e.g. the AA proxy). */
export async function getAuthToken(): Promise<string | null> {
  try {
    return await tokenProvider()
  } catch {
    return null
  }
}

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  let token: string | null = null
  try {
    token = await tokenProvider()
  } catch { /* unauthenticated — public endpoints still work */ }
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    let body: unknown = null
    try { body = await res.json() } catch { /* ignore */ }
    const err = new Error(`API ${res.status}: ${path}`) as Error & { status?: number; body?: unknown }
    err.status = res.status
    err.body = body
    throw err
  }
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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

let tokenProvider: () => Promise<string | null> = async () => null

export function setTokenProvider(fn: () => Promise<string | null>) {
  tokenProvider = fn
}

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = await tokenProvider()
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

export const saveProfile = (body: { address: string; fullName: string; email?: string }) =>
  api<Profile>('/api/v1/profile', { method: 'PUT', body: JSON.stringify(body) })

export const claimUsername = (body: { address: string; username: string; txHash: string; fullName: string; email?: string }) =>
  api<Profile>('/api/v1/profile/claim-username', { method: 'POST', body: JSON.stringify(body) })

export const checkUsername = (username: string) =>
  api<{ username: string; available: boolean }>(`/api/v1/registry/available?username=${encodeURIComponent(username)}`)

export const resolveUsernameApi = (username: string) =>
  api<{ username: string; address: string }>(`/api/v1/registry/resolve?username=${encodeURIComponent(username)}`)

export const money = (n: number, maxFrac = 2) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: maxFrac })

export function timeAgo(tsSeconds: number): string {
  if (!tsSeconds) return '—'
  const d = new Date(tsSeconds * 1000)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const initials = (name: string) =>
  name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'U'

export const shortAddr = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`

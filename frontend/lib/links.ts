export interface PaymentLink {
  id: string
  creatorAddress: string
  title: string
  description: string
  token: string
  amount: string // raw units
  status: 'pending' | 'paid' | 'expired'
  txHash: string | null
  createdAt: string
}

/** The shareable payment URL — just the link id. No secrets: anyone with the link can pay it. */
export const linkUrl = (id: string) => `${window.location.origin}/pay?id=${encodeURIComponent(id)}`

export const parseLinkUrl = (): { id: string } | null => {
  const params = new URLSearchParams(window.location.search)
  const id = params.get('id')
  if (!id) return null
  return { id }
}

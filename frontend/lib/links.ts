import { toHex, type Address, type Hash, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { CHAIN_ID, LINK_ESCROW_ADDRESS } from './chain'

export interface StoredLink {
  id: Hex // linkId
  title: string
  description: string
  amount: number // human units
  token: 'USDC'
  createdAt: number
  expiry: number // unix seconds; 0 = never
  secret: Hex // ephemeral private key — travels inside the link URL
  txHash: Hash
}

const STORAGE_KEY = 'fluxpay_links'

export const loadLinks = (): StoredLink[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as StoredLink[]
  } catch {
    return []
  }
}

export const saveLink = (link: StoredLink) => {
  const all = loadLinks().filter(l => l.id !== link.id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify([link, ...all]))
}

export const randomLinkId = (): Hex => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return toHex(bytes)
}

export const generateEphemeral = (): { privateKey: Hex; address: Address } => {
  const privateKey = generatePrivateKey()
  return { privateKey, address: privateKeyToAccount(privateKey).address }
}

/** uint40 expiry: on-chain "never" is max uint40. */
export const NEVER_EXPIRY = 2 ** 40 - 1

export const expiryFromOption = (option: string): number => {
  const now = Math.floor(Date.now() / 1000)
  switch (option) {
    case '24 hours': return now + 86400
    case '7 days': return now + 7 * 86400
    default: return NEVER_EXPIRY
  }
}

export const expiryLabel = (expiry: number) => (expiry === 0 ? 'Never' : new Date(expiry * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))

/** EIP-712 signature over Claim(linkId, claimer) using the ephemeral secret from the link URL. */
export async function signClaim(privateKey: Hex, linkId: Hex, claimer: Address): Promise<Hex> {
  const account = privateKeyToAccount(privateKey)
  return account.signTypedData({
    domain: {
      name: 'Metro Payment Link',
      version: '1',
      chainId: CHAIN_ID,
      verifyingContract: LINK_ESCROW_ADDRESS,
    },
    types: {
      Claim: [
        { name: 'linkId', type: 'bytes32' },
        { name: 'claimer', type: 'address' },
      ],
    },
    primaryType: 'Claim',
    message: { linkId, claimer },
  })
}

/** The shareable payment URL — carries the link id AND the claim secret. */
export const linkUrl = (link: Pick<StoredLink, 'id' | 'secret' | 'title'>) =>
  `${window.location.origin}/pay?id=${link.id}&s=${link.secret}&t=${encodeURIComponent(link.title)}`

export const parseLinkUrl = (): { id: Hex; secret: Hex; title: string } | null => {
  const params = new URLSearchParams(window.location.search)
  const id = params.get('id')
  const secret = params.get('s')
  if (!id || !secret || !/^0x[0-9a-fA-F]{64}$/.test(id) || !/^0x[0-9a-fA-F]{64}$/.test(secret)) return null
  return { id: id as Hex, secret: secret as Hex, title: params.get('t') ?? 'Payment' }
}

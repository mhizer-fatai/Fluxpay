import { createPublicClient, defineChain, formatUnits, http, keccak256, toHex, type Address, type Chain } from 'viem'

export const monadTestnet: Chain = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [import.meta.env.VITE_RPC_URL || 'https://testnet-rpc.monad.xyz'] } },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: import.meta.env.VITE_EXPLORER_URL || 'https://testnet.monadexplorer.com' },
  },
  testnet: true,
})

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 10143)

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
})

export const EXPLORER_URL = monadTestnet.blockExplorers?.default?.url ?? 'https://testnet.monadexplorer.com'
export const explorerTx = (hash: string) => `${EXPLORER_URL}/tx/${hash}`
export const explorerAddress = (addr: string) => `${EXPLORER_URL}/address/${addr}`

export const REGISTRY_ADDRESS = import.meta.env.VITE_USERNAME_REGISTRY_ADDRESS as Address
export const FLUXPAY_ADDRESS = import.meta.env.VITE_FLUXPAY_ADDRESS as Address
export const SPLIT_MANAGER_ADDRESS = import.meta.env.VITE_SPLIT_MANAGER_ADDRESS as Address
export const LINK_ESCROW_ADDRESS = import.meta.env.VITE_LINK_ESCROW_ADDRESS as Address
export const STREAM_VAULT_ADDRESS = import.meta.env.VITE_STREAM_VAULT_ADDRESS as Address

export type TokenKey = 'MON' | 'USDC' | 'AUSD' | 'WETH' | 'WMON'

export interface TokenInfo {
  key: TokenKey
  symbol: string
  name: string
  decimals: number
  address: Address | null // null = native MON
  stable: boolean
}

export const TOKENS: TokenInfo[] = [
  { key: 'MON', symbol: 'MON', name: 'Monad', decimals: 18, address: null, stable: false },
  { key: 'USDC', symbol: 'USDC', name: 'USD Coin', decimals: 6, address: import.meta.env.VITE_USDC_ADDRESS as Address, stable: true },
  { key: 'AUSD', symbol: 'AUSD', name: 'Aperture USD', decimals: 6, address: import.meta.env.VITE_AUSD_ADDRESS as Address, stable: true },
  { key: 'WETH', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, address: import.meta.env.VITE_WETH_ADDRESS as Address, stable: false },
  { key: 'WMON', symbol: 'WMON', name: 'Wrapped Monad', decimals: 18, address: import.meta.env.VITE_WMON_ADDRESS as Address, stable: false },
]

export const tokenByKey = (key: TokenKey) => TOKENS.find(t => t.key === key)!
export const tokenByAddress = (addr: string) => TOKENS.find(t => t.address && t.address.toLowerCase() === addr.toLowerCase())

const erc20AbiBase = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const

export const erc20Abi = erc20AbiBase

export const registryAbi = [
  { type: 'function', name: 'register', stateMutability: 'nonpayable', inputs: [{ name: 'usernameHash', type: 'bytes32' }, { name: 'username', type: 'string' }], outputs: [] },
  { type: 'function', name: 'resolve', stateMutability: 'view', inputs: [{ name: 'usernameHash', type: 'bytes32' }], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'usernameHash', type: 'bytes32' }], outputs: [{ name: '', type: 'address' }] },
  {
    type: 'event',
    name: 'UsernameRegistered',
    inputs: [
      { name: 'usernameHash', type: 'bytes32', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'username', type: 'string', indexed: false },
    ],
  },
] as const

export const fluxPayAbi = [
  { type: 'function', name: 'settle', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'settleBatch', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'tos', type: 'address[]' }, { name: 'amounts', type: 'uint256[]' }], outputs: [{ name: 'total', type: 'uint256' }] },
  {
    type: 'event',
    name: 'PaymentSettled',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'token', type: 'address', indexed: true },
    ],
  },
] as const

export const streamVaultAbi = [
  { type: 'function', name: 'create', stateMutability: 'nonpayable', inputs: [{ name: 'recipient', type: 'address' }, { name: 'token', type: 'address' }, { name: 'ratePerSecondX18', type: 'uint96' }, { name: 'initialDeposit', type: 'uint128' }], outputs: [{ name: 'id', type: 'uint256' }] },
  { type: 'function', name: 'withdraw', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'pause', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'resume', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'cancel', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'topUp', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }, { name: 'amount', type: 'uint128' }], outputs: [] },
  { type: 'function', name: 'nextStreamId', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    type: 'function',
    name: 'streams',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'ratePerSecondX18', type: 'uint96' },
      { name: 'createdAt', type: 'uint64' },
      { name: 'pausedAt', type: 'uint64' },
      { name: 'lastFoldTs', type: 'uint64' },
      { name: 'deposited', type: 'uint128' },
      { name: 'unclaimedX18', type: 'uint256' },
      { name: 'cancelled', type: 'bool' },
    ],
  },
  { type: 'function', name: 'withdrawable', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }], outputs: [{ name: 'wholeUnits', type: 'uint128' }, { name: 'dustX18', type: 'uint128' }] },
] as const

export const linkEscrowAbi = [
  { type: 'function', name: 'deposit', stateMutability: 'nonpayable', inputs: [{ name: 'linkId', type: 'bytes32' }, { name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'expiry', type: 'uint40' }, { name: 'ephemeralSigner', type: 'address' }, { name: 'recipientAllowed', type: 'address' }], outputs: [] },
  { type: 'function', name: 'claim', stateMutability: 'nonpayable', inputs: [{ name: 'linkId', type: 'bytes32' }, { name: 'claimer', type: 'address' }, { name: 'sig', type: 'bytes' }], outputs: [] },
  { type: 'function', name: 'refund', stateMutability: 'nonpayable', inputs: [{ name: 'linkId', type: 'bytes32' }], outputs: [] },
  { type: 'function', name: 'links', stateMutability: 'view', inputs: [{ name: '', type: 'bytes32' }], outputs: [{ name: 'depositor', type: 'address' }, { name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'expiry', type: 'uint40' }, { name: 'recipientAllowed', type: 'address' }, { name: 'ephemeralSigner', type: 'address' }, { name: 'claimed', type: 'bool' }, { name: 'refunded', type: 'bool' }] },
] as const

export const splitManagerAbi = [
  { type: 'function', name: 'disburse', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'payees', type: 'address[]' }, { name: 'shares', type: 'uint256[]' }], outputs: [{ name: 'total', type: 'uint256' }] },
] as const

export const USERNAME_HASH = (username: string): `0x${string}` => keccak256(toHex(username.toLowerCase()))

export const formatTokenAmount = (raw: bigint, decimals: number, maxFrac = 6): string => {
  const n = Number(formatUnits(raw, decimals))
  return n.toLocaleString('en-US', { maximumFractionDigits: maxFrac })
}

export const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

// USD prices: stables are $1 by definition; volatile tokens use CoinGecko with graceful fallback.
let priceCache: { at: number; prices: Record<TokenKey, number> } | null = null
export async function getUsdPrices(): Promise<Record<TokenKey, number>> {
  if (priceCache && Date.now() - priceCache.at < 5 * 60 * 1000) return priceCache.prices
  const prices: Record<TokenKey, number> = { MON: 0, USDC: 1, AUSD: 1, WETH: 0, WMON: 0 }
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=monad,ethereum&vs_currencies=usd')
    if (res.ok) {
      const data = await res.json()
      if (data.monad?.usd) prices.MON = data.monad.usd
      if (data.ethereum?.usd) prices.WETH = data.ethereum.usd
      prices.WMON = prices.MON
    }
  } catch { /* keep fallback */ }
  priceCache = { at: Date.now(), prices }
  return prices
}

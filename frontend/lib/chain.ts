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

// Transport-level guardrails: the public testnet RPC rate-limits aggressively (429s).
// One gate for ALL viem reads — max 6 concurrent, single retry with backoff on 429.
const MAX_RPC_CONCURRENT = 6
let rpcRunning = 0
const rpcQueue: Array<() => void> = []
const rpcAcquire = (): Promise<void> => {
  if (rpcRunning < MAX_RPC_CONCURRENT) {
    rpcRunning += 1
    return Promise.resolve()
  }
  return new Promise(resolve => rpcQueue.push(resolve))
}
const rpcRelease = () => {
  rpcRunning -= 1
  const next = rpcQueue.shift()
  if (next) {
    rpcRunning += 1
    next()
  }
}
const rpcFetch: typeof fetch = (async (input: any, init?: any) => {
  const withTimeout = async (ms: number): Promise<Response> => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), ms)
    try {
      return await fetch(input, { ...init, signal: ctrl.signal })
    } finally {
      clearTimeout(timer)
    }
  }
  await rpcAcquire()
  let res: Response
  try {
    res = await withTimeout(20_000)
  } catch (e) {
    rpcRelease()
    throw e
  }
  if (res.status !== 429) {
    rpcRelease()
    return res
  }
  // 429: back off once, then retry through the gate
  rpcRelease()
  await new Promise(r => setTimeout(r, 1500))
  await rpcAcquire()
  try {
    return await withTimeout(20_000)
  } finally {
    rpcRelease()
  }
}) as typeof fetch

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(undefined, { fetchFn: rpcFetch }),
})

export const EXPLORER_URL = monadTestnet.blockExplorers?.default?.url ?? 'https://testnet.monadexplorer.com'
export const explorerTx = (hash: string) => `${EXPLORER_URL}/tx/${hash}`
export const explorerAddress = (addr: string) => `${EXPLORER_URL}/address/${addr}`

// Deployed FluxPay contracts on Monad testnet (see deployments/10143.json).
// These are public, immutable addresses — hardcoded defaults with an env override
// for other networks (VITE_* is inlined at build time anyway).
export const REGISTRY_ADDRESS = (import.meta.env.VITE_USERNAME_REGISTRY_ADDRESS || '0xAc34e4b98e7c765604551388B9EA082CD26556E2') as Address
export const FLUXPAY_ADDRESS = (import.meta.env.VITE_FLUXPAY_ADDRESS || '0x3148a4deeEF4642cfA68CF2b0F35FDd62e98CF7E') as Address
export const LINK_ESCROW_ADDRESS = (import.meta.env.VITE_LINK_ESCROW_ADDRESS || '0x47C659745F4FFc7458314c657622557A85540434') as Address
export const STREAM_VAULT_ADDRESS = (import.meta.env.VITE_STREAM_VAULT_ADDRESS || '0x3791a605a5ED68e9e7923796Fd71ADE40E77Da13') as Address

export type TokenKey = 'MON' | 'USDC' | 'AUSD' | 'WETH' | 'WMON' | 'KUSDC'

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
  { key: 'USDC', symbol: 'USDC', name: 'USD Coin', decimals: 6, address: (import.meta.env.VITE_USDC_ADDRESS || '0x534b2f3A21130d7a60830c2Df862319e593943A3') as Address, stable: true },
  { key: 'AUSD', symbol: 'AUSD', name: 'Aperture USD', decimals: 6, address: (import.meta.env.VITE_AUSD_ADDRESS || '0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC') as Address, stable: true },
  { key: 'WETH', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, address: (import.meta.env.VITE_WETH_ADDRESS || '0x45477f4709771331db81944A5E20eF95Bc7BA2D7') as Address, stable: false },
  { key: 'WMON', symbol: 'WMON', name: 'Wrapped Monad', decimals: 18, address: (import.meta.env.VITE_WMON_ADDRESS || '0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541') as Address, stable: false },
  { key: 'KUSDC', symbol: 'kUSDC', name: 'Kuru Testnet USDC', decimals: 6, address: '0xa402b424f392eaa05dbc8779e4502a1f6a96fef1', stable: true },
]

export const tokenByKey = (key: TokenKey) => TOKENS.find(t => t.key === key)!
export const tokenByAddress = (addr: string) => TOKENS.find(t => t.address && t.address.toLowerCase() === addr.toLowerCase())

/** Zero address is the sentinel for native MON in payment links (MON has no token contract). */
export const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000'
export const isNativeToken = (addr: string) => addr.toLowerCase() === NATIVE_TOKEN_ADDRESS
/** Resolve a payment-link token address — the zero address maps to native MON. */
export const tokenByAddressOrNative = (addr: string): TokenInfo | undefined =>
  isNativeToken(addr) ? tokenByKey('MON') : tokenByAddress(addr)

const erc20AbiBase = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
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

/** EarnVault (ERC-4626) — deposit idle USDC, shares appreciate as the yield strategy earns. */
export const EARN_VAULT_ADDRESS = (import.meta.env.VITE_EARN_VAULT_ADDRESS || '0x740E816C586600769b89f0cbb6A7Ba5cFb7b1D30') as Address

/** Pay & Invest — USDC goes in, a tokenized-equity position comes out (simulated on testnet). */
export const INVEST_VAULT_ADDRESS = (import.meta.env.VITE_INVEST_VAULT_ADDRESS || '0x9Ccf20a778e887965551ABfF5bc676fb4E460f0e') as Address
export const STOCK_TOKEN_ADDRESS = (import.meta.env.VITE_STOCK_TOKEN_ADDRESS || '0x37D6466f2F827e687578a2454dFB101b24512Df1') as Address
export const EQUITY_VENUE_ADDRESS = (import.meta.env.VITE_EQUITY_VENUE_ADDRESS || '0x57762958eDd1d584b4A5FDC4C5A925Cf1261fFaA') as Address

export const investVaultAbi = [
  { type: 'function', name: 'invest', stateMutability: 'nonpayable', inputs: [{ name: 'usdcAmount', type: 'uint256' }], outputs: [{ name: 'stockOut', type: 'uint256' }] },
  { type: 'function', name: 'divest', stateMutability: 'nonpayable', inputs: [{ name: 'stockAmount', type: 'uint256' }], outputs: [{ name: 'usdcOut', type: 'uint256' }] },
  { type: 'function', name: 'stockOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'positionValueX18', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'totalStock', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'venue', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
] as const

export const equityVenueAbi = [
  { type: 'function', name: 'priceX18', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'priceSource', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
] as const

export const earnVaultAbi = [
  { type: 'function', name: 'asset', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'totalAssets', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'convertToAssets', stateMutability: 'view', inputs: [{ name: 'shares', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'previewRedeem', stateMutability: 'view', inputs: [{ name: 'shares', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'deposit', stateMutability: 'nonpayable', inputs: [{ name: 'assets', type: 'uint256' }, { name: 'receiver', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'redeem', stateMutability: 'nonpayable', inputs: [{ name: 'shares', type: 'uint256' }, { name: 'receiver', type: 'address' }, { name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'strategy', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
] as const

/** Yield strategy behind the Earn vault. Testnet: MockYieldStrategy (fixed per-second rate). */
export const yieldStrategyAbi = [
  { type: 'function', name: 'ratePerSecondX18', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'reserve', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'totalValue', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const

export const USERNAME_HASH = (username: string): `0x${string}` => keccak256(toHex(username.toLowerCase()))

export const formatTokenAmount = (raw: bigint, decimals: number, maxFrac = 6): string => {
  const n = Number(formatUnits(raw, decimals))
  return n.toLocaleString('en-US', { maximumFractionDigits: maxFrac })
}

export const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

// USD prices: stables are $1 by definition. Volatile prices come from OUR backend
// (/api/v1/prices proxies CoinGecko server-side — browsers get CORS-blocked there).
// Cached 5 min here; backend caches 60s.
let priceCache: { at: number; prices: Record<TokenKey, number> } | null = null
export async function getUsdPrices(): Promise<Record<TokenKey, number>> {
  if (priceCache && Date.now() - priceCache.at < 5 * 60 * 1000) return priceCache.prices
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'
  const prices: Record<TokenKey, number> = { MON: 0, USDC: 1, AUSD: 1, WETH: 0, WMON: 0, KUSDC: 1 }
  try {
    const res = await fetch(`${API_URL}/api/v1/prices`)
    if (res.ok) {
      const data = (await res.json()) as Partial<Record<TokenKey, number>>
      for (const k of Object.keys(prices) as TokenKey[]) {
        if (typeof data[k] === 'number') prices[k] = data[k] as number
      }
    }
  } catch { /* keep fallback */ }
  priceCache = { at: Date.now(), prices }
  return prices
}

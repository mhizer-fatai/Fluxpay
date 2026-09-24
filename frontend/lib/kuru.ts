import { ethers } from 'ethers'
import * as KuruSdk from '@kuru-labs/kuru-sdk'
import type { RouteOutput, Pool } from '@kuru-labs/kuru-sdk'

// Kuru testnet (Monad 10143) — router from docs.kuru.io/contracts/Contract-addresses
export const KURU_ROUTER = '0x1f5A250c4A506DA4cE584173c6ed1890B1bf7187'
export const KURU_API = (import.meta.env.VITE_KURU_API as string | undefined) ?? 'https://api.testnet.kuru.io'

const ADDRESS_ZERO = ethers.constants.AddressZero

export interface KuruToken {
  symbol: string
  name: string
  address: string // AddressZero = native MON
  decimals: number
}

/**
 * Tokens with LIVE markets on Kuru testnet (verified against GET /api/v1/markets).
 * The stale docs addresses (0xf817… USDC etc.) are NOT used.
 */
export const KURU_TOKENS: KuruToken[] = [
  { symbol: 'MON', name: 'Monad (native)', address: ADDRESS_ZERO, decimals: 18 },
  { symbol: 'USDC', name: 'Kuru Testnet USDC', address: '0xee0722ead54f1b4fe97be399be43bc0226a6f97e', decimals: 6 },
  { symbol: 'WETH', name: 'Wrapped Ether', address: '0x8b6c5fafef85b030bb1e71ae7ac085cc2380aaf8', decimals: 18 },
  { symbol: 'XAUT', name: 'Tether Gold', address: '0xee1dce135a9ab598bca8cf3a28bdef6892100740', decimals: 6 },
  { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', address: '0xef2a20a161ac9ed1117d721336226b6399f15b4d', decimals: 8 },
]

export const kuruTokenBySymbol = (symbol: string) => KURU_TOKENS.find(t => t.symbol === symbol)

/** Read-only provider for quotes. */
export const kuruProvider = new ethers.providers.JsonRpcProvider(
  (import.meta.env.VITE_RPC_URL as string | undefined) ?? 'https://testnet-rpc.monad.xyz',
)

/**
 * Live orderbook pools from the testnet API.
 * NOTE: the SDK's PoolFetcher POSTs /markets/filtered which the testnet API rejects
 * (405) — so we GET /markets ourselves and pass pools directly to PathFinder.
 */
let poolsCache: { at: number; pools: Pool[] } | null = null
export async function fetchTestnetPools(): Promise<Pool[]> {
  if (poolsCache && Date.now() - poolsCache.at < 60_000) return poolsCache.pools
  const res = await fetch(`${KURU_API}/api/v1/markets`)
  if (!res.ok) throw new Error(`Kuru API ${res.status}`)
  const json = (await res.json()) as { data?: Array<Record<string, unknown>> }
  const rows = json.data ?? []
  const pools: Pool[] = rows
    .map(m => {
      const rec = m as {
        marketAddress?: string; baseToken?: { tokenAddress?: string }; quoteToken?: { tokenAddress?: string }
        baseasset?: string; quoteasset?: string; market?: string
      }
      return {
        orderbook: (rec.marketAddress ?? rec.market ?? '').toLowerCase(),
        baseToken: (rec.baseToken?.tokenAddress ?? rec.baseasset ?? '').toLowerCase(),
        quoteToken: (rec.quoteToken?.tokenAddress ?? rec.quoteasset ?? '').toLowerCase(),
      }
    })
    .filter(p => p.baseToken && p.quoteToken && p.orderbook)
  poolsCache = { at: Date.now(), pools }
  return pools
}

/** Best route + expected output for a market swap (human units in). */
export async function quoteSwap(tokenIn: string, tokenOut: string, amountHuman: number): Promise<RouteOutput> {
  const pools = await fetchTestnetPools()
  return KuruSdk.PathFinder.findBestPath(kuruProvider, tokenIn, tokenOut, amountHuman, 'amountIn', undefined, pools)
}

/** Execute the swap through the Kuru router; handles ERC-20 approvals. */
export async function executeSwap(opts: {
  signer: ethers.Signer
  routeOutput: RouteOutput
  size: number
  tokenInDecimals: number
  tokenOutDecimals: number
  slippagePct: number
  onApprove?: (txHash: string | null) => void
}): Promise<ethers.providers.TransactionReceipt> {
  return KuruSdk.TokenSwap.swap(
    opts.signer,
    KURU_ROUTER,
    opts.routeOutput,
    opts.size,
    opts.tokenInDecimals,
    opts.tokenOutDecimals,
    opts.slippagePct,
    true, // approveTokens
    opts.onApprove ?? (() => {}),
  )
}

/** Live balance for a Kuru token (native MON or ERC-20). */
export async function fetchKuruBalance(provider: ethers.providers.Provider, token: KuruToken, address: string): Promise<number> {
  if (token.address === ADDRESS_ZERO) {
    return Number(ethers.utils.formatEther(await provider.getBalance(address)))
  }
  const contract = new ethers.Contract(token.address, ['function balanceOf(address) view returns (uint256)'], provider)
  return Number(ethers.utils.formatUnits(await contract.balanceOf(address), token.decimals))
}

/** Bridge a Privy wallet (EIP-1193 provider) into an ethers v5 signer for the Kuru SDK. */
export async function getKuruSigner(ethereumProvider: unknown): Promise<ethers.Signer> {
  const web3Provider = new ethers.providers.Web3Provider(ethereumProvider as ethers.providers.ExternalProvider)
  return web3Provider.getSigner()
}

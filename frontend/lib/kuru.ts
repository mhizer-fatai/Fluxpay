import { ethers } from 'ethers'
import * as KuruSdk from '@kuru-labs/kuru-sdk'
import type { RouteOutput } from '@kuru-labs/kuru-sdk'

// Kuru testnet (Monad 10143) — docs.kuru.io/contracts/Contract-addresses
export const KURU_ROUTER = '0x1f5A250c4A506DA4cE584173c6ed1890B1bf7187'
export const KURU_API = (import.meta.env.VITE_KURU_API as string | undefined) ?? 'https://api.testnet.kuru.io'

export interface KuruToken {
  symbol: string
  name: string
  address: string // AddressZero = native MON
  decimals: number
}

const ADDRESS_ZERO = ethers.constants.AddressZero

export const KURU_TOKENS: KuruToken[] = [
  { symbol: 'MON', name: 'Monad (native)', address: ADDRESS_ZERO, decimals: 18 },
  { symbol: 'WMON', name: 'Wrapped Monad', address: '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701', decimals: 18 },
  { symbol: 'USDC', name: 'USD Coin', address: '0xf817257fed379853cDe0fa4F97AB987181B1E5Ea', decimals: 6 },
  { symbol: 'kUSDC', name: 'Kuru USDC', address: '0x6C15057930e0d8724886C09e940c5819fBE65465', decimals: 6 },
  { symbol: 'USDT', name: 'Tether USD', address: '0x88b8E2161DEDC77EF4ab7585569D2415a1C1055D', decimals: 6 },
  { symbol: 'DAK', name: 'Dak', address: '0x0F0BDEbF0F83cD1EE3974779Bcb7315f9808c714', decimals: 18 },
  { symbol: 'CHOG', name: 'Chog', address: '0xE0590015A873bF326bd645c3E1266d4db41C4E6B', decimals: 18 },
  { symbol: 'YAKI', name: 'Yaki', address: '0xfe140e1dCe99Be9F4F15d657CD9b7BF622270C50', decimals: 18 },
]

export const kuruTokenBySymbol = (symbol: string) => KURU_TOKENS.find(t => t.symbol === symbol)

/** Read-only provider for quotes. */
export const kuruProvider = new ethers.providers.JsonRpcProvider(
  (import.meta.env.VITE_RPC_URL as string | undefined) ?? 'https://testnet-rpc.monad.xyz',
)

/** Bridge a Privy wallet (EIP-1193 provider) into an ethers v5 signer for the Kuru SDK. */
export async function getKuruSigner(ethereumProvider: unknown): Promise<ethers.Signer> {
  const web3Provider = new ethers.providers.Web3Provider(ethereumProvider as ethers.providers.ExternalProvider)
  return web3Provider.getSigner()
}

/** Best route + expected output for a market swap (human units in). */
export async function quoteSwap(
  tokenIn: string,
  tokenOut: string,
  amountHuman: number,
): Promise<RouteOutput> {
  const poolFetcher = await KuruSdk.PoolFetcher.create(KURU_API)
  return KuruSdk.PathFinder.findBestPath(kuruProvider, tokenIn, tokenOut, amountHuman, 'amountIn', poolFetcher)
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

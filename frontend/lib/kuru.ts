import { ethers } from 'ethers'
import {
  createPublicClient,
  encodeFunctionData,
  formatUnits,
  http,
  parseAbiItem,
  type Address,
  type Hash,
  type WalletClient,
} from 'viem'
import { monadTestnet } from './chain'

export const KURU_ROUTER = '0x1f5A250c4A506DA4cE584173c6ed1890B1bf7187'
export const KURU_API = (import.meta.env.VITE_KURU_API as string | undefined) ?? 'https://api.testnet.kuru.io'

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000' as Address

export interface KuruToken {
  symbol: string
  name: string
  address: Address // AddressZero = native MON
  decimals: number
}

/** Tokens with LIVE markets on Kuru testnet (verified against GET /api/v1/markets + bestBidAsk). */
export const KURU_TOKENS: KuruToken[] = [
  { symbol: 'MON', name: 'Monad (native)', address: ADDRESS_ZERO, decimals: 18 },
  { symbol: 'USDC', name: 'Kuru Testnet USDC', address: '0xee0722ead54f1b4fe97be399be43bc0226a6f97e', decimals: 6 },
  { symbol: 'WETH', name: 'Wrapped Ether', address: '0x8b6c5fafef85b030bb1e71ae7ac085cc2380aaf8', decimals: 18 },
  { symbol: 'XAUT', name: 'Tether Gold', address: '0xee1dce135a9ab598bca8cf3a28bdef6892100740', decimals: 6 },
  { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', address: '0xef2a20a161ac9ed1117d721336226b6399f15b4d', decimals: 8 },
]

export const kuruTokenBySymbol = (symbol: string) => KURU_TOKENS.find(t => t.symbol === symbol)

/** Direct markets (verified live). All testnet markets quote in USDC. */
interface DirectMarket {
  market: Address
  base: Address
  quote: Address
  baseDec: number
  quoteDec: number
}

const DIRECT_MARKETS: DirectMarket[] = [
  { market: '0xfdbe356828c8f5a5d5ed4f69dde0816f4058ef61', base: ADDRESS_ZERO, quote: '0xee0722ead54f1b4fe97be399be43bc0226a6f97e', baseDec: 18, quoteDec: 6 },
  { market: '0xa9c2936656a7d2143720bcd91ba8506200b7cbe7', base: '0x8b6c5fafef85b030bb1e71ae7ac085cc2380aaf8', quote: '0xee0722ead54f1b4fe97be399be43bc0226a6f97e', baseDec: 18, quoteDec: 6 },
  { market: '0x5bdea6f9f9aba34f4ecb9b865646a792b835ef7f', base: '0xef2a20a161ac9ed1117d721336226b6399f15b4d', quote: '0xee0722ead54f1b4fe97be399be43bc0226a6f97e', baseDec: 8, quoteDec: 6 },
  { market: '0x0b4dd2a7b09d5c5401149ffe51301cc589017343', base: '0xee1dce135a9ab598bca8cf3a28bdef6892100740', quote: '0xee0722ead54f1b4fe97be399be43bc0226a6f97e', baseDec: 6, quoteDec: 6 },
]

const marketAbi = [
  parseAbiItem('function bestBidAsk() external view returns (uint256 bid, uint256 ask)'),
  parseAbiItem('function placeAndExecuteMarketBuy(uint96 _quoteAmount, uint256 _minAmountOut, bool _isMargin, bool _isFillOrKill) external payable returns (uint256)'),
  parseAbiItem('function placeAndExecuteMarketSell(uint96 _size, uint256 _minAmountOut, bool _isMargin, bool _isFillOrKill) external payable returns (uint256)'),
] as const

const erc20ApproveAbi = [
  parseAbiItem('function approve(address spender, uint256 amount) external returns (bool)'),
] as const

const publicClient = createPublicClient({ chain: monadTestnet, transport: http() })

/** Read-only provider for balances (ethers-based helpers kept for compat). */
export const kuruProvider = new ethers.providers.JsonRpcProvider(
  (import.meta.env.VITE_RPC_URL as string | undefined) ?? 'https://testnet-rpc.monad.xyz',
)

/** Live balance for a Kuru token (native MON or ERC-20). */
export async function fetchKuruBalance(provider: ethers.providers.Provider, token: KuruToken, address: string): Promise<number> {
  if (token.address === ADDRESS_ZERO) {
    return Number(ethers.utils.formatEther(await provider.getBalance(address)))
  }
  const contract = new ethers.Contract(token.address, ['function balanceOf(address) view returns (uint256)'], provider)
  return Number(ethers.utils.formatUnits(await contract.balanceOf(address), token.decimals))
}

/** Bridge a Privy wallet (EIP-1193 provider) into an ethers v5 signer (kept for compat). */
export async function getKuruSigner(ethereumProvider: unknown): Promise<ethers.Signer> {
  const web3Provider = new ethers.providers.Web3Provider(ethereumProvider as ethers.providers.ExternalProvider)
  return web3Provider.getSigner()
}

export interface DirectQuote {
  market: Address
  side: 'sell' | 'buy' // sell base for quote | spend quote to buy base
  inputRaw: bigint
  outputRaw: bigint // estimated, before slippage
  minOutRaw: bigint // after slippage
  bid: bigint
  ask: bigint
  pricePrecision: bigint
  from: KuruToken
  to: KuruToken
}

function findMarket(from: Address, to: Address): { market: DirectMarket; side: 'sell' | 'buy' } | null {
  const f = from.toLowerCase()
  const t = to.toLowerCase()
  for (const m of DIRECT_MARKETS) {
    if (m.base.toLowerCase() === f && m.quote.toLowerCase() === t) return { market: m, side: 'sell' }
    if (m.base.toLowerCase() === t && m.quote.toLowerCase() === f) return { market: m, side: 'buy' }
  }
  return null
}

async function pricePrecisionOf(market: Address): Promise<bigint> {
  try {
    const res = await fetch(`${KURU_API}/api/v1/markets`)
    if (!res.ok) return 100n
    const json = (await res.json()) as { data?: Array<{ marketAddress?: string; pricePrecision?: string }> }
    const row = (json.data ?? []).find(m => m.marketAddress?.toLowerCase() === market.toLowerCase())
    if (row?.pricePrecision) return BigInt(row.pricePrecision)
  } catch { /* fallback below */ }
  return 100n
}

/**
 * Quote a DIRECT market swap using live bestBidAsk.
 * Output estimate assumes the top-of-book price holds for the full size (fine for demo sizes;
 * minOut + FOK protect execution).
 */
export async function quoteSwap(fromSymbol: string, toSymbol: string, amountHuman: number, slippagePct: number): Promise<DirectQuote> {
  const from = kuruTokenBySymbol(fromSymbol)
  const to = kuruTokenBySymbol(toSymbol)
  if (!from || !to) throw new Error(`unsupported pair ${fromSymbol} → ${toSymbol}`)
  if (fromSymbol === toSymbol) throw new Error('pick two different tokens')

  const found = findMarket(from.address, to.address)
  if (!found) throw new Error(`no direct Kuru market for ${fromSymbol} → ${toSymbol} (all markets quote in USDC)`)

  const { market, side } = found
  const [bid, ask] = (await publicClient.readContract({
    address: market.market,
    abi: marketAbi,
    functionName: 'bestBidAsk',
  })) as readonly [bigint, bigint]
  const P = await pricePrecisionOf(market.market)

  if (side === 'sell') {
    if (bid === 0n) throw new Error(`no bids on ${fromSymbol}/USDC right now — nobody to sell to`)
    const inputRaw = BigInt(Math.round(amountHuman * 10 ** from.decimals))
    // out(quoteRaw) = in(baseRaw) × bid / P, adjusted for decimals
    const decAdj = 10n ** BigInt(Math.max(0, from.decimals - to.decimals))
    const decMul = 10n ** BigInt(Math.max(0, to.decimals - from.decimals))
    const outputRaw = (inputRaw * bid * decMul) / P / decAdj
    if (outputRaw <= 0n) throw new Error('amount too small for this market')
    const minOutRaw = (outputRaw * BigInt(Math.round((100 - slippagePct) * 100))) / 10000n
    return { market: market.market, side, inputRaw, outputRaw, minOutRaw, bid, ask, pricePrecision: P, from, to }
  }

  if (ask === 0n) throw new Error(`no asks on ${toSymbol}/USDC right now — nothing to buy`)
  const inputRaw = BigInt(Math.round(amountHuman * 10 ** from.decimals))
  // spending quote Q to buy base: out(baseRaw) = Q × P / ask × 10^(baseDec - quoteDec)
  const decMul = 10n ** BigInt(Math.max(0, to.decimals - from.decimals))
  const decAdj = 10n ** BigInt(Math.max(0, from.decimals - to.decimals))
  const outputRaw = (inputRaw * P * decMul) / ask / decAdj
  if (outputRaw <= 0n) throw new Error('amount too small for this market')
  const minOutRaw = (outputRaw * BigInt(Math.round((100 - slippagePct) * 100))) / 10000n
  return { market: market.market, side, inputRaw, outputRaw, minOutRaw, bid, ask, pricePrecision: P, from, to }
}

/**
 * Execute a quoted direct swap through the market contract.
 * ERC-20 inputs are approved first; native MON is sent as msg.value.
 * A simulation runs first — if it reverts, nothing is broadcast.
 */
export async function executeSwap(opts: {
  walletClient: WalletClient
  ownerAddress: Address
  quote: DirectQuote
  onStatus?: (status: 'approving' | 'simulating' | 'swapping') => void
}): Promise<{ txHash: Hash; partialFill: boolean }> {
  const { walletClient, ownerAddress, quote } = opts
  const inputIsNative = quote.from.address === ADDRESS_ZERO

  if (!inputIsNative) {
    opts.onStatus?.('approving')
    const approveHash = await walletClient.writeContract({
      account: ownerAddress,
      chain: monadTestnet,
      address: quote.from.address,
      abi: erc20ApproveAbi,
      functionName: 'approve',
      args: [quote.market, quote.inputRaw],
    })
    await publicClient.waitForTransactionReceipt({ hash: approveHash })
  }

  const functionName = quote.side === 'sell' ? 'placeAndExecuteMarketSell' : 'placeAndExecuteMarketBuy'

  // The public testnet RPC load-balances across nodes that can be briefly out of
  // sync, so a single simulation may falsely reject. Retry, then fall back to
  // non-FOK (partial fills allowed, minOut still enforced on-chain).
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
  let fok = true
  let simulated = false
  let lastErr: unknown = null
  opts.onStatus?.('simulating')
  for (let attempt = 0; attempt < 3 && !simulated; attempt++) {
    try {
      await publicClient.simulateContract({
        account: ownerAddress,
        address: quote.market,
        abi: marketAbi,
        functionName,
        args: [quote.inputRaw, quote.minOutRaw, false, true],
        value: inputIsNative ? quote.inputRaw : 0n,
      })
      simulated = true
    } catch (e) {
      lastErr = e
      await sleep(800)
    }
  }
  if (!simulated) {
    try {
      await publicClient.simulateContract({
        account: ownerAddress,
        address: quote.market,
        abi: marketAbi,
        functionName,
        args: [quote.inputRaw, quote.minOutRaw, false, false],
        value: inputIsNative ? quote.inputRaw : 0n,
      })
      simulated = true
      fok = false
    } catch (e) {
      lastErr = e
    }
  }
  if (!simulated) {
    const err = lastErr as Error & { shortMessage?: string }
    throw new Error(`market rejected the swap in simulation: ${err.shortMessage || err.message}`)
  }

  opts.onStatus?.('swapping')
  const txHash = await walletClient.writeContract({
    account: ownerAddress,
    chain: monadTestnet,
    address: quote.market,
    abi: marketAbi,
    functionName,
    args: [quote.inputRaw, quote.minOutRaw, false, fok],
    value: inputIsNative ? quote.inputRaw : 0n,
  })
  await publicClient.waitForTransactionReceipt({ hash: txHash })
  return { txHash, partialFill: !fok }
}

export const formatQuoteAmount = (raw: bigint, decimals: number) =>
  Number(formatUnits(raw, decimals)).toLocaleString('en-US', { maximumFractionDigits: 6 })

// Legacy SDK-based exports removed (kuru-sdk 0.2.47 targets a retired orderbook version).
// KURU_ROUTER is unused on testnet (no Flow entrypoint deployed there); kept for reference.
export { encodeFunctionData }

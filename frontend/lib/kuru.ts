import { ethers } from 'ethers'
import {
  createPublicClient,
  encodeFunctionData,
  formatUnits,
  http,
  parseAbiItem,
  type Address,
  type Hash,
} from 'viem'
import { monadTestnet } from './chain'

export const KURU_ROUTER = '0x1f5A250c4A506DA4cE584173c6ed1890B1bf7187'
export const KURU_API = (import.meta.env.VITE_KURU_API as string | undefined) ?? 'https://api.testnet.kuru.io'

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000' as Address

export const KURU_USDC: Address = '0xee0722ead54f1b4fe97be399be43bc0226a6f97e'
export const CIRCLE_USDC: Address = '0x534b2f3A21130d7a60830c2Df862319e593943A3'

export interface KuruToken {
  symbol: string
  name: string
  address: Address // AddressZero = native MON
  decimals: number
}

/** Tokens with LIVE markets on Kuru testnet (verified against GET /api/v1/markets + bestBidAsk). */
export const KURU_TOKENS: KuruToken[] = [
  { symbol: 'MON', name: 'Monad (native)', address: ADDRESS_ZERO, decimals: 18 },
  { symbol: 'WMON', name: 'Wrapped Monad (FluxPay)', address: '0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541', decimals: 18 },
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

const MARKET_ABI = [
  parseAbiItem('function bestBidAsk() external view returns (uint256 bid, uint256 ask)'),
  parseAbiItem('function placeAndExecuteMarketBuy(uint96 _quoteAmount, uint256 _minAmountOut, bool _isMargin, bool _isFillOrKill) external payable returns (uint256)'),
  parseAbiItem('function placeAndExecuteMarketSell(uint96 _size, uint256 _minAmountOut, bool _isMargin, bool _isFillOrKill) external payable returns (uint256)'),
] as const

const ERC20_ABI = [
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

/**
 * Mint Kuru testnet USDC to an address. The mock exposes open minting
 * (verified live via eth_call) — 100 USDC per click for swap testing.
 * NOTE: explicit gasLimit — estimation via the viem-based signing stack
 * systematically reverts against testnet-rpc's balancer; execution itself is fine.
 */
export async function mintKuruUsdc(ethereumProvider: unknown, to: Address, amountHuman = 100): Promise<Hash> {
  const provider = new ethers.providers.Web3Provider(ethereumProvider as ethers.providers.ExternalProvider)
  const signer = provider.getSigner()
  const token = new ethers.Contract(KURU_USDC, ['function mint(address to, uint256 amount)'], signer)
  const tx = await token.mint(to, ethers.utils.parseUnits(String(amountHuman), 6), { gasLimit: 150000 })
  const receipt = await tx.wait()
  return receipt.transactionHash as Hash
}

export interface DirectQuote {
  kind: 'kuru' | 'wrap'
  market: Address
  side: 'sell' | 'buy' | 'wrap' | 'unwrap'
  inputRaw: bigint // human → raw token units (msg.value for native, display)
  inputUnits: bigint // human → market precision units (the _size/_quoteAmount chain arg)
  outputRaw: bigint // estimated, before slippage
  minOutRaw: bigint // after slippage
  bid: bigint
  ask: bigint
  pricePrecision: bigint
  sizePrecision: bigint
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

async function marketPrecisions(market: Address): Promise<{ pricePrecision: bigint; sizePrecision: bigint }> {
  const fallback: Record<string, { pricePrecision: bigint; sizePrecision: bigint }> = {
    '0xfdbe356828c8f5a5d5ed4f69dde0816f4058ef61': { pricePrecision: 1000000n, sizePrecision: 100000000n },
    '0xa9c2936656a7d2143720bcd91ba8506200b7cbe7': { pricePrecision: 100n, sizePrecision: 10000000000n },
    '0x5bdea6f9f9aba34f4ecb9b865646a792b835ef7f': { pricePrecision: 100n, sizePrecision: 100000000n },
    '0x0b4dd2a7b09d5c5401149ffe51301cc589017343': { pricePrecision: 100n, sizePrecision: 1000000n },
  }
  try {
    const res = await fetch(`${KURU_API}/api/v1/markets`)
    if (res.ok) {
      const json = (await res.json()) as {
        data?: Array<{ marketAddress?: string; pricePrecision?: string; sizePrecision?: string }>
      }
      const row = (json.data ?? []).find(m => m.marketAddress?.toLowerCase() === market.toLowerCase())
      if (row?.pricePrecision && row?.sizePrecision) {
        return { pricePrecision: BigInt(row.pricePrecision), sizePrecision: BigInt(row.sizePrecision) }
      }
    }
  } catch { /* fallback below */ }
  return fallback[market.toLowerCase()] ?? { pricePrecision: 100n, sizePrecision: 100000000n }
}

async function pricePrecisionOf(market: Address): Promise<bigint> {
  return (await marketPrecisions(market)).pricePrecision
}

const WMON_FLUXPAY = '0xfb8bf4c1cc7a94c73d209a149ea2abea852bc541'

const WRAP_ABI = [
  'function deposit() payable',
  'function withdraw(uint256 amount)',
]

/** Is this pair a MON↔FluxPay-WMON wrap (always executable, 1:1, no liquidity needed)? */
export function isWrapPair(from: KuruToken, to: KuruToken): 'wrap' | 'unwrap' | null {
  const f = from.address.toLowerCase()
  const t = to.address.toLowerCase()
  if (f === ADDRESS_ZERO.toLowerCase() && t === WMON_FLUXPAY) return 'wrap'
  if (f === WMON_FLUXPAY && t === ADDRESS_ZERO.toLowerCase()) return 'unwrap'
  return null
}

export function quoteWrap(from: KuruToken, to: KuruToken, amountHuman: number): DirectQuote {
  const inputRaw = BigInt(Math.round(amountHuman * 10 ** from.decimals))
  if (inputRaw <= 0n) throw new Error('amount too small')
  const side = isWrapPair(from, to)
  if (!side) throw new Error('not a wrap pair')
  return {
    kind: 'wrap',
    market: to.address === ADDRESS_ZERO ? from.address : to.address,
    side,
    inputRaw,
    inputUnits: inputRaw,
    outputRaw: inputRaw,
    minOutRaw: inputRaw,
    bid: 0n,
    ask: 0n,
    pricePrecision: 1n,
    sizePrecision: 1n,
    from,
    to,
  }
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

  if (isWrapPair(from, to)) return quoteWrap(from, to, amountHuman)

  const found = findMarket(from.address, to.address)
  if (!found) throw new Error(`no direct Kuru market for ${fromSymbol} → ${toSymbol} (all markets quote in USDC)`)

  const { market, side } = found
  const [bid, ask] = (await publicClient.readContract({
    address: market.market,
    abi: MARKET_ABI,
    functionName: 'bestBidAsk',
  })) as readonly [bigint, bigint]
  const { pricePrecision: P, sizePrecision: S } = await marketPrecisions(market.market)

  if (side === 'sell') {
    if (bid === 0n) throw new Error(`no bids on ${fromSymbol}/USDC right now — nobody to sell to`)
    const inputRaw = BigInt(Math.round(amountHuman * 10 ** from.decimals))
    const inputUnits = BigInt(Math.round(amountHuman * Number(S)))
    // out(quoteRaw) = amountHuman × bid/P × 10^quoteDec
    const outputRaw = (BigInt(Math.round(amountHuman * 1e6)) * bid * BigInt(10 ** to.decimals)) / P / 1000000n
    if (outputRaw <= 0n || inputUnits <= 0n) throw new Error('amount too small for this market')
    const minOutRaw = (outputRaw * BigInt(Math.round((100 - slippagePct) * 100))) / 10000n
    return { kind: 'kuru', market: market.market, side, inputRaw, inputUnits, outputRaw, minOutRaw, bid, ask, pricePrecision: P, sizePrecision: S, from, to }
  }

  if (ask === 0n) throw new Error(`no asks on ${toSymbol}/USDC right now — nothing to buy`)
  const inputRaw = BigInt(Math.round(amountHuman * 10 ** from.decimals))
  const inputUnits = BigInt(Math.round(amountHuman * Number(P)))
  // spending Q quote to buy base: out(baseRaw) = Q × P/ask × 10^baseDec
  const outputRaw = (BigInt(Math.round(amountHuman * 1e6)) * P * BigInt(10 ** to.decimals)) / ask / 1000000n
  if (outputRaw <= 0n || inputUnits <= 0n) throw new Error('amount too small for this market')
  const minOutRaw = (outputRaw * BigInt(Math.round((100 - slippagePct) * 100))) / 10000n
  return { kind: 'kuru', market: market.market, side, inputRaw, inputUnits, outputRaw, minOutRaw, bid, ask, pricePrecision: P, sizePrecision: S, from, to }
}

/**
 * Execute a quoted direct swap through an ethers signer (built from the Privy
 * EIP-1193 provider). NOTE: viem's eth_call/simulate path systematically reverts
 * against testnet-rpc.monad.xyz's balancer while byte-identical ethers calls
 * succeed, so execution deliberately avoids viem here.
 * ERC-20 inputs are approved first; native MON is sent as msg.value.
 * A pre-check runs first — if it reverts, nothing is broadcast.
 */
export async function executeSwap(opts: {
  ethereumProvider: unknown
  ownerAddress: Address
  quote: DirectQuote
  onStatus?: (status: 'approving' | 'simulating' | 'swapping') => void
}): Promise<{ txHash: Hash; partialFill: boolean }> {
  const { ownerAddress, quote } = opts
  const provider = new ethers.providers.Web3Provider(opts.ethereumProvider as ethers.providers.ExternalProvider)
  const signer = provider.getSigner()

  // Wrap path: MON↔WMON directly against the canonical wrapper (1:1, always executable).
  if (quote.kind === 'wrap') {
    const wmon = new ethers.Contract(quote.market, WRAP_ABI, signer)
    const callData = quote.side === 'wrap'
      ? { to: quote.market, data: wmon.interface.encodeFunctionData('deposit'), value: ethers.BigNumber.from(quote.inputRaw.toString()), from: ownerAddress }
      : { to: quote.market, data: wmon.interface.encodeFunctionData('withdraw', [quote.inputRaw.toString()]), value: ethers.BigNumber.from(0), from: ownerAddress }
    opts.onStatus?.('simulating')
    try {
      await provider.call(callData)
    } catch (e) {
      const err = e as Error & { reason?: string }
      throw new Error(`wrap rejected in simulation: ${err.reason || err.message}`)
    }
    opts.onStatus?.('swapping')
    const tx = quote.side === 'wrap'
      ? await wmon.deposit({ value: ethers.BigNumber.from(quote.inputRaw.toString()) })
      : await wmon.withdraw(quote.inputRaw.toString())
    const receipt = await tx.wait()
    return { txHash: receipt.transactionHash as Hash, partialFill: false }
  }

  const market = new ethers.Contract(quote.market, MARKET_ABI, signer)
  const inputIsNative = quote.from.address === ADDRESS_ZERO
  const fn = quote.side === 'sell' ? 'placeAndExecuteMarketSell' : 'placeAndExecuteMarketBuy'

  if (!inputIsNative) {
    opts.onStatus?.('approving')
    const token = new ethers.Contract(quote.from.address, ERC20_ABI, signer)
    const approveTx = await token.approve(quote.market, ethers.BigNumber.from(quote.inputRaw.toString()))
    await approveTx.wait()
  }

  const buildCall = (fok: boolean) => ({
    to: quote.market,
    data: market.interface.encodeFunctionData(fn, [quote.inputUnits.toString(), quote.minOutRaw.toString(), false, fok]),
    value: inputIsNative ? ethers.BigNumber.from(quote.inputRaw.toString()) : ethers.BigNumber.from(0),
    from: ownerAddress,
  })

  // Pre-check with the same library that executes (ethers eth_call succeeds reliably).
  opts.onStatus?.('simulating')
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
  let fok = true
  let ok = false
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    try {
      await provider.call(buildCall(true))
      ok = true
    } catch (e) {
      lastErr = e
      await sleep(800)
    }
  }
  if (!ok) {
    try {
      await provider.call(buildCall(false))
      ok = true
      fok = false
    } catch (e) {
      lastErr = e
    }
  }
  if (!ok) {
    const err = lastErr as Error & { reason?: string }
    throw new Error(`market rejected the swap in simulation: ${err.reason || err.message}`)
  }

  opts.onStatus?.('swapping')
  const tx = await market[fn](
    quote.inputUnits.toString(),
    quote.minOutRaw.toString(),
    false,
    fok,
    {
      value: inputIsNative ? ethers.BigNumber.from(quote.inputRaw.toString()) : 0,
      // explicit limit: skip estimator (see mintKuruUsdc note)
      gasLimit: 1000000,
    },
  )
  const receipt = await tx.wait()
  return { txHash: receipt.transactionHash as Hash, partialFill: !fok }
}

export const formatQuoteAmount = (raw: bigint, decimals: number) =>
  Number(formatUnits(raw, decimals)).toLocaleString('en-US', { maximumFractionDigits: 6 })

// Legacy SDK-based exports removed (kuru-sdk 0.2.47 targets a retired orderbook version).
// KURU_ROUTER is unused on testnet (no Flow entrypoint deployed there); kept for reference.
export { encodeFunctionData }

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
import { cachedRpc } from './rpc'
import type { GaslessCall } from './gasless'

export const KURU_ROUTER = '0x7EFbE105Ca7415dE98F96622173458ac1c054630'
export const KURU_API = (import.meta.env.VITE_KURU_API as string | undefined) ?? 'https://api.testnet.kuru.io'

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000' as Address

export const KURU_USDC: Address = '0xa402b424f392eaa05dbc8779e4502a1f6a96fef1'
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
  { symbol: 'USDC', name: 'Kuru Testnet USDC', address: '0xa402b424f392eaa05dbc8779e4502a1f6a96fef1', decimals: 6 },
  { symbol: 'WETH', name: 'Wrapped Ether', address: '0x63c84e18184021c6cce5ea57d0c3ec0e65f3b303', decimals: 18 },
  { symbol: 'XAUT', name: 'Tether Gold', address: '0x7553b18a8c8400a1b7746c1f5b4f453d57555838', decimals: 6 },
  { symbol: 'WBTC', name: 'Wrapped BTC', address: '0x7cdc77b348a2e101c766ad290367f3c5f287af18', decimals: 8 },
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
  { market: '0x26cd68436b6a4aeb3ec52abc20a4d121f8b4bac9', base: ADDRESS_ZERO, quote: '0xa402b424f392eaa05dbc8779e4502a1f6a96fef1', baseDec: 18, quoteDec: 6 }, // MON/USDC (currently no orders)
  { market: '0x9d187971b64505ac81f12c5fd2ac9c5247ec62f3', base: '0x63c84e18184021c6cce5ea57d0c3ec0e65f3b303', quote: '0xa402b424f392eaa05dbc8779e4502a1f6a96fef1', baseDec: 18, quoteDec: 6 }, // WETH/USDC
  { market: '0x0e2a5d9378fb61b8ec100bd770c449f6fdd3e4d6', base: '0x7553b18a8c8400a1b7746c1f5b4f453d57555838', quote: '0xa402b424f392eaa05dbc8779e4502a1f6a96fef1', baseDec: 6, quoteDec: 6 }, // XAUT/USDC
  { market: '0x8661cb7c5f4f8ae3ee116b63aa5a23c69110e357', base: '0x7cdc77b348a2e101c766ad290367f3c5f287af18', quote: '0xa402b424f392eaa05dbc8779e4502a1f6a96fef1', baseDec: 8, quoteDec: 6 }, // WBTC/USDC
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
 * Submitted as a sponsored userOp like every other transaction.
 */
export async function mintKuruUsdc(
  walletClient: WalletClient,
  ownerAddress: Address,
  to: Address,
  amountHuman = 100,
): Promise<Hash> {
  const { sendGasless } = await import('./gasless')
  const data = encodeFunctionData({
    abi: [parseAbiItem('function mint(address to, uint256 amount)')],
    functionName: 'mint',
    args: [to, BigInt(Math.round(amountHuman * 10 ** 6))],
  })
  const result = await sendGasless({
    walletClient,
    ownerAddress,
    calls: [{ to: KURU_USDC, data }],
  })
  return result.txHash
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
    '0x26cd68436b6a4aeb3ec52abc20a4d121f8b4bac9': { pricePrecision: 1000000n, sizePrecision: 1000000n }, // MON/USDC
    '0x9d187971b64505ac81f12c5fd2ac9c5247ec62f3': { pricePrecision: 100n, sizePrecision: 10000000000n }, // WETH/USDC
    '0x0e2a5d9378fb61b8ec100bd770c449f6fdd3e4d6': { pricePrecision: 100n, sizePrecision: 1000000n }, // XAUT/USDC
    '0x8661cb7c5f4f8ae3ee116b63aa5a23c69110e357': { pricePrecision: 100n, sizePrecision: 100000000n }, // WBTC/USDC
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
  const [bid, ask] = await cachedRpc<readonly [bigint, bigint]>(
    `book:${market.market.toLowerCase()}`,
    15_000,
    async () => (await publicClient.readContract({
      address: market.market,
      abi: MARKET_ABI,
      functionName: 'bestBidAsk',
    })) as readonly [bigint, bigint],
  )
  const { pricePrecision: P, sizePrecision: S } = await marketPrecisions(market.market)

  // Kuru signals an empty side with the uint32-max sentinel (0xffffffff), not 0.
  // Treating it as a real price produces a nonsense quote and lets the user try
  // a swap that can only revert — so reject it as "no route".
  const EMPTY_BOOK = 0xffffffffn

  if (side === 'sell') {
    if (bid === 0n || bid >= EMPTY_BOOK) throw new Error(`no bids on ${fromSymbol}/USDC right now — nobody to sell to`)
    const inputRaw = BigInt(Math.round(amountHuman * 10 ** from.decimals))
    const inputUnits = BigInt(Math.round(amountHuman * Number(S)))
    // out(quoteRaw) = amountHuman × bid/P × 10^quoteDec
    const outputRaw = (BigInt(Math.round(amountHuman * 1e6)) * bid * BigInt(10 ** to.decimals)) / P / 1000000n
    if (outputRaw <= 0n || inputUnits <= 0n) throw new Error('amount too small for this market')
    const minOutRaw = (outputRaw * BigInt(Math.round((100 - slippagePct) * 100))) / 10000n
    return { kind: 'kuru', market: market.market, side, inputRaw, inputUnits, outputRaw, minOutRaw, bid, ask, pricePrecision: P, sizePrecision: S, from, to }
  }

  if (ask === 0n || ask >= EMPTY_BOOK) throw new Error(`no asks on ${toSymbol}/USDC right now — nothing to buy`)
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
  walletClient: WalletClient
  ownerAddress: Address
  ethereumProvider: unknown
  quote: DirectQuote
  onStatus?: (status: 'approving' | 'simulating' | 'swapping') => void
}): Promise<{ txHash: Hash; partialFill: boolean }> {
  const { ownerAddress, quote } = opts
  const provider = new ethers.providers.Web3Provider(opts.ethereumProvider as ethers.providers.ExternalProvider)
  const { sendGasless } = await import('./gasless')
  const submit = (calls: GaslessCall[]) =>
    sendGasless({
      walletClient: opts.walletClient,
      ownerAddress,
      calls,
      onStatus: s => {
        if (s === 'signing' || s === 'submitted' || s === 'confirmed') opts.onStatus?.('swapping')
      },
    })

  // Wrap path: MON↔WMON directly against the canonical wrapper (1:1, always executable).
  if (quote.kind === 'wrap') {
    const wmon = new ethers.Contract(quote.market, WRAP_ABI, provider)
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
    const result = await submit([
      quote.side === 'wrap'
        ? { to: quote.market, data: encodeWrapCall(), value: quote.inputRaw }
        : { to: quote.market, data: encodeUnwrapCall(quote) },
    ])
    return { txHash: result.txHash, partialFill: false }
  }

  const market = new ethers.Contract(quote.market, MARKET_ABI, provider)
  const inputIsNative = quote.from.address === ADDRESS_ZERO
  const fn = quote.side === 'sell' ? 'placeAndExecuteMarketSell' : 'placeAndExecuteMarketBuy'

  const buildCall = (fok: boolean) => ({
    to: quote.market,
    data: market.interface.encodeFunctionData(fn, [quote.inputUnits.toString(), quote.minOutRaw.toString(), false, fok]),
    value: inputIsNative ? ethers.BigNumber.from(quote.inputRaw.toString()) : ethers.BigNumber.from(0),
    from: ownerAddress,
  })

  // Pre-check with the library that simulates reliably (ethers eth_call).
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

  const calls: GaslessCall[] = []
  if (!inputIsNative) {
    calls.push({ to: quote.from.address, data: encodeApproveCall(quote.from.address, quote.market, quote.inputRaw) })
  }
  calls.push({
    to: quote.market,
    data: encodeMarketCall(fn, quote, fok),
    value: inputIsNative ? quote.inputRaw : 0n,
  })
  const result = await submit(calls)
  return { txHash: result.txHash, partialFill: !fok }
}

function encodeApproveCall(token: Address, spender: Address, amount: bigint): Hash {
  return encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [spender, amount] })
}

function encodeMarketCall(
  fn: 'placeAndExecuteMarketSell' | 'placeAndExecuteMarketBuy',
  quote: DirectQuote,
  fok: boolean,
): Hash {
  return encodeFunctionData({
    abi: MARKET_ABI,
    functionName: fn,
    args: [quote.inputUnits, quote.minOutRaw, false, fok],
  })
}

function encodeWrapCall(): Hash {
  return encodeFunctionData({ abi: WRAP_ABI, functionName: 'deposit' })
}

function encodeUnwrapCall(quote: DirectQuote): Hash {
  return encodeFunctionData({ abi: WRAP_ABI, functionName: 'withdraw', args: [quote.inputRaw] })
}

export const formatQuoteAmount = (raw: bigint, decimals: number) =>
  Number(formatUnits(raw, decimals)).toLocaleString('en-US', { maximumFractionDigits: 6 })

// Legacy SDK-based exports removed (kuru-sdk 0.2.47 targets a retired orderbook version).
// KURU_ROUTER is unused on testnet (no Flow entrypoint deployed there); kept for reference.
export { encodeFunctionData }

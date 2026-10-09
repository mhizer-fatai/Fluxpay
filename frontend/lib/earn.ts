import { encodeFunctionData, type Address } from 'viem'
import { EARN_VAULT_ADDRESS, earnVaultAbi, erc20Abi, publicClient, yieldStrategyAbi } from '@/lib/chain'
import type { GaslessCall } from '@/lib/gasless'

/** Seconds in a 365-day year, used to turn a per-second rate into an APY. */
export const SECONDS_PER_YEAR = 31_536_000

export interface EarnPosition {
  /** Vault share balance (ERC-20 balance of the vault). */
  shares: bigint
  /** Value of those shares in asset units, including accrued yield. */
  assets: bigint
  /** Vault total assets (principal + accrued yield). */
  totalAssets: bigint
  /** Vault total share supply. */
  totalSupply: bigint
  /** Yield per second as a fraction of principal, scaled by 1e18. */
  ratePerSecondX18: bigint
  /** Remaining pre-funded yield, in asset units. */
  reserve: bigint
  /** Underlying asset address (USDC). */
  asset: Address
}

/** Reads the caller's position plus the vault/strategy parameters needed for live display. */
export async function readEarnPosition(account: Address): Promise<EarnPosition> {
  const vault = { address: EARN_VAULT_ADDRESS, abi: earnVaultAbi } as const
  const [asset, shares, totalAssets, totalSupply, strategyAddr] = await Promise.all([
    publicClient.readContract({ ...vault, functionName: 'asset' }),
    publicClient.readContract({ ...vault, functionName: 'balanceOf', args: [account] }),
    publicClient.readContract({ ...vault, functionName: 'totalAssets' }),
    publicClient.readContract({ ...vault, functionName: 'totalSupply' }),
    publicClient.readContract({ ...vault, functionName: 'strategy' }),
  ])

  const assets = shares > 0n
    ? await publicClient.readContract({ ...vault, functionName: 'convertToAssets', args: [shares] })
    : 0n

  let ratePerSecondX18 = 0n
  let reserve = 0n
  try {
    const strategy = { address: strategyAddr, abi: yieldStrategyAbi } as const
    ;[ratePerSecondX18, reserve] = await Promise.all([
      publicClient.readContract({ ...strategy, functionName: 'ratePerSecondX18' }),
      publicClient.readContract({ ...strategy, functionName: 'reserve' }),
    ])
  } catch { /* strategy shape differs (e.g. a real adapter) — APY stays 0 */ }

  return {
    shares,
    assets,
    totalAssets,
    totalSupply,
    ratePerSecondX18,
    reserve,
    asset: asset as Address,
  }
}

/** APY in percent from a per-second X18 rate (simple interest). */
export function apyPercent(ratePerSecondX18: bigint): number {
  return (Number(ratePerSecondX18) * SECONDS_PER_YEAR) / 1e18 * 100
}

/**
 * Projects the position value `elapsed` seconds from the last read, so the balance can
 * tick without hammering the RPC. Approximate: ignores per-second share rounding.
 */
export function projectedAssets(pos: EarnPosition, elapsed: number): number {
  if (pos.totalSupply === 0n) return 0
  const accrued = (Number(pos.ratePerSecondX18) * elapsed) / 1e18
  const total = Number(pos.totalAssets) + Math.min(accrued, Number(pos.reserve))
  return (Number(pos.shares) * total) / Number(pos.totalSupply)
}

/** approve(USDC) + deposit(assets, receiver) in one sponsored userOp. */
export function buildDepositCalls(opts: { asset: Address; amountRaw: bigint; receiver: Address }): GaslessCall[] {
  return [
    {
      to: opts.asset,
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [EARN_VAULT_ADDRESS, opts.amountRaw] }),
    },
    {
      to: EARN_VAULT_ADDRESS,
      data: encodeFunctionData({ abi: earnVaultAbi, functionName: 'deposit', args: [opts.amountRaw, opts.receiver] }),
    },
  ]
}

/** redeem(shares, receiver, owner) — returns principal plus accrued yield. */
export function buildWithdrawCalls(opts: { shares: bigint; receiver: Address }): GaslessCall[] {
  return [
    {
      to: EARN_VAULT_ADDRESS,
      data: encodeFunctionData({ abi: earnVaultAbi, functionName: 'redeem', args: [opts.shares, opts.receiver, opts.receiver] }),
    },
  ]
}

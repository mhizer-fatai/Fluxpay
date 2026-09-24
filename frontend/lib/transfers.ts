import { encodeFunctionData } from 'viem'
import { erc20Abi, FLUXPAY_ADDRESS, fluxPayAbi, monadTestnet, publicClient, type TokenInfo } from './chain'
import type { Address, Hash, WalletClient } from 'viem'

export interface SendResult {
  approveHash: Hash | null
  txHash: Hash
}

/**
 * Real send path: ERC20 → approve (only if allowance short) then FluxPay.settle.
 * Native MON → plain transfer from the wallet.
 */
export async function sendFunds(opts: {
  walletClient: WalletClient
  from: Address
  token: TokenInfo
  amountHuman: number
  to: Address
  onStep?: (step: 'approving' | 'sending') => void
}): Promise<SendResult> {
  const { walletClient, from, token, amountHuman, to, onStep } = opts

  if (!token.address) {
    onStep?.('sending')
    const txHash = await walletClient.sendTransaction({
      account: from,
      chain: monadTestnet,
      to,
      value: BigInt(Math.round(amountHuman * 1e18)),
    })
    await publicClient.waitForTransactionReceipt({ hash: txHash })
    return { approveHash: null, txHash }
  }

  const rawAmount = BigInt(Math.round(amountHuman * 10 ** token.decimals))
  const allowance = (await publicClient.readContract({
    address: token.address,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [from, FLUXPAY_ADDRESS],
  })) as bigint

  let approveHash: Hash | null = null
  if (allowance < rawAmount) {
    onStep?.('approving')
    approveHash = await walletClient.writeContract({
      account: from, chain: monadTestnet,
      address: token.address, abi: erc20Abi, functionName: 'approve',
      args: [FLUXPAY_ADDRESS, rawAmount],
    })
    await publicClient.waitForTransactionReceipt({ hash: approveHash })
  }

  onStep?.('sending')
  const txHash = await walletClient.writeContract({
    account: from, chain: monadTestnet,
    address: FLUXPAY_ADDRESS, abi: fluxPayAbi, functionName: 'settle',
    args: [token.address, to, rawAmount],
  })
  await publicClient.waitForTransactionReceipt({ hash: txHash })
  return { approveHash, txHash }
}

/** Gas estimate in MON (native) for display; 0 when estimation fails. */
export async function estimateFeeMon(opts: {
  from: Address
  token: TokenInfo
  amountHuman: number
  to: Address
}): Promise<number> {
  try {
    const rawAmount = opts.token.address
      ? BigInt(Math.round(opts.amountHuman * 10 ** opts.token.decimals))
      : BigInt(Math.round(opts.amountHuman * 1e18))

    const to = opts.token.address ?? opts.to
    const data = opts.token.address
      ? encodeFunctionData({ abi: fluxPayAbi, functionName: 'settle', args: [opts.token.address, opts.to, rawAmount] })
      : '0x'

    const [gas, gasPrice] = await Promise.all([
      publicClient.estimateGas({ account: opts.from, to, data, value: 0n }),
      publicClient.getGasPrice(),
    ])
    return Number((gas * gasPrice) / 10n ** 18n)
  } catch {
    return 0
  }
}

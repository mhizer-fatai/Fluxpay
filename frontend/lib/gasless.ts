import { createPublicClient, encodeFunctionData, http, type Address, type Hash, type WalletClient } from 'viem'
import { toAccount } from 'viem/accounts'
import { createSmartAccountClient } from 'permissionless/clients'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import { toSimpleSmartAccount } from 'permissionless/accounts'
import { erc20Abi, FLUXPAY_ADDRESS, fluxPayAbi, monadTestnet, type TokenInfo } from './chain'

const ENTRYPOINT_V06 = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as Address // verified live via Pimlico eth_supportedEntryPoints

const PIMLICO_URL = `https://api.pimlico.io/v2/10143/rpc?apikey=${import.meta.env.VITE_PIMLICO_API_KEY ?? ''}`

const publicClient = createPublicClient({ chain: monadTestnet, transport: http() })

/**
 * Wrap a Privy viem wallet client (embedded EOA signer) as a viem account that can
 * sign UserOperation hashes for an ERC-4337 smart account.
 */
function privySignerToAccount(walletClient: WalletClient, address: Address) {
  return toAccount({
    address,
    async signMessage({ message }) {
      return walletClient.signMessage({ account: address, message })
    },
    async signTransaction(transaction) {
      return walletClient.signTransaction({ ...transaction, account: address, chain: monadTestnet } as never)
    },
    async signTypedData(typedData) {
      return walletClient.signTypedData({ ...typedData, account: address } as never)
    },
  })
}

export const hasPimlicoKey = () => Boolean(import.meta.env.VITE_PIMLICO_API_KEY)

/** Deterministic smart-account address for an owner (counterfactual until first userOp). */
export async function getGaslessAddress(ownerAddress: Address, walletClient: WalletClient): Promise<Address> {
  const owner = privySignerToAccount(walletClient, ownerAddress)
  const account = await toSimpleSmartAccount({
    client: publicClient,
    owner,
    entryPoint: { address: ENTRYPOINT_V06, version: '0.6' },
  })
  return account.address
}

export interface GaslessCall {
  to: Address
  data?: Hash
  value?: bigint
}

/**
 * Sponsored send: batches calls into ONE ERC-4337 userOp (approve + settle),
 * gas paid by the Pimlico paymaster policy tied to VITE_PIMLICO_API_KEY.
 * Requires the funding/policy to exist in the Pimlico dashboard.
 */
export async function sendGasless(opts: {
  walletClient: WalletClient
  ownerAddress: Address
  calls: GaslessCall[]
  onStatus?: (status: 'building' | 'signing' | 'submitted' | 'confirmed') => void
}): Promise<{ userOpHash: Hash; txHash: Hash }> {
  const owner = privySignerToAccount(opts.walletClient, opts.ownerAddress)

  const pimlicoClient = createPimlicoClient({
    transport: http(PIMLICO_URL),
    entryPoint: { address: ENTRYPOINT_V06, version: '0.6' },
  })

  const account = await toSimpleSmartAccount({
    client: publicClient,
    owner,
    entryPoint: { address: ENTRYPOINT_V06, version: '0.6' },
  })

  const smartAccountClient = createSmartAccountClient({
    account,
    chain: monadTestnet,
    bundlerTransport: http(PIMLICO_URL),
    paymaster: pimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
    },
  })

  opts.onStatus?.('signing')
  const userOpHash = await smartAccountClient.sendTransaction({
    calls: opts.calls.map(c => ({ to: c.to, data: c.data ?? '0x', value: c.value ?? 0n })),
  })
  opts.onStatus?.('submitted')

  const receipt = await pimlicoClient.waitForUserOperationReceipt({ hash: userOpHash })
  opts.onStatus?.('confirmed')
  return { userOpHash, txHash: receipt.receipt.transactionHash }
}

/** Build the approve + FluxPay.settle call batch for an ERC-20 (or native transfer call). */
export function buildSettleCalls(opts: { token: TokenInfo; amountHuman: number; to: Address }): GaslessCall[] {
  if (!opts.token.address) {
    return [{ to: opts.to, value: BigInt(Math.round(opts.amountHuman * 1e18)) }]
  }
  const rawAmount = BigInt(Math.round(opts.amountHuman * 10 ** opts.token.decimals))
  return [
    {
      to: opts.token.address,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [FLUXPAY_ADDRESS, rawAmount],
      }),
    },
    {
      to: FLUXPAY_ADDRESS,
      data: encodeFunctionData({
        abi: fluxPayAbi,
        functionName: 'settle',
        args: [opts.token.address, opts.to, rawAmount],
      }),
    },
  ]
}

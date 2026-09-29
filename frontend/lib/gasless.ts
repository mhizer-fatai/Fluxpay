import { createPublicClient, encodeFunctionData, http, type Address, type Hash, type WalletClient } from 'viem'
import { toAccount } from 'viem/accounts'
import { createSmartAccountClient } from 'permissionless/clients'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import { toSimpleSmartAccount } from 'permissionless/accounts'
import { erc20Abi, FLUXPAY_ADDRESS, fluxPayAbi, monadTestnet, type TokenInfo } from './chain'
import { getAuthToken } from './api'

const ENTRYPOINT_V06 = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as Address // verified live via Pimlico eth_supportedEntryPoints

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'
// Pimlico is reached ONLY through our authenticated backend proxy, so the API key
// never ships in the browser bundle or appears in DevTools network requests.
const PIMLICO_PROXY_URL = `${API_URL}/api/v1/aa/rpc`

async function pimlicoFetch(input: any, init?: any): Promise<Response> {
  const token = await getAuthToken()
  return fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
}

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
 * THE transaction path for the whole app: batches arbitrary calls into ONE ERC-4337
 * userOp from the user's smart account, gas paid invisibly by the Pimlico paymaster
 * policy configured server-side. There is no other send path — the user never
 * sees gas, fees, or toggles. Pimlico is reached only through our authenticated
 * backend proxy (/api/v1/aa/rpc); no API key ever ships to the browser.
 */
export async function sendGasless(opts: {
  walletClient: WalletClient
  ownerAddress: Address
  calls: GaslessCall[]
  onStatus?: (status: 'building' | 'signing' | 'submitted' | 'confirmed') => void
}): Promise<{ userOpHash: Hash; txHash: Hash }> {
  const owner = privySignerToAccount(opts.walletClient, opts.ownerAddress)

  const pimlicoClient = createPimlicoClient({
    transport: http(PIMLICO_PROXY_URL, { fetchFn: pimlicoFetch as typeof fetch }),
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
    bundlerTransport: http(PIMLICO_PROXY_URL, { fetchFn: pimlicoFetch as typeof fetch }),
    paymaster: pimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
    },
  })

  opts.onStatus?.('signing')
  // Bounded submit: Privy popup approvals that never resolve (popup blockers,
  // Brave Shields, closed popups) must surface as errors, not hang forever.
  const userOpHash = await Promise.race([
    smartAccountClient.sendTransaction({
      calls: opts.calls.map(c => ({ to: c.to, data: c.data ?? '0x', value: c.value ?? 0n })),
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Signing/submission timed out after 90s — the wallet approval may not have completed.')), 90_000),
    ),
  ])
  opts.onStatus?.('submitted')
  // Surfaced immediately: with this hash anyone can look the operation up in
  // Pimlico's User Operation Logs or query its receipt directly.
  console.info('[gasless] userOp submitted:', userOpHash)

  // Bounded receipt wait: the testnet bundler can take minutes to include a userOp.
  // Critical: a timeout does NOT cancel the operation — it may still land later,
  // so the message must warn against blind retrying (double-send risk).
  const receipt = await Promise.race([
    pimlicoClient.waitForUserOperationReceipt({ hash: userOpHash }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Still waiting on confirmation after 5 minutes — check Activity before retrying: this transaction may still land and retrying could send twice.')), 300_000),
    ),
  ])
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

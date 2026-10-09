import { useCallback, useEffect, useState } from 'react'
import { createWalletClient, custom, type Address, type EIP1193Provider, type WalletClient } from 'viem'
import { monadTestnet } from '@/lib/chain'

type Eip1193 = EIP1193Provider & { isMetaMask?: boolean; providers?: EIP1193Provider[] }

// EIP-6963: wallets announce themselves, which disambiguates `window.ethereum`
// when several are installed (Phantom + MetaMask + …).
let announced: EIP1193Provider | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', ((e: CustomEvent<{ info?: { rdns?: string }; provider?: EIP1193Provider }>) => {
    const provider = e.detail?.provider
    if (!provider) return
    if (!announced || e.detail?.info?.rdns === 'io.metamask') announced = provider
  }) as EventListener)
  window.dispatchEvent(new Event('eip6963:requestProvider'))
}

/** Injected wallet: an EIP-6963 announcement first, then `window.ethereum`. */
export const getInjectedProvider = (): EIP1193Provider | null => {
  if (typeof window === 'undefined') return null
  if (announced) return announced
  const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum ?? null
  if (!eth) return null
  if (Array.isArray(eth.providers)) {
    return eth.providers.find(p => (p as Eip1193).isMetaMask) ?? eth.providers[0] ?? eth
  }
  return eth
}

export interface InjectedWallet {
  address: Address | null
  chainId: number | null
  connecting: boolean
  connect: () => Promise<Address | null>
  ensureChain: () => Promise<void>
  getWalletClient: () => Promise<WalletClient>
}

/**
 * Payer-side wallet connection for flows that must NOT use the FluxPay smart
 * account (payment links): the user signs from their own browser wallet.
 */
export function useInjectedWallet(): InjectedWallet {
  const [address, setAddress] = useState<Address | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    const provider = getInjectedProvider()
    if (!provider) return
    // Already-authorized accounts show up without prompting.
    void provider
      .request({ method: 'eth_accounts' })
      .then(accounts => setAddress(((accounts as string[])[0] as Address) ?? null))
      .catch(() => {})
    void provider
      .request({ method: 'eth_chainId' })
      .then(id => setChainId(Number(id)))
      .catch(() => {})

    const onAccounts = (...args: unknown[]) => {
      const accounts = (args[0] ?? []) as string[]
      setAddress((accounts[0] as Address) ?? null)
    }
    const onChain = (...args: unknown[]) => setChainId(Number(args[0]))
    provider.on?.('accountsChanged', onAccounts)
    provider.on?.('chainChanged', onChain)
    return () => {
      provider.removeListener?.('accountsChanged', onAccounts)
      provider.removeListener?.('chainChanged', onChain)
    }
  }, [])

  const connect = useCallback(async (): Promise<Address | null> => {
    const provider = getInjectedProvider()
    if (!provider) throw new Error('No browser wallet found — install MetaMask or another EVM wallet.')
    setConnecting(true)
    try {
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
      const next = (accounts[0] as Address) ?? null
      setAddress(next)
      setChainId(Number(await provider.request({ method: 'eth_chainId' })))
      return next
    } finally {
      setConnecting(false)
    }
  }, [])

  /** Switch the wallet to Monad testnet, adding the chain if it isn't known yet. */
  const ensureChain = useCallback(async () => {
    const provider = getInjectedProvider()
    if (!provider) throw new Error('No browser wallet found')
    const hex = `0x${monadTestnet.id.toString(16)}`
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] })
    } catch (e) {
      const code = (e as { code?: number }).code
      if (code !== 4902 && code !== -32603) throw e
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: hex,
            chainName: monadTestnet.name,
            nativeCurrency: monadTestnet.nativeCurrency,
            rpcUrls: [monadTestnet.rpcUrls.default.http[0] ?? 'https://testnet-rpc.monad.xyz'],
            blockExplorerUrls: [monadTestnet.blockExplorers?.default.url ?? 'https://testnet.monadexplorer.com'],
          },
        ],
      })
    }
    setChainId(monadTestnet.id)
  }, [])

  const getWalletClient = useCallback(async (): Promise<WalletClient> => {
    const provider = getInjectedProvider()
    if (!provider) throw new Error('No browser wallet found')
    return createWalletClient({ chain: monadTestnet, transport: custom(provider) })
  }, [])

  return { address, chainId, connecting, connect, ensureChain, getWalletClient }
}

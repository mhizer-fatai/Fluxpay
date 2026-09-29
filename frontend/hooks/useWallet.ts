import { useCallback, useEffect, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { createWalletClient, custom, type WalletClient } from 'viem'
import { monadTestnet } from '../lib/chain'

export function useWallet() {
  const { ready, authenticated, user, getAccessToken, logout } = usePrivy()
  const { wallets } = useWallets()

  // The app never reads external wallets: identity is ALWAYS the embedded wallet.
  // External connected wallets are filtered out entirely (no wallet login, no connectors).
  const isEmbedded = (w: { walletClientType?: string }) =>
    !w.walletClientType || w.walletClientType === 'privy' || w.walletClientType === 'embedded'

  const embeddedWallets = wallets.filter(w => isEmbedded(w as { walletClientType?: string }))

  const privyWallet =
    embeddedWallets.find(w => w.address && user?.wallet?.address && w.address.toLowerCase() === user.wallet.address.toLowerCase()) ??
    embeddedWallets[0] ??
    null

  const address = (privyWallet?.address ?? user?.wallet?.address ?? null) as string | null

  const getWalletClient = useCallback(async (): Promise<WalletClient | null> => {
    if (!privyWallet) return null
    try {
      await privyWallet.switchChain(monadTestnet.id)
    } catch { /* already on chain or unsupported — proceed */ }
    try {
      // Privy ConnectedWallet exposes a viem wallet client
      const wc = (privyWallet as unknown as { getWalletClient: (chain?: number) => Promise<WalletClient> })
        .getWalletClient
      if (typeof wc === 'function') return await (privyWallet as unknown as { getWalletClient: (chain?: number) => Promise<WalletClient> }).getWalletClient(monadTestnet.id)
    } catch { /* fall through to manual provider wrapper */ }
    const provider = await (privyWallet as unknown as { getEthereumProvider: () => Promise<unknown> }).getEthereumProvider()
    return createWalletClient({ chain: monadTestnet, transport: custom(provider as never) })
  }, [privyWallet])

  // The smart account is the money account: all transactions are sponsored userOps
  // from it (Pimlico paymaster, invisible to the user). Derived deterministically.
  const [smartAddress, setSmartAddress] = useState<string | null>(null)
  useEffect(() => {
    if (!address) return
    let alive = true
    void (async () => {
      try {
        const wc = await getWalletClient()
        if (!wc || !alive) return
        const { getGaslessAddress } = await import('../lib/gasless')
        const sa = await getGaslessAddress(address as `0x${string}`, wc)
        if (alive) setSmartAddress(sa)
      } catch { /* sponsored path unavailable for this session */ }
    })()
    return () => { alive = false }
  }, [address, getWalletClient])

  /** The account whose balances and activity the app shows: smart account once known, else EOA. */
  const moneyAddress = smartAddress ?? address

  return { ready, authenticated, address, smartAddress, moneyAddress, wallet: privyWallet ?? null, getWalletClient, getAccessToken, logout, user }
}

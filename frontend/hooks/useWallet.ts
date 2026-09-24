import { useCallback, useEffect, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { createWalletClient, custom, type WalletClient } from 'viem'
import { monadTestnet } from '../lib/chain'

export function useWallet() {
  const { ready, authenticated, user, getAccessToken, logout } = usePrivy()
  const { wallets } = useWallets()

  const privyWallet =
    wallets.find(w => w.address && user?.wallet?.address && w.address.toLowerCase() === user.wallet.address.toLowerCase()) ??
    wallets[0]

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

  return { ready, authenticated, address, wallet: privyWallet ?? null, getWalletClient, getAccessToken, logout, user }
}

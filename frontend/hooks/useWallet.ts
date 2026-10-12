import { useCallback, useEffect, useRef, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { createWalletClient, custom, type WalletClient } from 'viem'
import { monadTestnet } from '../lib/chain'

const SMART_CACHE_PREFIX = 'fluxpay_smart:v1:'

export function useWallet() {
  const { ready, authenticated, user, getAccessToken, logout } = usePrivy()
  const { wallets } = useWallets()

  // The app never reads external wallets: identity is ALWAYS the embedded wallet.
  // External connected wallets are filtered out entirely (no wallet login, no connectors).
  const isEmbedded = (w: { walletClientType?: string }) =>
    !w.walletClientType || w.walletClientType === 'privy' || w.walletClientType === 'embedded'

  // Live refs so getWalletClient can wait for the wallet to appear instead of
  // failing the instant it is asked too early (fresh login / slow page load).
  const walletsRef = useRef(wallets)
  const userRef = useRef(user)
  useEffect(() => { walletsRef.current = wallets }, [wallets])
  useEffect(() => { userRef.current = user }, [user])

  const pickEmbedded = useCallback(
    (list: typeof wallets, u: typeof user): (typeof wallets)[number] | null => {
      const embedded = list.filter(w => isEmbedded(w as { walletClientType?: string }))
      return (
        embedded.find(w => w.address && u?.wallet?.address && w.address.toLowerCase() === u.wallet.address.toLowerCase()) ??
        embedded[0] ??
        null
      )
    },
    [],
  )

  const privyWallet = pickEmbedded(wallets, user)

  const address = (privyWallet?.address ?? user?.wallet?.address ?? null) as string | null

  const getWalletClient = useCallback(async (): Promise<WalletClient | null> => {
    // Wait up to 10s for the embedded wallet to show up. Right after login (or
    // on a fresh page load) the wallet list can still be empty while the user
    // is already tapping through the app; failing instantly produced the
    // confusing "wallet_unavailable" error on sends.
    let w = pickEmbedded(walletsRef.current, userRef.current)
    if (!w) {
      const deadline = Date.now() + 10_000
      while (!w && Date.now() < deadline) {
        await new Promise<void>(r => setTimeout(r, 250))
        w = pickEmbedded(walletsRef.current, userRef.current)
      }
    }
    if (!w) return null
    try {
      await w.switchChain(monadTestnet.id)
    } catch { /* already on chain or unsupported — proceed */ }
    try {
      // Privy ConnectedWallet exposes a viem wallet client
      const fn = (w as unknown as { getWalletClient?: (chain?: number) => Promise<WalletClient> }).getWalletClient
      if (typeof fn === 'function') return await fn.call(w, monadTestnet.id)
    } catch { /* fall through to manual provider wrapper */ }
    try {
      const provider = await (w as unknown as { getEthereumProvider: () => Promise<unknown> }).getEthereumProvider()
      return createWalletClient({ chain: monadTestnet, transport: custom(provider as never) })
    } catch {
      return null
    }
  }, [pickEmbedded])

  // The smart account is the ONLY money account in the UI: all balances, activity
  // and transactions are scoped to it. The EOA stays purely a signer underneath.
  // The address is deterministic (same owner → same account forever), so it is
  // cached per EOA: every load after the first resolves synchronously, no RPC,
  // no EOA→smart flip. Cache key is versioned to the account stack (entrypoint
  // v0.6 SimpleAccount) — bump it if those ever change.
  const [smartAddress, setSmartAddress] = useState<string | null>(null)
  useEffect(() => {
    if (!address) {
      setSmartAddress(null)
      return
    }
    const eoa = address.toLowerCase()
    try {
      const cached = localStorage.getItem(`${SMART_CACHE_PREFIX}${eoa}`)
      if (cached && /^0x[a-fA-F0-9]{40}$/.test(cached)) {
        setSmartAddress(prev => (prev === cached ? prev : cached))
        return
      }
    } catch { /* storage blocked — fall through to derivation */ }
    let alive = true
    void (async () => {
      // Retry while the wallet list finishes loading: a single failed attempt
      // used to leave the gate spinning forever on a slow login.
      for (let attempt = 0; alive && attempt < 5; attempt++) {
        try {
          const wc = await getWalletClient()
          if (!alive) return
          if (wc) {
            const { getGaslessAddress } = await import('../lib/gasless')
            const sa = await getGaslessAddress(address as `0x${string}`, wc)
            if (!alive) return
            try { localStorage.setItem(`${SMART_CACHE_PREFIX}${eoa}`, sa) } catch { /* ignore */ }
            setSmartAddress(sa)
            return
          }
        } catch { /* transient — retry below */ }
        await new Promise<void>(r => setTimeout(r, 2500))
      }
    })()
    return () => { alive = false }
  }, [address, getWalletClient])

  /**
   * The account whose balances and activity the app shows: smart account only.
   * Null until known — money UI gates on this (skeleton) instead of ever
   * flashing EOA data. The EOA remains the signer for userOps, invisibly.
   */
  const moneyAddress = smartAddress

  return { ready, authenticated, address, smartAddress, moneyAddress, wallet: privyWallet ?? null, getWalletClient, getAccessToken, logout, user }
}

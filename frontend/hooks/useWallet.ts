import { useCallback, useEffect, useRef, useState } from 'react'
import { getEmbeddedConnectedWallet, usePrivy, useWallets } from '@privy-io/react-auth'
import { createWalletClient, custom, type WalletClient } from 'viem'
import { monadTestnet } from '../lib/chain'

const SMART_CACHE_PREFIX = 'fluxpay_smart:v1:'

// Last failure reason from getWalletClient — surfaced next to the send error so
// a broken wallet session is diagnosable without DevTools. Cleared on success.
let lastWalletDiag = ''
export function getWalletDiag() { return lastWalletDiag }

export function useWallet() {
  const { ready, authenticated, user, getAccessToken, logout } = usePrivy()
  const { wallets } = useWallets()

  // Live refs so getWalletClient can wait for the wallet to appear instead of
  // failing the instant it is asked too early (fresh login / slow page load).
  const walletsRef = useRef(wallets)
  const userRef = useRef(user)
  useEffect(() => { walletsRef.current = wallets }, [wallets])
  useEffect(() => { userRef.current = user }, [user])

  // The app never reads external wallets: identity is ALWAYS the embedded wallet.
  // Use the SDK's own helper when available, with a local filter as fallback.
  const pickEmbedded = useCallback((list: typeof wallets) => {
    if (typeof getEmbeddedConnectedWallet === 'function') return getEmbeddedConnectedWallet(list)
    const embedded = list.filter(w => {
      const t = (w as { walletClientType?: string }).walletClientType
      return !t || t === 'privy' || t === 'embedded'
    })
    return embedded[0] ?? null
  }, [])

  const privyWallet = pickEmbedded(wallets)

  const address = (privyWallet?.address ?? user?.wallet?.address ?? null) as string | null

  const getWalletClient = useCallback(async (): Promise<WalletClient | null> => {
    lastWalletDiag = ''
    // Wait up to 10s for the embedded wallet to show up. Right after login (or
    // on a fresh page load) the wallet list can still be empty while the user
    // is already tapping through the app; failing instantly produced the
    // confusing "wallet_unavailable" error on sends.
    let w = pickEmbedded(walletsRef.current)
    if (!w) {
      const deadline = Date.now() + 10_000
      while (!w && Date.now() < deadline) {
        await new Promise<void>(r => setTimeout(r, 250))
        w = pickEmbedded(walletsRef.current)
      }
    }
    if (!w) {
      const list = walletsRef.current
      const uw = userRef.current?.wallet as { walletClientType?: string } | undefined
      lastWalletDiag = `no-wallet list:${list.length} user:${uw ? (uw.walletClientType ?? '?') : 'none'}`
      console.warn('[wallet] no embedded wallet after wait', {
        wallets: list.map(x => ({ address: x.address, type: (x as { walletClientType?: string }).walletClientType })),
        userWallet: uw ?? null,
      })
      return null
    }
    try {
      await w.switchChain(monadTestnet.id)
    } catch (e) { console.warn('[wallet] switchChain failed', e) }
    try {
      // Privy ConnectedWallet exposes a viem wallet client
      const fn = (w as unknown as { getWalletClient?: (chain?: number) => Promise<WalletClient> }).getWalletClient
      if (typeof fn === 'function') return await fn.call(w, monadTestnet.id)
      console.warn('[wallet] getWalletClient is not a function on the connected wallet')
    } catch (e) {
      lastWalletDiag = 'client-failed'
      console.warn('[wallet] getWalletClient threw', e)
    }
    try {
      const provider = await (w as unknown as { getEthereumProvider: () => Promise<unknown> }).getEthereumProvider()
      return createWalletClient({ chain: monadTestnet, transport: custom(provider as never) })
    } catch (e) {
      lastWalletDiag = lastWalletDiag || 'provider-failed'
      console.warn('[wallet] getEthereumProvider threw', e)
    }
    return null
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

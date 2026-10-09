import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Wallet } from 'lucide-react'
import type { Address } from 'viem'
import { erc20Abi, explorerTx, monadTestnet, publicClient, tokenByAddressOrNative } from '@/lib/chain'
import { fetchLink, recordLinkPaid, type PaymentLinkDto } from '@/lib/api'
import { parseLinkUrl } from '@/lib/links'
import { shortAddr } from '@/lib/format'
import { useInjectedWallet } from '@/hooks/useInjectedWallet'

type Phase = 'loading' | 'ready' | 'paying' | 'done' | 'error'

export default function PayPage() {
  // The payer uses their own browser wallet — never the FluxPay smart account.
  const { address, chainId, connecting, connect, ensureChain, getWalletClient } = useInjectedWallet()
  const [link, setLink] = useState<PaymentLinkDto | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState('')

  const params = parseLinkUrl()

  useEffect(() => {
    if (!params) {
      setPhase('error')
      setError('This payment link is malformed — ask for a new one.')
      return
    }
    fetchLink(params.id)
      .then(l => {
        setLink(l)
        setPhase(l.status === 'pending' ? 'ready' : 'done')
      })
      .catch(() => {
        setPhase('error')
        setError('This payment link does not exist.')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const connectWallet = async () => {
    try {
      setError('')
      await connect()
    } catch (e) {
      const err = e as Error & { shortMessage?: string }
      setError(err.shortMessage || err.message || 'Could not connect wallet')
    }
  }

  const pay = async () => {
    if (!link) return
    try {
      setError('')
      // Single-use: re-check right before sending so an already-paid link can't be paid twice.
      const fresh = await fetchLink(link.id)
      setLink(fresh)
      if (fresh.status !== 'pending') {
        setPhase('done')
        return
      }

      const payer = address ?? (await connect())
      if (!payer) return
      await ensureChain()

      const token = tokenByAddressOrNative(fresh.token)
      if (!token) throw new Error('Unsupported token on this link')
      const amountRaw = BigInt(fresh.amount)
      const client = await getWalletClient()

      setPhase('paying')
      // Straight from the payer's wallet to the recipient — no FluxPay account involved.
      const hash = token.address
        ? await client.writeContract({
            account: payer,
            chain: monadTestnet,
            address: token.address,
            abi: erc20Abi,
            functionName: 'transfer',
            args: [fresh.creatorAddress as Address, amountRaw],
          })
        : await client.sendTransaction({
            account: payer,
            chain: monadTestnet,
            to: fresh.creatorAddress as Address,
            value: amountRaw,
          })

      setTxHash(hash)
      await publicClient.waitForTransactionReceipt({ hash })
      // Backend verifies the tx on-chain and flips the link pending→paid exactly once.
      const updated = await recordLinkPaid(fresh.id, { txHash: hash, payerAddress: payer })
      setLink(updated)
      setPhase('done')
    } catch (e) {
      setPhase('ready')
      const err = e as Error & { shortMessage?: string; status?: number }
      setError(err.shortMessage || err.message || 'Payment failed')
    }
  }

  const tokenMeta = link ? tokenByAddressOrNative(link.token) : null
  const decimals = tokenMeta?.decimals ?? 6
  const amountLabel = link ? (Number(BigInt(link.amount)) / 10 ** decimals).toLocaleString('en-US', { maximumFractionDigits: 6 }) : '—'
  const symbol = tokenMeta?.symbol ?? 'tokens'
  const paid = link?.status === 'paid'
  const wrongChain = address !== null && chainId !== null && chainId !== monadTestnet.id

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0E0E10', color: '#fff', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#17171A', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 28, textAlign: 'center' }}>
        <span style={{ fontSize: 12, letterSpacing: 2, color: '#D35A44', fontWeight: 700 }}>FLUXPAY</span>
        <p style={{ fontSize: 11, color: '#999', marginTop: 4 }}>Payment Request · Monad Testnet</p>

        <strong style={{ display: 'block', marginTop: 18, fontSize: 20 }}>{link?.title ?? 'Payment'}</strong>

        {phase === 'loading' && <p style={{ marginTop: 16, color: '#999' }}>Loading payment…</p>}

        {phase === 'error' && (
          <>
            <p style={{ marginTop: 16, color: '#ef4444', fontSize: 14 }}>{error}</p>
            <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 18, color: '#999', fontSize: 13 }}><ArrowLeft size={14} /> Go to FluxPay</Link>
          </>
        )}

        {(phase === 'ready' || phase === 'paying') && link && !paid && (
          <>
            <p style={{ margin: '10px 0 0', fontSize: 40, fontWeight: 800 }}>{amountLabel}<em style={{ fontSize: 14, color: '#999', marginLeft: 8, fontStyle: 'normal' }}>{symbol}</em></p>
            {link.description && <p style={{ color: '#999', fontSize: 13, marginTop: 6 }}>{link.description}</p>}

            {!address ? (
              <button
                onClick={connectWallet}
                disabled={connecting}
                style={{ marginTop: 20, width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', background: '#D35A44', color: '#fff', fontWeight: 700, cursor: connecting ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <Wallet size={15} /> {connecting ? 'Connecting…' : 'Connect Wallet'}
              </button>
            ) : (
              <button
                onClick={pay}
                disabled={phase !== 'ready'}
                style={{ marginTop: 20, width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', background: '#D35A44', color: '#fff', fontWeight: 700, cursor: phase === 'ready' ? 'pointer' : 'wait' }}
              >
                {phase === 'paying' ? 'Paying…' : `Pay ${amountLabel} ${symbol}`}
              </button>
            )}

            {address && (
              <p style={{ marginTop: 10, fontSize: 11, color: '#777' }}>
                Paying from <span style={{ color: '#bbb' }}>{shortAddr(address)}</span>
                {wrongChain && <span style={{ color: '#f59e0b' }}> · wrong network — you'll be asked to switch to Monad Testnet</span>}
              </p>
            )}
            {error && <p style={{ marginTop: 10, color: '#ef4444', fontSize: 12 }}>{error}</p>}
            <p style={{ marginTop: 16, fontSize: 11, color: '#666' }}>
              Paying sends {symbol} from your own wallet straight to the recipient. Links are single-use.
            </p>
          </>
        )}

        {phase === 'done' && link && (
          <>
            <p style={{ margin: '10px 0 0', fontSize: 36, fontWeight: 800, color: '#22c55e' }}>
              {paid ? 'Paid ✓' : 'Done ✓'}
            </p>
            <p style={{ color: '#999', fontSize: 13, marginTop: 6 }}>{amountLabel} {symbol}{paid ? ' received by the recipient.' : '.'}</p>
            {(txHash || link.txHash) && (
              <a href={explorerTx((txHash ?? link.txHash)!)} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, color: '#D35A44', fontSize: 13 }}>
                <ExternalLink size={14} /> View payment transaction
              </a>
            )}
            <Link to="/wallet" style={{ display: 'block', marginTop: 18, color: '#999', fontSize: 13 }}><ArrowLeft size={12} style={{ display: 'inline' }} /> Open FluxPay wallet</Link>
          </>
        )}
      </div>
    </main>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { formatUnits, getContract, type Address } from 'viem'
import { usePrivy } from '@privy-io/react-auth'
import { useWallet } from '@/hooks/useWallet'
import { QrCode } from '@/components/qr-code'
import { explorerTx, LINK_ESCROW_ADDRESS, linkEscrowAbi, monadTestnet, publicClient, tokenByAddress } from '@/lib/chain'
import { parseLinkUrl, signClaim } from '@/lib/links'

interface ChainLink {
  depositor: Address
  token: Address
  amount: bigint
  expiry: number
  claimed: boolean
  refunded: boolean
}

type Phase = 'loading' | 'ready' | 'signing' | 'claiming' | 'done' | 'error'

export default function PayPage() {
  const { login, authenticated, ready } = usePrivy()
  const { address, getWalletClient } = useWallet()
  const [link, setLink] = useState<ChainLink | null>(null)
  const [title, setTitle] = useState('Payment')
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
    setTitle(params.title)
    const escrow = getContract({ address: LINK_ESCROW_ADDRESS, abi: linkEscrowAbi, client: publicClient })
    escrow.read
      .links([params.id])
      .then(raw => {
        const [depositor, token, amount, expiry, , , claimed, refunded] = raw as readonly [Address, Address, bigint, number, Address, Address, boolean, boolean]
        if (depositor === '0x0000000000000000000000000000000000000000') {
          setPhase('error')
          setError('This payment link does not exist on-chain.')
          return
        }
        setLink({ depositor, token, amount, expiry, claimed, refunded })
        setPhase(claimed || refunded ? 'done' : 'ready')
      })
      .catch(() => {
        setPhase('error')
        setError('Could not read the escrow on-chain. Is the link valid for Monad testnet?')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pay = async () => {
    if (!params || !link || !address) return
    try {
      setError('')
      const walletClient = await getWalletClient()
      if (!walletClient) throw new Error('Wallet unavailable — log in first.')
      setPhase('signing')
      const sig = await signClaim(params.secret, params.id, address as Address)
      setPhase('claiming')
      const hash = await walletClient.writeContract({
        account: address as `0x${string}`,
        chain: monadTestnet,
        address: LINK_ESCROW_ADDRESS,
        abi: linkEscrowAbi,
        functionName: 'claim',
        args: [params.id, address as Address, sig],
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('claim_reverted')
      setTxHash(hash)
      setPhase('done')
    } catch (e) {
      setPhase('ready')
      const err = e as Error & { shortMessage?: string }
      const msg = err.shortMessage || err.message || 'Claim failed'
      setError(/insufficient funds/i.test(msg) ? 'Your wallet needs testnet MON for gas (faucet.monad.xyz).' : msg)
    }
  }

  const tokenMeta = link ? tokenByAddress(link.token) : null
  const decimals = tokenMeta?.decimals ?? 6
  const amountLabel = link ? Number(formatUnits(link.amount, decimals)).toLocaleString('en-US', { maximumFractionDigits: 6 }) : '—'
  const symbol = tokenMeta?.symbol ?? 'tokens'
  const expired = link && link.expiry !== 0 && link.expiry < 2 ** 40 - 1 && link.expiry * 1000 < Date.now()

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0E0E10', color: '#fff', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#17171A', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 28, textAlign: 'center' }}>
        <span style={{ fontSize: 12, letterSpacing: 2, color: '#D35A44', fontWeight: 700 }}>FLUXPAY</span>
        <p style={{ fontSize: 11, color: '#999', marginTop: 4 }}>Payment Request · Monad Testnet</p>

        <strong style={{ display: 'block', marginTop: 18, fontSize: 20 }}>{title}</strong>

        {phase === 'loading' && <p style={{ marginTop: 16, color: '#999' }}>Reading escrow…</p>}

        {phase === 'error' && (
          <>
            <p style={{ marginTop: 16, color: '#ef4444', fontSize: 14 }}>{error}</p>
            <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 18, color: '#999', fontSize: 13 }}><ArrowLeft size={14} /> Go to FluxPay</Link>
          </>
        )}

        {(phase === 'ready' || phase === 'signing' || phase === 'claiming') && link && (
          <>
            <p style={{ margin: '10px 0 0', fontSize: 40, fontWeight: 800 }}>{amountLabel}<em style={{ fontSize: 14, color: '#999', marginLeft: 8, fontStyle: 'normal' }}>{symbol}</em></p>
            {expired && <p style={{ color: '#f59e0b', fontSize: 13, marginTop: 8 }}>This link has expired — funds can only be refunded to the sender.</p>}
            {link.refunded && <p style={{ color: '#f59e0b', fontSize: 13, marginTop: 8 }}>This link was refunded to the sender.</p>}

            {!authenticated && (
              <button
                onClick={() => login()}
                disabled={!ready}
                style={{ marginTop: 20, width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', background: '#D35A44', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                Log in to claim
              </button>
            )}

            {authenticated && !expired && !link.refunded && (
              <button
                onClick={pay}
                disabled={phase !== 'ready'}
                style={{ marginTop: 20, width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', background: '#D35A44', color: '#fff', fontWeight: 700, cursor: phase === 'ready' ? 'pointer' : 'wait' }}
              >
                {phase === 'signing' ? 'Signing claim…' : phase === 'claiming' ? 'Claiming on-chain…' : `Claim ${amountLabel} ${symbol}`}
              </button>
            )}

            {address && (
              <p style={{ marginTop: 12, fontSize: 11, fontFamily: 'monospace', color: '#999', wordBreak: 'break-all' }}>
                Funds will land in {address}
              </p>
            )}
            {error && <p style={{ marginTop: 10, color: '#ef4444', fontSize: 12 }}>{error}</p>}
            <p style={{ marginTop: 16, fontSize: 11, color: '#666' }}>
              Claim is authorized by an EIP-712 signature from the link's embedded secret — only someone holding this URL can withdraw.
            </p>
          </>
        )}

        {phase === 'done' && link && (
          <>
            <p style={{ margin: '10px 0 0', fontSize: 36, fontWeight: 800, color: '#22c55e' }}>
              {link.claimed ? 'Claimed' : link.refunded ? 'Refunded' : 'Done'} ✓
            </p>
            <p style={{ color: '#999', fontSize: 13, marginTop: 6 }}>{amountLabel} {symbol}{link.claimed ? ' are now in your wallet.' : ' were returned to the sender.'}</p>
            {txHash && (
              <a href={explorerTx(txHash)} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, color: '#D35A44', fontSize: 13 }}>
                <ExternalLink size={14} /> View claim transaction
              </a>
            )}
            <Link to="/wallet" style={{ display: 'block', marginTop: 18, color: '#999', fontSize: 13 }}><ArrowLeft size={12} style={{ display: 'inline' }} /> Open FluxPay wallet</Link>
          </>
        )}
      </div>
    </main>
  )
}

// referenced by QR share on the claim page when available
export function PayQr({ value }: { value: string }) {
  return <QrCode value={value} />
}

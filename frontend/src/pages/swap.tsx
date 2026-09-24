import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ExternalLink } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { Dropdown } from '@/components/dropdown'
import { useWallet } from '@/hooks/useWallet'
import {
  executeSwap, fetchKuruBalance, getKuruSigner, KURU_TOKENS, kuruProvider, kuruTokenBySymbol, quoteSwap,
  type KuruToken,
} from '@/lib/kuru'
import { EXPLORER_URL } from '@/lib/chain'

type Phase = 'idle' | 'quoting' | 'approving' | 'swapping' | 'success' | 'error'

interface Quote {
  output: number
  priceImpact: number
  hops: number
  route: string[]
}

export default function SwapPage() {
  const { wallet, address } = useWallet()
  const [fromSym, setFromSym] = useState('MON')
  const [toSym, setToSym] = useState('USDC')
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState(1)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [phase, setPhase] = useState<Phase>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState<string | null>(null)
  const quoteFor = useRef('')

  const from = kuruTokenBySymbol(fromSym)!
  const to = kuruTokenBySymbol(toSym)!
  const amt = parseFloat(amount) || 0

  useEffect(() => {
    if (!address) return
    let alive = true
    void (async () => {
      const entries = await Promise.all(
        KURU_TOKENS.map(async t => [t.symbol, await fetchKuruBalance(kuruProvider, t, address).catch(() => 0)] as const),
      )
      if (alive) setBalances(Object.fromEntries(entries))
    })()
    return () => { alive = false }
  }, [address, txHash])

  useEffect(() => {
    const key = `${fromSym}-${toSym}-${amount}`
    if (!amt || amt <= 0 || fromSym === toSym) { setQuote(null); quoteFor.current = ''; return }
    if (quoteFor.current === key) return
    quoteFor.current = key
    setPhase('quoting')
    setQuote(null)
    const timer = setTimeout(async () => {
      try {
        const route = await quoteSwap(from.address, to.address, amt)
        if (route.route.path.length === 0 || route.output <= 0) {
          setQuote(null)
          setError(`No liquidity on Kuru for ${fromSym} → ${toSym} right now. Try another pair.`)
          setPhase('idle')
          return
        }
        setQuote({
          output: route.output,
          priceImpact: route.priceImpact,
          hops: route.route.path.length,
          route: route.route.path.map(p => `${p.baseToken.slice(0, 6)}…/${p.quoteToken.slice(0, 6)}…`),
        })
        setError('')
        setPhase('idle')
      } catch (e) {
        setQuote(null)
        setError((e as Error).message || 'Quote failed — is the Kuru API reachable?')
        setPhase('idle')
      }
    }, 600)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromSym, toSym, amount])

  const minReceived = useMemo(() => (quote ? quote.output * (1 - slippage / 100) : 0), [quote, slippage])

  const swap = async () => {
    setError('')
    if (!wallet || !address) return setError('Wallet not ready — log in first.')
    if (!quote) return setError('No valid quote — adjust the amount.')
    try {
      setPhase('approving')
      setStatusMsg('Checking token approval…')
      const ethereumProvider = await (wallet as unknown as { getEthereumProvider: () => Promise<unknown> }).getEthereumProvider()
      const signer = await getKuruSigner(ethereumProvider)
      setPhase('swapping')
      setStatusMsg('Swapping on Kuru…')
      const receipt = await executeSwap({
        signer,
        routeOutput: await quoteSwap(from.address, to.address, amt),
        size: amt,
        tokenInDecimals: from.decimals,
        tokenOutDecimals: to.decimals,
        slippagePct: slippage,
        onApprove: hash => { if (hash) setStatusMsg('Approval sent — continuing after confirmation…') },
      })
      setTxHash(receipt.transactionHash)
      setPhase('success')
      setStatusMsg('')
      quoteFor.current = ''
    } catch (e) {
      const err = e as Error & { shortMessage?: string }
      setError(err.shortMessage || err.message || 'Swap failed')
      setPhase('error')
      setStatusMsg('')
    }
  }

  const canSwap = amt > 0 && !!quote && phase !== 'swapping' && phase !== 'approving' && amt <= (balances[fromSym] ?? 0)

  const tokenOptions = KURU_TOKENS.map(t => ({ value: t.symbol, label: `${t.symbol} — ${t.name}` }))

  const tokenRow = (t: KuruToken, label: string, sym: string, onSym: (s: string) => void, disabled?: string) => (
    <div className="sn-field">
      <label>{label}</label>
      <Dropdown value={sym} options={tokenOptions.filter(o => o.value !== disabled)} onChange={onSym} />
      <p className="sn-hint">
        Balance: {(balances[t.symbol] ?? 0).toLocaleString('en-US', { maximumFractionDigits: 6 })} {t.symbol}
        {t.symbol !== 'MON' && fromSym !== 'MON' && ` · ${t.address.slice(0, 6)}…${t.address.slice(-4)}`}
      </p>
    </div>
  )

  return <DashboardShell>
    <section className="dashboard-content sn">
      <div className="sn-head">
        <h1>Swap</h1>
      </div>

      <div className="sn-form-wrap">
        <div className="sn-panel">
          <h3>Swap on Kuru</h3>
          <p className="sn-hint" style={{ marginBottom: 12 }}>Routed through Kuru Flow — Monad's on-chain orderbook aggregator. Live quotes, real settlement.</p>
          {tokenRow(from, 'From', fromSym, s => { setFromSym(s); if (s === toSym) setToSym(fromSym) })}
          {tokenRow(to, 'To', toSym, s => { setToSym(s); if (s === fromSym) setFromSym(toSym) }, toSym === fromSym ? undefined : fromSym)}
          <div className="sn-field">
            <label>Amount</label>
            <div className="sn-input-row">
              <input placeholder={`0.00 ${from.symbol}`} value={amount} inputMode="decimal" onChange={e => setAmount(e.target.value)} />
              <button className="sn-inline" onClick={() => setAmount(String(balances[fromSym] ?? 0))}>Max</button>
            </div>
            <p className="sn-hint">Slippage tolerance:
              {[0.5, 1, 3].map(s => (
                <button key={s} className="sn-inline" style={{ marginLeft: 6, opacity: slippage === s ? 1 : 0.6 }} onClick={() => setSlippage(s)}>{s}%</button>
              ))}
            </p>
          </div>
        </div>

        <div className="sn-panel sn-panel-pay">
          <h3>Quote</h3>
          {phase === 'quoting' && <p className="sn-hint">Finding the best route on Kuru…</p>}
          {quote && (
            <div className="sn-summary">
              <div className="sn-sum-row"><span>You receive (est.)</span><strong>{quote.output.toLocaleString('en-US', { maximumFractionDigits: 6 })} {to.symbol}</strong></div>
              <div className="sn-sum-row"><span>Minimum received</span><strong>{minReceived.toLocaleString('en-US', { maximumFractionDigits: 6 })} {to.symbol}</strong></div>
              <div className="sn-sum-row"><span>Price impact</span><strong className={quote.priceImpact > 2 ? '' : 'up'}>{quote.priceImpact.toFixed(2)}%</strong></div>
              <div className="sn-sum-row"><span>Route hops</span><strong>{quote.hops}</strong></div>
            </div>
          )}
          {error && <p style={{ color: '#ef4444', fontSize: 13, marginTop: 10 }}>{error}</p>}
          {statusMsg && <p className="sn-hint" style={{ marginTop: 10 }}>{statusMsg}</p>}

          {phase === 'success' && txHash ? (
            <div className="sn-step sn-success">
              <h2>Swapped</h2>
              <p className="sn-success-sub">{amt.toLocaleString('en-US', { maximumFractionDigits: 6 })} {from.symbol} → {to.symbol} confirmed on Kuru.</p>
              <div className="sn-actions">
                <a className="ov-btn primary" href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noreferrer"><ExternalLink size={14} /> View Transaction</a>
              </div>
            </div>
          ) : (
            <>
              <div className="sn-fee-row"><span>DEX</span><strong>Kuru Flow (orderbook)</strong></div>
              <button className="ov-btn primary" style={{ width: '100%', marginTop: 12 }} onClick={swap} disabled={!canSwap}>
                {phase === 'approving' ? 'Approving…' : phase === 'swapping' ? 'Swapping…' : amt <= (balances[fromSym] ?? 0) ? 'Swap' : `Insufficient ${from.symbol}`}
              </button>
            </>
          )}
        </div>
      </div>

      <p className="sn-hint sn-hint-center" style={{ marginTop: 14 }}>
        Balances refresh after each swap · quotes are live from Kuru's orderbook.
      </p>
    </section>
  </DashboardShell>
}

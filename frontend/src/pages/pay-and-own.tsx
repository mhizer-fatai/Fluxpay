import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Percent, TrendingUp, Wallet } from 'lucide-react'
import type { Address } from 'viem'
import { DashboardShell } from '@/components/dashboard-shell'
import { SmartWalletGate } from '@/components/guard'
import { useWallet } from '@/hooks/useWallet'
import { useBalances } from '@/hooks/useBalances'
import { sendGasless } from '@/lib/gasless'
import { EARN_VAULT_ADDRESS, TOKENS } from '@/lib/chain'
import {
  apyPercent,
  buildDepositCalls,
  buildWithdrawCalls,
  projectedAssets,
  readEarnPosition,
  type EarnPosition,
} from '@/lib/earn'
import { money, shortAddr } from '@/lib/format'

export default function PayAndOwnPage() {
  return <SmartWalletGate><EarnContent /></SmartWalletGate>
}

/** Shows enough decimals (up to 6) that per-second accrual is visible. */
const fmt6 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })

function EarnContent() {
  // Reads use the smart account; the EOA is the signer for userOps.
  const { address: ownerAddress, smartAddress, getWalletClient } = useWallet()
  const account = smartAddress as string
  const { rows } = useBalances(smartAddress)

  const [position, setPosition] = useState<EarnPosition | null>(null)
  const [reading, setReading] = useState(false)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)

  const usdc = TOKENS.find(t => t.key === 'USDC')!
  const decimals = usdc.decimals
  const usdcBalance = rows.find(r => r.key === 'USDC')?.amount ?? 0

  const load = useCallback(async () => {
    if (!account) return
    setReading(true)
    try {
      setPosition(await readEarnPosition(account as Address))
    } catch {
      setPosition(null)
    } finally {
      setReading(false)
    }
  }, [account])

  useEffect(() => { void load() }, [load])

  // One-second heartbeat so the position value counts up live.
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Timestamp of the last on-chain read, used as the projection baseline.
  const readAtRef = useRef(Date.now())
  useEffect(() => { readAtRef.current = Date.now() }, [position])

  const value = useMemo(() => {
    if (!position) return { live: 0, par: 0, earnings: 0, shares: 0, sharePrice: 1, tvl: 0, apy: 0, perDay: 0 }
    const elapsed = (Date.now() - readAtRef.current) / 1000
    const live = projectedAssets(position, elapsed) / 10 ** decimals
    // Shares mint at 1:1 with the asset on the first deposit, so the share count is a
    // good cost-basis proxy for this account's deposits.
    const par = Number(position.shares) / 10 ** decimals
    const tvl = Number(position.totalAssets) / 10 ** decimals
    const sharePrice = position.totalSupply > 0n
      ? Number(position.totalAssets) / Number(position.totalSupply)
      : 1
    // Yield on this account's shares, per day, in asset units.
    const perDay = (Number(position.shares) * Number(position.ratePerSecondX18) * 86_400) / 1e18 / 10 ** decimals
    return {
      live,
      par,
      earnings: Math.max(0, live - par),
      shares: par,
      sharePrice,
      tvl,
      apy: apyPercent(position.ratePerSecondX18),
      perDay,
    }
    // tick is intentional: recompute every second so the number moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, tick, decimals])

  const submit = async (calls: Parameters<typeof sendGasless>[0]['calls'], statusMsg: string) => {
    if (!account) throw new Error('Wallet not ready')
    if (!ownerAddress) throw new Error('Wallet not ready')
    const walletClient = await getWalletClient()
    if (!walletClient) throw new Error('wallet_unavailable')
    setBusy(statusMsg)
    const result = await sendGasless({
      walletClient,
      ownerAddress: ownerAddress as `0x${string}`,
      calls,
      onStatus: s => {
        if (s === 'signing') setBusy('Confirm in your wallet…')
        else if (s === 'submitted') setBusy('Submitted — waiting for confirmation on Monad…')
        else setBusy('Confirming on Monad…')
      },
      onUserOpHash: h => setBusy(`Submitted (${h.slice(0, 12)}…) — waiting for confirmation on Monad…`),
    })
    return result.txHash
  }

  const handleError = (e: unknown, fallback: string) => {
    const err = e as Error & { shortMessage?: string }
    const msg = err.shortMessage || err.message || fallback
    if (/Timed out while waiting|Still waiting on confirmation/i.test(msg)) {
      setNotice('Submitted — still confirming on Monad. Refresh in a moment.')
      void load()
    } else {
      setError(msg)
    }
  }

  const deposit = async () => {
    setError(''); setNotice('')
    const amt = parseFloat(amount) || 0
    if (!(amt > 0)) return setError('Enter an amount to deposit')
    if (amt > usdcBalance) return setError('Amount exceeds your USDC balance')
    try {
      const raw = BigInt(Math.round(amt * 10 ** decimals))
      await submit(
        buildDepositCalls({ asset: usdc.address!, amountRaw: raw, receiver: account as Address }),
        'Depositing…',
      )
      setAmount('')
      setNotice('Deposited')
      void load()
    } catch (e) {
      handleError(e, 'Deposit failed')
    } finally {
      setBusy('')
    }
  }

  const withdrawAll = async () => {
    setError(''); setNotice('')
    if (!position || position.shares === 0n) return setError('Nothing deposited yet')
    try {
      await submit(buildWithdrawCalls({ shares: position.shares, receiver: account as Address }), 'Withdrawing…')
      setNotice('Withdrawn')
      void load()
    } catch (e) {
      handleError(e, 'Withdrawal failed')
    } finally {
      setBusy('')
    }
  }

  return <DashboardShell>
    <section className="dashboard-content po">
      <div className="po-head">
        <div>
          <h1>Earn</h1>
          <p className="po-support">Put idle USDC to work in the FluxPay Earn vault. Your balance accrues every second and you can withdraw anytime.</p>
        </div>
        <div className="po-head-actions">
          <div className="po-status">
            <span>Vault</span>
            <em><i /> {value.tvl > 0 ? 'Earning' : 'Ready'}</em>
          </div>
        </div>
      </div>

      <div className="po-metrics">
        <div className="ov-stat"><span className="ov-stat-icon"><Wallet size={16} /></span><small>Your balance</small><strong>{fmt6(value.live)} USDC</strong><em>accruing live</em></div>
        <div className="ov-stat"><span className="ov-stat-icon"><TrendingUp size={16} /></span><small>Earnings</small><strong>{fmt6(value.earnings)} USDC</strong><em>on your deposit</em></div>
        <div className="ov-stat"><span className="ov-stat-icon"><Percent size={16} /></span><small>APY</small><strong>{value.apy.toFixed(2)}%</strong><em>{value.perDay > 0 ? `+${fmt6(value.perDay)} USDC/day` : 'current rate'}</em></div>
        <div className="ov-stat"><small>Vault TVL</small><strong>{money(value.tvl)}</strong><em>total deposited</em></div>
      </div>

      <div className="po-card">
        <div className="po-section-head">
          <div>
            <h2>Deposit</h2>
            <p>Available: {usdcBalance.toLocaleString('en-US', { maximumFractionDigits: 6 })} USDC</p>
          </div>
        </div>
        <div className="po-settings">
          <div className="po-setting">
            <div><strong>Amount</strong><small>USDC to deposit into the vault</small></div>
            <input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              style={{ width: 120, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '6px 10px', color: 'inherit' }}
            />
          </div>
        </div>
        {busy && <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>{busy}</p>}
        {notice && !error && <p style={{ fontSize: 12, color: '#16a34a', margin: '4px 0 0' }}>{notice}</p>}
        {error && <p style={{ fontSize: 12, color: '#ef4444', margin: '4px 0 0' }}>{error}</p>}
        <div className="sn-actions" style={{ marginTop: 12 }}>
          <button className="ov-btn primary" onClick={deposit} disabled={!!busy}>{busy ? 'Working…' : 'Deposit'}</button>
          <button className="ov-btn" onClick={withdrawAll} disabled={!!busy || value.shares === 0}>
            {position && position.shares > 0n ? 'Withdraw all' : 'Nothing to withdraw'}
          </button>
        </div>
      </div>

      <div className="po-card">
        <div className="po-section-head">
          <div>
            <h2>Position</h2>
            <p>{position && position.shares > 0n ? 'Your vault shares and what they are worth' : 'No deposit yet — your position appears here'}</p>
          </div>
        </div>
        <div className="po-settings">
          <div className="po-setting">
            <div><strong>Vault</strong><small>{EARN_VAULT_ADDRESS ? shortAddr(EARN_VAULT_ADDRESS) : 'not configured'}</small></div>
            <span className="po-value">fpUSDC</span>
          </div>
          <div className="po-setting">
            <div><strong>Vault shares</strong><small>ERC-4626 shares held by your account</small></div>
            <span className="po-value">{value.shares.toLocaleString('en-US', { maximumFractionDigits: 6 })}</span>
          </div>
          <div className="po-setting">
            <div><strong>Share price</strong><small>Rises as the strategy earns</small></div>
            <span className="po-value">{value.sharePrice.toFixed(6)} USDC</span>
          </div>
          <div className="po-setting">
            <div><strong>Yield source</strong><small>Swappable strategy — simulated on testnet, Curvance/Aave/Morpho on mainnet</small></div>
            <span className="po-value">{reading ? 'Reading…' : 'Testnet mock'}</span>
          </div>
        </div>
      </div>
    </section>
  </DashboardShell>
}

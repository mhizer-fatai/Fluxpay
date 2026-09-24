import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ExternalLink } from 'lucide-react'
import type { Address } from 'viem'
import { DashboardShell } from '@/components/dashboard-shell'
import { useProfile } from '@/hooks/profile'
import { useBalances } from '@/hooks/useBalances'
import { useWallet } from '@/hooks/useWallet'
import { sendFunds } from '@/lib/transfers'
import { getUsdPrices, TOKENS, tokenByKey, type TokenKey } from '@/lib/chain'
import { resolveUsernameApi } from '@/lib/api'
import { money, shortAddr } from '@/lib/format'
import { EXPLORER_URL } from '@/lib/chain'

interface Line { kind: 'cmd' | 'out' | 'err'; text: string; txHash?: string }
interface HistoryRow { command: string; action: string; status: string; txHash?: string }

const HELP = `Available commands:
  balance                       — show your live token balances
  price <TOKEN>                 — USD price (e.g. price MON)
  resolve <@name|name>          — resolve a FluxPay username
  send <amount> <TOKEN> to <@name|0x…> — prepare a payment (reply 'confirm' to execute)
  confirm                       — execute the prepared payment
  help                          — this message`

export default function TerminalPage() {
  const { address } = useProfile()
  const { getWalletClient } = useWallet()
  const { rows, refresh } = useBalances(address)
  const [input, setInput] = useState('')
  const [lines, setLines] = useState<Line[]>([
    { kind: 'out', text: 'FluxPay Terminal — connected to Monad testnet. Type "help" for commands.' },
  ])
  const [history, setHistory] = useState<HistoryRow[]>([])
  const pending = useRef<null | { amount: number; token: TokenKey; to: string }>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines])

  const push = (l: Line) => setLines(prev => [...prev, l])

  const handle = async (raw: string) => {
    const cmd = raw.trim()
    if (!cmd) return
    push({ kind: 'cmd', text: cmd })
    const [head, ...rest] = cmd.split(/\s+/)
    const arg = rest.join(' ')

    const done = (action: string, txHash?: string) =>
      setHistory(prev => [{ command: cmd, action, status: txHash ? 'Confirmed' : 'Done', txHash }, ...prev].slice(0, 8))

    try {
      if (head === 'help') { push({ kind: 'out', text: HELP }); done('Help'); return }

      if (head === 'balance' || head === 'balances') {
        const prices = await getUsdPrices()
        const total = rows.reduce((s, r) => s + r.usd, 0)
        const text = rows.map(r => `${r.key.padEnd(6)} ${r.amount.toLocaleString('en-US', { maximumFractionDigits: 6 }).padStart(14)}  ${money(r.usd)}`).join('\n')
        push({ kind: 'out', text: `${text}\nTOTAL            ${money(total)}` })
        done('Balances')
        return
      }

      if (head === 'price') {
        const key = (arg.split(/\s+/)[0] ?? '').toUpperCase() as TokenKey
        if (!TOKENS.some(t => t.key === key)) { push({ kind: 'err', text: `Unknown token "${arg}". Try: ${TOKENS.map(t => t.key).join(', ')}` }); return }
        const prices = await getUsdPrices()
        push({ kind: 'out', text: `${key} ≈ ${money(prices[key] ?? 0)}` })
        done('Price')
        return
      }

      if (head === 'resolve') {
        const name = arg.replace(/^@/, '').trim()
        try {
          const r = await resolveUsernameApi(name)
          push({ kind: 'out', text: `@${r.username} → ${r.address}` })
          done('Resolve')
        } catch {
          push({ kind: 'err', text: `@${name} is not registered` })
        }
        return
      }

      if (head === 'send') {
        const m = arg.match(/^([\d.]+)\s+([a-zA-Z]+)\s+to\s+(@?[a-zA-Z0-9_]{3,}|0x[a-fA-F0-9]{40})$/)
        if (!m) { push({ kind: 'err', text: 'Usage: send <amount> <TOKEN> to <@name|0x…>' }); return }
        const amount = Number(m[1])
        const tokenKey = m[2].toUpperCase() as TokenKey
        if (!TOKENS.some(t => t.key === tokenKey)) { push({ kind: 'err', text: `Unknown token ${m[2]}` }); return }
        let to = m[3]
        if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
          try { to = (await resolveUsernameApi(to.replace(/^@/, ''))).address } catch { push({ kind: 'err', text: `Recipient ${m[3]} is not a valid address or registered username` }); return }
        }
        pending.current = { amount, token: tokenKey, to }
        push({ kind: 'out', text: `Ready: send ${amount} ${tokenKey} to ${shortAddr(to)}\nType "confirm" to execute (this spends gas).` })
        done('Prepared')
        return
      }

      if (head === 'confirm') {
        if (!pending.current) { push({ kind: 'err', text: 'Nothing to confirm — use "send …" first' }); return }
        if (!address) { push({ kind: 'err', text: 'Wallet not ready' }); return }
        const { amount, token: tokenKey, to } = pending.current
        const walletClient = await getWalletClient()
        if (!walletClient) { push({ kind: 'err', text: 'Wallet client unavailable' }); return }
        push({ kind: 'out', text: 'Executing… approve (if needed) + settle.' })
        const result = await sendFunds({
          walletClient, from: address as Address, token: tokenByKey(tokenKey), amountHuman: amount, to: to as Address,
        })
        push({ kind: 'out', text: `Confirmed. tx: ${result.txHash}`, txHash: result.txHash })
        done('Transfer', result.txHash)
        pending.current = null
        void refresh()
        return
      }

      push({ kind: 'err', text: `Unknown command "${head}". Type "help".` })
    } catch (e) {
      const err = e as Error & { shortMessage?: string }
      push({ kind: 'err', text: err.shortMessage || err.message || 'Command failed' })
    }
  }

  const submit = () => {
    const cmd = input
    setInput('')
    void handle(cmd)
  }

  return <DashboardShell>
    <section className="dashboard-content at">
      <div className="at-head">
        <h1>AI Terminal</h1>
        <p className="at-sub">Real actions in plain commands — balances, prices, username resolution, and on-chain payments.</p>
      </div>

      <div className="at-hero">
        <h2>What would you like to do?</h2>
        <div className="at-inputbox">
          <textarea rows={2} placeholder='Try: balance · price MON · resolve @alice · send 5 USDC to @bob' value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }} />
          <div className="at-input-actions">
            <button className="ov-btn primary" onClick={submit} disabled={!input.trim()}>Run <ArrowRight size={14} /></button>
          </div>
        </div>
        <div className="at-suggest">
          {['balance', 'price MON', 'help'].map(s => <button className="at-suggest-chip" key={s} onClick={() => setInput(s)}>{s}</button>)}
        </div>
      </div>

      <div className="at-card">
        <div className="at-section-head"><h2>Terminal</h2></div>
        <div ref={scrollRef} style={{ maxHeight: 320, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12.5, lineHeight: 1.7, padding: '4px 6px' }}>
          {lines.map((l, i) => (
            <div key={i} style={{ whiteSpace: 'pre-wrap', color: l.kind === 'err' ? '#ef4444' : l.kind === 'cmd' ? '#D35A44' : 'inherit' }}>
              {l.kind === 'cmd' ? `> ${l.text}` : l.text}
              {l.txHash && (
                <a href={`${EXPLORER_URL}/tx/${l.txHash}`} target="_blank" rel="noreferrer" style={{ marginLeft: 8, color: '#D35A44', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  explorer <ExternalLink size={11} />
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="at-card">
        <div className="at-section-head"><h2>Recent Commands</h2></div>
        <div className="at-table">
          <div className="at-tr at-th"><span>Command</span><span>Action</span><span>Status</span></div>
          {history.length === 0 && <div className="at-tr"><span className="at-strong">—</span><span>Run a command to see history</span><span /></div>}
          {history.map((a, i) => (
            <div className="at-tr" key={i}>
              <span className="at-strong">{a.command}</span>
              <span>{a.action}</span>
              <span className="at-status">{a.status}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  </DashboardShell>
}

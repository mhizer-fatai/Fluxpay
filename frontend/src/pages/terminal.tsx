import { useState } from 'react'
import { ArrowRight, Mic, Paperclip } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'

const suggestions = [
  'Send 50 USDC to 0x6hbf...',
  'Swap 100 MON for USDC',
  'Invest 5% of my Spotify payment',
  'How is my portfolio performing?',
  'Create a $200 payment link',
]

const terminalActivity = [
  { command: 'Send $50 USDC', action: 'Transfer', status: 'Completed' },
  { command: 'Swap 100 MON', action: 'Swap', status: 'Completed' },
  { command: 'Create $200 payment link', action: 'Payment Link', status: 'Created' },
  { command: 'Invest 5% of Spotify', action: 'Investment', status: 'Completed' },
]

export default function TerminalPage() {
  const [input, setInput] = useState('')

  return <DashboardShell>
    <section className="dashboard-content at">
      <div className="at-head">
        <h1>AI Terminal</h1>
        <p className="at-sub">Your financial actions, in plain language.</p>
      </div>

      <div className="at-hero">
        <h2>What would you like to do?</h2>
        <div className="at-inputbox">
          <textarea rows={2} placeholder="Ask FluxPay anything..." value={input} onChange={e => setInput(e.target.value)} />
          <div className="at-input-actions">
            <button className="at-icon-btn" aria-label="Attach"><Paperclip size={16} /></button>
            <button className="at-icon-btn" aria-label="Voice"><Mic size={16} /></button>
            <button className="ov-btn primary">Send <ArrowRight size={14} /></button>
          </div>
        </div>
        <div className="at-suggest">
          {suggestions.map(s => <button className="at-suggest-chip" key={s} onClick={() => setInput(s)}>{s}</button>)}
        </div>
      </div>

      <div className="at-card">
        <div className="at-section-head"><h2>Recent Activity</h2></div>
        <div className="at-table">
          <div className="at-tr at-th"><span>Command</span><span>Action</span><span>Status</span></div>
          {terminalActivity.map(a => (
            <div className="at-tr" key={a.command}>
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

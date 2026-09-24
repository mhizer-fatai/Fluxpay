import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronDown, ExternalLink, Paperclip, Search, X } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard-shell'
import { publicClient, explorerTx } from '@/lib/chain'

interface TxStatus {
  hash: string
  status: 'success' | 'reverted' | 'not_found'
  block?: bigint
  timestamp?: number
  gasUsed?: string
}

const quickHelp = [
  { title: 'Getting Started', desc: 'Learn how FluxPay works and set up your account.', cta: 'View Guide' },
  { title: 'Payments', desc: 'Get help with sending, receiving, swapping, and payment links.', cta: 'View Guide' },
  { title: 'Pay & Own', desc: 'Learn how everyday spending becomes automatic investments.', cta: 'Learn More' },
  { title: 'Wallet', desc: 'Manage your wallet, assets, and transactions.', cta: 'View Guide' },
  { title: 'Investments', desc: 'Understand your portfolio, investments, and ownership.', cta: 'Learn More' },
  { title: 'Account & Security', desc: 'Manage recovery, connected wallets, and account security.', cta: 'View Guide' },
]

const faqs = [
  { q: 'What is FluxPay?', a: 'FluxPay connects everyday payments with automated investing, allowing eligible spending to contribute toward assets you can own.' },
  { q: 'How does Pay & Own work?', a: 'Pay & Own automatically invests a configured percentage of eligible payments into your selected investment assets.' },
  { q: 'Where are my investments stored?', a: 'Your investments are held as tokenized assets in your FluxPay wallet on Monad and appear in your Portfolio.' },
  { q: 'Can I change my investment percentage?', a: 'Yes. You can adjust your investment preferences from Pay & Own or your Settings.' },
  { q: 'Can I pause a subscription?', a: "Yes. Pausing a subscription stops future automated investment activity while preserving investments you've already made." },
  { q: 'How do I send USDC?', a: 'Open Wallet → Send, select USDC, enter the recipient address and amount, then review and confirm the transaction.' },
  { q: 'What happens if I lose access to my wallet?', a: 'Your configured recovery methods can help you regain access to your FluxPay account.' },
  { q: 'How do I create a Payment Link?', a: 'Open Wallet → Payment Link, enter the payment details, review the request, and generate your link.' },
]

const resources = ['Documentation', 'FAQ', 'Security', 'Terms of Service', 'Privacy Policy', 'Community', 'Contact Support']

export default function HelpPage() {
  const [search, setSearch] = useState('')
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [reportOpen, setReportOpen] = useState(false)
  const [txOpen, setTxOpen] = useState(false)
  const [txHashInput, setTxHashInput] = useState('')
  const [txStatus, setTxStatus] = useState<TxStatus | null>(null)
  const [txChecking, setTxChecking] = useState(false)
  const [txError, setTxError] = useState('')

  const checkTx = async () => {
    setTxError('')
    setTxStatus(null)
    const hash = txHashInput.trim()
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      setTxError('Enter a full 64-hex transaction hash (0x…)')
      return
    }
    setTxChecking(true)
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: hash as `0x${string}` })
      const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber })
      setTxStatus({
        hash,
        status: receipt.status === 'success' ? 'success' : 'reverted',
        block: receipt.blockNumber,
        timestamp: Number(block.timestamp),
        gasUsed: receipt.gasUsed.toString(),
      })
    } catch {
      setTxStatus({ hash, status: 'not_found' })
    } finally {
      setTxChecking(false)
    }
  }

  const q = search.trim().toLowerCase()
  const filteredQuick = q ? quickHelp.filter(c => `${c.title} ${c.desc}`.toLowerCase().includes(q)) : quickHelp
  const filteredFaqs = q ? faqs.filter(f => `${f.q} ${f.a}`.toLowerCase().includes(q)) : faqs

  return <DashboardShell>
    <section className="dashboard-content hp">
      <div className="hp-head">
        <h1>Help &amp; Support</h1>
        <p className="hp-support">Find answers, troubleshoot an issue, or get help from the FluxPay team.</p>
        <div className="hp-search">
          <Search size={18} />
          <input placeholder="Search for help..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <p className="hp-search-hint">Search payments, investments, subscriptions, wallets, and more</p>
      </div>

      <div>
        <div className="hp-section-head"><h2>Quick Help</h2></div>
        <div className="hp-grid">
          {filteredQuick.map(c => (
            <div className="hp-card" key={c.title}>
              <h3>{c.title}</h3>
              <p>{c.desc}</p>
              <button className="hp-link">{c.cta} <ArrowRight size={14} /></button>
            </div>
          ))}
        </div>
      </div>

      <div className="hp-card">
        <div className="hp-section-head"><h2>Frequently Asked Questions</h2></div>
        <div className="hp-faq">
          {filteredFaqs.map((f, i) => (
            <div className={`hp-faq-item${openFaq === i ? ' open' : ''}`} key={f.q}>
              <button className="hp-faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>{f.q}<ChevronDown size={16} /></button>
              {openFaq === i && <p className="hp-faq-a">{f.a}</p>}
            </div>
          ))}
          {filteredFaqs.length === 0 && <p className="hp-faq-a">No results found.</p>}
        </div>
      </div>

      <div className="hp-contact">
        <div>
          <h2>Still need help?</h2>
          <p>Our support team is here to help.</p>
          <a className="ov-btn primary" href="mailto:support@fluxpay.app">Contact Support</a>
        </div>
        <div className="hp-contact-info">
          <div><small>Support Email</small><strong>support@fluxpay.app</strong></div>
          <div><small>Response Time</small><strong>Typically within 24 hours</strong></div>
          <div>
            <small>Community Support</small>
            <div className="hp-community"><button>Join Discord</button><button>Join Telegram</button></div>
          </div>
        </div>
      </div>

      <div className="hp-grid2">
        <div className="hp-card hp-cta-card">
          <h3>Something isn&apos;t working?</h3>
          <p>Tell us what happened and we&apos;ll help you investigate.</p>
          <button className="ov-btn" onClick={() => setReportOpen(true)}>Report a Problem <ArrowRight size={14} /></button>
        </div>
        <div className="hp-card hp-cta-card">
          <h3>Need help with a transaction?</h3>
          <p>Check the status of a transaction before contacting support.</p>
          <button className="ov-btn" onClick={() => setTxOpen(true)}>Check Transaction Status <ArrowRight size={14} /></button>
        </div>
      </div>

      <div className="hp-card hp-safety">
        <div className="hp-section-head"><h2>Keep your account safe</h2></div>
        <ul>
          <li>Never share your private key or recovery phrase.</li>
          <li>FluxPay support will never ask for your private key.</li>
          <li>Always verify transaction details before confirming.</li>
          <li>Only use official FluxPay links and channels.</li>
        </ul>
        <button className="hp-link">Learn about security <ArrowRight size={14} /></button>
      </div>

      <div className="hp-card">
        <div className="hp-section-head"><h2>Resources</h2></div>
        <div className="hp-resources">
          {resources.map(r => <Link className="hp-resource" to="/help" key={r}>{r}</Link>)}
        </div>
      </div>
    </section>

    {reportOpen && (
      <div className="hp-modal-backdrop" onClick={() => setReportOpen(false)}>
        <div className="hp-modal" onClick={e => e.stopPropagation()}>
          <div className="hp-modal-head"><h2>Report a Problem</h2><button className="hp-close" onClick={() => setReportOpen(false)} aria-label="Close"><X size={16} /></button></div>
          <div className="hp-field">
            <label>Issue type</label>
            <select defaultValue="Payment issue">
              <option>Payment issue</option>
              <option>Investment issue</option>
              <option>Wallet issue</option>
              <option>Subscription issue</option>
              <option>Account/security issue</option>
              <option>Other</option>
            </select>
          </div>
          <div className="hp-field"><label>Transaction ID <span className="hp-optional">(optional)</span></label><input placeholder="0x..." /></div>
          <div className="hp-field"><label>Description</label><textarea rows={4} placeholder="Describe what happened..." /></div>
          <div className="hp-field"><label>Attach screenshot</label><button className="ov-btn"><Paperclip size={14} /> Attach file</button></div>
          <div className="hp-modal-actions">
            <button className="ov-btn" onClick={() => setReportOpen(false)}>Cancel</button>
            <button className="ov-btn primary" onClick={() => setReportOpen(false)}>Submit Report</button>
          </div>
        </div>
      </div>
    )}

    {txOpen && (
      <div className="hp-modal-backdrop" onClick={() => setTxOpen(false)}>
        <div className="hp-modal" onClick={e => e.stopPropagation()}>
          <div className="hp-modal-head"><h2>Transaction Status</h2><button className="hp-close" onClick={() => setTxOpen(false)} aria-label="Close"><X size={16} /></button></div>
          <div className="hp-field">
            <label>Transaction ID</label>
            <div className="hp-input-row">
              <input placeholder="0x…" value={txHashInput} onChange={e => setTxHashInput(e.target.value)} spellCheck={false} />
              <button className="ov-btn primary" onClick={checkTx} disabled={txChecking}>{txChecking ? 'Checking…' : 'Check'}</button>
            </div>
          </div>
          {txError && <p style={{ color: '#ef4444', fontSize: 13 }}>{txError}</p>}
          {txStatus && (
            <div className="hp-tx">
              <div className="hp-tx-row"><span>Status</span><strong className={txStatus.status === 'success' ? 'up' : ''}>{txStatus.status === 'success' ? 'Confirmed' : txStatus.status === 'reverted' ? 'Reverted' : 'Not found on Monad testnet'}</strong></div>
              {txStatus.block && <div className="hp-tx-row"><span>Block</span><strong>{txStatus.block.toString()}</strong></div>}
              {txStatus.timestamp && <div className="hp-tx-row"><span>Timestamp</span><strong>{new Date(txStatus.timestamp * 1000).toLocaleString('en-US')}</strong></div>}
              {txStatus.gasUsed && <div className="hp-tx-row"><span>Gas used</span><strong>{txStatus.gasUsed}</strong></div>}
              <div className="hp-tx-row"><span>Transaction ID</span><strong style={{ wordBreak: 'break-all' }}>{txStatus.hash}</strong></div>
              <div className="hp-tx-row"><span>Explorer</span><a className="hp-link" href={explorerTx(txStatus.hash)} target="_blank" rel="noreferrer">View on Explorer <ExternalLink size={13} /></a></div>
            </div>
          )}
        </div>
      </div>
    )}
  </DashboardShell>
}

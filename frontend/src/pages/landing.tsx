import { Link } from 'react-router-dom'
import { ChevronsRight } from 'lucide-react'

const features = [
  ['Swap', 'Trade tokens at live on-chain prices. On testnet, swap MON to WMON 1:1.'],
  ['Send', 'Send and request money using a @username, a QR code, or a link you can share anywhere.'],
  ['Streams', 'Pick an amount to flow per second, fund it once, and let it run — pause, resume, or cancel in a tap.'],
  ['Activity', 'A live feed of every payment and stream tick, pulled straight from Monad.'],
]

const images = [
  'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&h=300&fit=crop&q=80',
  'https://images.unsplash.com/photo-1556740758-90de374c12ad?w=600&h=300&fit=crop&q=80',
  'https://images.unsplash.com/photo-1551650975-87deedd944c3?w=600&h=300&fit=crop&q=80',
  'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=600&h=300&fit=crop&q=80',
]

const getCurrentYear = () => new Date().getFullYear()

export default function LandingPage() {
  return <main className="landing-page">
    <section className="landing-hero">
      <div className="landing-hero-header">
        <div className="wordmark">fluxpay</div>
        <nav className="hero-nav">
          <a href="#how-it-works">How It Works</a>
          <a href="#features">Features</a>
          <a href="#documentation">Documentation</a>
          <a href="#faqs">FAQs</a>
        </nav>
      </div>
      <div><h1>Swap. <span className="text-orange">Send.</span><br/>Stream.</h1><p>FluxPay is a payments app on Monad. Swap tokens at live on-chain prices, send money to a friend by their @username, or set a payment to trickle every second — with no addresses to copy, no gas to buy, and no seed phrase to lose.</p><div className="hero-actions"><Link to="/auth" className="lime-button">Join FluxPay</Link></div></div>
      <div className="hero-cards"><div className="card-ghost">fluxpay <span>◉</span></div><div className="card-dark">fluxpay <span>◉</span></div><div className="card-lime">fluxpay <span>◉</span></div></div>
    </section>
    <section className="landing-intro"><small className="feature-pill">FEATURES</small><h2>A money app that hides the chain.</h2><p className="intro-text">FluxPay sits in front of Monad's speed and keeps the plumbing out of the way. Sign in, get a balance, and start swapping, sending, and streaming — in seconds.</p></section>
    <section id="features" className="feature-grid">{features.map(([title, text], i) => <article key={title} className={`feature-tile tile-${i}`}><img src={images[i]} alt={title} className="feature-img" /><div className="tile-body"><h3>{title}</h3><p>{text}</p><a href="#pricing">Learn more <ChevronsRight size={14} /></a></div></article>)}</section>
    <section className="landing-intro second"><small className="feature-pill">OUR MISSION</small><h2>Payments should be as easy as a group chat.</h2><p>Stablecoins can move in seconds, but the usual experience is a maze of wallets, gas, and long addresses. FluxPay removes it: one smart account per person, fees covered for you, usernames in place of addresses, and settlement on Monad fast enough to watch happen.</p></section>
    <section className="landing-hero orange">
      <div>
        <h1>Start sending<br/>in seconds.</h1>
        <p>Sign in and make your first payment in under a minute.</p>
        <div className="hero-actions">
          <Link to="/auth" className="dark-button">Get Started</Link>
        </div>
      </div>
    </section>
    <footer className="landing-footer">
      <div className="footer-brand">
        <div className="wordmark">fluxpay</div>
        <p>A consumer payments app on Monad — swap, send, and stream.</p>
      </div>
      <div className="footer-cols">
        <div className="footer-col">
          <p className="footer-heading">Product</p>
          <div className="footer-links">
            <a href="#how-it-works">How It Works</a>
            <a href="#features">Pay</a>
            <a href="#features">Streams</a>
            <a href="#features">Activity</a>
            <a href="#features">Payment Links</a>
            <a href="#features">Swap</a>
            <a href="#features">Security</a>
          </div>
        </div>
        <div className="footer-col">
          <p className="footer-heading">Resources</p>
          <div className="footer-links">
            <a href="#faqs">FAQ</a>
            <a href="#support">Help & Support</a>
            <a href="#documentation">Documentation</a>
            <a href="#blog">Blog</a>
            <a href="#community">Community</a>
            <a href="#contact">Contact Us</a>
          </div>
        </div>
        <div className="footer-col">
          <p className="footer-heading">Explore</p>
          <div className="footer-links">
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#features">Pay</a>
            <a href="#features">Streams</a>
            <a href="#features">Activity</a>
            <a href="#features">Swap</a>
          </div>
        </div>
      </div>
    </footer>
    <p className="footer-copyright">© {getCurrentYear()} FluxPay. All Rights Reserved.</p>
  </main>
}

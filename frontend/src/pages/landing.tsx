import { Link } from 'react-router-dom'
import { ChevronsRight } from 'lucide-react'

const features = [
  ['Pay & Own', 'Turn everyday subscription spending into automated investments and build ownership over time.'],
  ['Automated Investing', 'Set an investment percentage for each subscription and let FluxPay automatically invest the configured amount.'],
  ['Tokenized Portfolio', 'Track your investments, ownership, portfolio value, returns, and ownership history in one place.'],
  ['AI Financial Terminal', 'Use an AI assistant to perform actions like sending funds, swapping assets, paying, and managing investments—with confirmation before execution.'],
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
      <div><h1>Spend. <span className="text-orange">Invest.</span><br/>Own.</h1><p>Your everyday spending can truly accomplish so much more than simply paying for all the things you buy each and every single day of your life. Fluxpay automatically converts a small portion of your recurring monthly subscription payments into real meaningful investments.</p><div className="hero-actions"><Link to="/auth" className="lime-button">Join FluxPay</Link></div></div>
      <div className="hero-cards"><div className="card-ghost">fluxpay <span>◉</span></div><div className="card-dark">fluxpay <span>◉</span></div><div className="card-lime">fluxpay <span>◉</span></div></div>
    </section>
    <section className="landing-intro"><small className="feature-pill">FEATURES</small><h2>Making every payment an opportunity to build ownership.</h2><p className="intro-text">We built FluxPay around a simple idea: make your money work beyond the moment you spend it. From everyday payments to automated investments, every experience is designed to help you spend, invest and own with confidence.</p></section>
    <section id="features" className="feature-grid">{features.map(([title, text], i) => <article key={title} className={`feature-tile tile-${i}`}><img src={images[i]} alt={title} className="feature-img" /><div className="tile-body"><h3>{title}</h3><p>{text}</p><a href="#pricing">Learn more <ChevronsRight size={14} /></a></div></article>)}</section>
    <section className="landing-intro second"><small className="feature-pill">OUR MISSION</small><h2>We believe the money you spend everyday should have the potential to become something you own.</h2><p>FluxPay's mission is to bridge everyday spending and investing, making it easier for people to turn routine payments into long-term ownership. By connecting payments, automated investing, and tokenized assets in one simple experience, we're building a new way to spend with purpose and invest without changing the way you live.</p></section>
    <section className="landing-hero orange">
      <div>
        <h1>Start turning spending<br/>into ownership.</h1>
        <p>Join FluxPay and start making more from the payments you already make.</p>
        <div className="hero-actions">
          <Link to="/auth" className="dark-button">Start For Free</Link>
        </div>
      </div>
    </section>
    <footer className="landing-footer">
      <div className="footer-brand">
        <div className="wordmark">fluxpay</div>
        <p>Spend smarter, invest automatically, and own your future.</p>
      </div>
      <div className="footer-cols">
        <div className="footer-col">
          <p className="footer-heading">Product</p>
          <div className="footer-links">
            <a href="#how-it-works">How It Works</a>
            <a href="#features">Pay & Own</a>
            <a href="#features">Subscriptions</a>
            <a href="#features">Portfolio</a>
            <a href="#features">AI Terminal</a>
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
            <a href="#features">Pay & Own</a>
            <a href="#features">Subscriptions</a>
            <a href="#features">Portfolio</a>
            <a href="#features">AI Terminal</a>
          </div>
        </div>
      </div>
    </footer>
    <p className="footer-copyright">© {getCurrentYear()} FluxPay. All Rights Reserved.</p>
  </main>
}

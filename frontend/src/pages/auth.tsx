import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { useProfile } from '@/hooks/profile'
import { ArrowLeft, ArrowRight } from 'lucide-react'

const reviews = [
  ['FluxPay turns my everyday subscriptions into a portfolio that keeps growing while I sleep.', 'Amara Okafor'],
  ['The AI terminal feels like having a personal banker in my pocket at all times.', 'David Kimani'],
  ['I finally own a piece of everything I pay for. It changed how I see my money.', 'Sofia Reyes'],
  ['Setup took two minutes and my money has been working for me ever since.', 'Tunde Balogun'],
]

export default function AuthPage() {
  const [index, setIndex] = useState(0)
  const navigate = useNavigate()
  const { ready, authenticated, login } = usePrivy()
  const { status } = useProfile()

  useEffect(() => {
    const timer = setInterval(() => setIndex(i => (i + 1) % reviews.length), 4500)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (ready && authenticated) {
      if (status === 'onboarded') navigate('/dashboard', { replace: true })
      else if (status === 'needs_onboarding') navigate('/onboarding', { replace: true })
    }
  }, [ready, authenticated, status, navigate])

  const prev = () => setIndex(i => (i - 1 + reviews.length) % reviews.length)
  const next = () => setIndex(i => (i + 1) % reviews.length)

  return <main className="auth-page">
    <div className="auth-card">
      <div className="auth-visual">
        <h1>Make every payment<br/>an opportunity to<br/>invest.</h1>
        <div className="orange-bars"><i/><i/><i/><i/></div>
        <div className="review-glass">
          <div className="review-viewport">
            <div className="review-track" style={{ transform: `translateX(-${index * 100}%)` }}>
              {reviews.map(([text, name]) => <div className="review-slide" key={name}><p className="review-text">{text}</p><p className="review-name">{name}</p></div>)}
            </div>
          </div>
          <div className="review-nav">
            <button aria-label="Previous review" onClick={prev}><ArrowLeft size={13} /></button>
            <button aria-label="Next review" onClick={next}><ArrowRight size={13} /></button>
          </div>
        </div>
      </div>
      <div className="auth-form">
        <p className="auth-welcome">Welcome to FluxPay — Let&apos;s get started</p>
        <div className="social-buttons">
          <button className="social-button" disabled={!ready} onClick={() => login()}>
            <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Continue with Google
          </button>
          <button className="social-button" disabled={!ready} onClick={() => login()}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            Continue with Wallet
          </button>
        </div>
        <div className="divider"><span>OR</span></div>
        <p className="auth-email-label">Continue with email</p>
        <input autoComplete="off" placeholder="Enter your email address" type="email"/>
        <button className="auth-submit" disabled={!ready} onClick={() => login()}>Send Login Link</button>
      </div>
    </div>
  </main>
}

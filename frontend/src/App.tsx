import { Routes, Route } from 'react-router-dom'
import ScrollToTop from '@/components/scroll-to-top'
import { RequireProfile } from '@/components/guard'
import LandingPage from './pages/landing'
import AuthPage from './pages/auth'
import OnboardingPage from './pages/onboarding'
import PayPage from './pages/pay'
import DashboardPage from './pages/dashboard'
import SendPage from './pages/send'
import ReceivePage from './pages/receive'
import SwapPage from './pages/swap'
import PortfolioPage from './pages/portfolio'
import SubscriptionsPage from './pages/subscriptions'
import ActivityPage from './pages/activity'
import SettingsPage from './pages/settings'
import TerminalPage from './pages/terminal'
import HelpPage from './pages/help'
import PaymentLinkPage from './pages/payment-link'
import PayAndOwnPage from './pages/pay-and-own'
import WalletPage from './pages/wallet'

const guarded = (el: React.ReactNode) => <RequireProfile>{el}</RequireProfile>

export default function App() {
  return <>
    <ScrollToTop />
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/pay" element={<PayPage />} />
      <Route path="/dashboard" element={guarded(<DashboardPage />)} />
      <Route path="/send" element={guarded(<SendPage />)} />
      <Route path="/receive" element={guarded(<ReceivePage />)} />
      <Route path="/swap" element={guarded(<SwapPage />)} />
      <Route path="/portfolio" element={guarded(<PortfolioPage />)} />
      <Route path="/subscriptions" element={guarded(<SubscriptionsPage />)} />
      <Route path="/activity" element={guarded(<ActivityPage />)} />
      <Route path="/settings" element={guarded(<SettingsPage />)} />
      <Route path="/terminal" element={guarded(<TerminalPage />)} />
      <Route path="/help" element={guarded(<HelpPage />)} />
      <Route path="/payment-link" element={guarded(<PaymentLinkPage />)} />
      <Route path="/pay-and-own" element={guarded(<PayAndOwnPage />)} />
      <Route path="/wallet" element={guarded(<WalletPage />)} />
    </Routes>
  </>
}

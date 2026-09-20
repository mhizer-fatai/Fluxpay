import { Routes, Route } from 'react-router-dom'
import ScrollToTop from '@/components/scroll-to-top'
import LandingPage from './pages/landing'
import AuthPage from './pages/auth'
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

export default function App() {
  return <>
    <ScrollToTop />
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/send" element={<SendPage />} />
      <Route path="/receive" element={<ReceivePage />} />
      <Route path="/swap" element={<SwapPage />} />
      <Route path="/portfolio" element={<PortfolioPage />} />
      <Route path="/subscriptions" element={<SubscriptionsPage />} />
      <Route path="/activity" element={<ActivityPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/terminal" element={<TerminalPage />} />
      <Route path="/help" element={<HelpPage />} />
      <Route path="/payment-link" element={<PaymentLinkPage />} />
      <Route path="/pay-and-own" element={<PayAndOwnPage />} />
      <Route path="/wallet" element={<WalletPage />} />
    </Routes>
  </>
}

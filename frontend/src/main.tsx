import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PrivyProvider } from '@privy-io/react-auth'
import { monadTestnet } from '@/lib/chain'
import { ProfileProvider } from '@/hooks/profile'
import './index.css'
import App from './App'

// Public app id (ships in the browser bundle either way) — env override kept for other apps.
const privyAppId = (import.meta.env.VITE_PRIVY_APP_ID || 'cmuamdld600480cjtff83vl6j') as string

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrivyProvider
      appId={privyAppId}
      config={{
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
        loginMethods: ['google', 'email', 'twitter'],
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
      }}
    >
      <BrowserRouter>
        <ProfileProvider>
          <App />
        </ProfileProvider>
      </BrowserRouter>
    </PrivyProvider>
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PrivyProvider } from '@privy-io/react-auth'
import { monadTestnet } from '@/lib/chain'
import { ProfileProvider } from '@/hooks/profile'
import './index.css'
import App from './App'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID as string | undefined
if (!privyAppId) throw new Error('Missing VITE_PRIVY_APP_ID — check frontend/.env')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrivyProvider
      appId={privyAppId}
      config={{
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
        loginMethods: ['google', 'twitter', 'apple', 'email', 'passkey', 'wallet'],
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

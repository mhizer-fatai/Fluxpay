# FluxPay — Judge's Quick Start

**Track:** Monad Metropolis 2026 — Track 2: Consumer Products & Payments
**Network:** Monad Testnet (chain 10143) · **Repo:** this repository (public)

FluxPay is a consumer money app that hides the chain: send to a @username, subscribe by
the second, earn yield on idle balance, and swap — no seed phrase, no gas, no addresses.

---

## 1. Open the app

| | |
|---|---|
| **Live app** | **https://fluxpay-monad.netlify.app** |
| **Live API** | **https://fluxpay-monad.onrender.com** (`/health` → `{"ok":true,"chainId":10143}`) |
| **No credentials needed** | Log in with any email / Google / X account (Privy). You choose a @username on first login. |
| **No gas needed** | Gas is sponsored (ERC-4337 + Pimlico) — transactions never ask for gas or testnet MON. |

> The backend runs on Render's free tier and sleeps after ~15 minutes idle — the first
> request can take 30–60s while it wakes. Refresh if the dashboard looks empty on first load.

### Run locally (2 minutes)

```bash
npm install
npm run db:migrate -w backend     # needs DATABASE_URL (see backend/.env.example)
npm run dev -w backend            # http://localhost:8080
npm run dev -w frontend           # http://localhost:5173
```

`backend/.env` and `frontend/.env` are **optional**: the deployed contract addresses are
hardcoded defaults in `frontend/lib/chain.ts` / `backend/src/config.ts`, and the frontend
API URL defaults to `http://localhost:8080`. Set env vars only to override (deployed
backend URL, another network, secrets like the RPC or Pimlico key).

## 2. The 60-second tour

1. **Join** — open the app, log in, pick a @username.
2. **Funds** — the demo accounts in the video are funded with test USDC. New accounts start
   empty by design (no faucet button in the product UI); to try the flows yourself, contact the
   team via the submission page and we'll fund your address.
3. **Send** — Send → `@username` → amount → slide to send. Settlement is on-chain and gasless;
   watch the Activity feed update.
4. **Subscriptions** — Subscriptions → New Stream → USDC, e.g. `15`/month, 1 month → Approve &
   Create. One confirmation creates the per-second stream; the recipient withdraws as it
   accrues, and pause/cancel returns whatever hasn't streamed.
5. **Portfolio** — live holdings, allocation, and stream deposits, read directly from Monad.
6. **Payment links** — Payment Link → create (MON or USDC, optional expiry and payer
   restriction) → share it. The payer connects **their own browser wallet** (MetaMask; the app
   offers to add Monad Testnet) and pays directly — single-use, verified on-chain.

## 3. What to look for (judging notes)

- **Real on-chain mechanics, not mocks in the flow:** per-second accrual with pause/resume and
  deposit-capped exhaustion (StreamVault), single-use links with on-chain verification of payer,
  recipient, token, amount and recency, ERC-4626 Earn vault.
- **Invisible blockchain:** no seed phrase, no gas, no addresses required — usernames, one-tap
  claims, sponsored transactions.
- **Honest about testnet limits:** the Earn yield source is simulated on testnet (no real
  lending venue exists there — Curvance is the mainnet target). It's built as a swappable
  adapter (`IYieldStrategy`) so mainnet plugs in a real venue without changing the vault or
  the UI.

## 4. Repository map

| Path | What |
|---|---|
| `contracts/` | Foundry: FluxPay settle, StreamVault, UsernameRegistry, PaymentLinkEscrow, EarnVault + MockYieldStrategy (50 tests) |
| `backend/` | Express + Postgres: auth, payment intents, payment links (conditions, verification), activity watcher, WebSocket gateway, AA (Pimlico) proxy, test-USDC faucet (API-only) |
| `frontend/` | React + Vite: onboarding, dashboard, send, streams, payment links, earn, swap, activity |
| `deployments/10143.json` | Deployed contract addresses (Monad testnet) |

## 5. Deployed contracts (Monad testnet)

See `deployments/10143.json` for the full list. Key ones:

- FluxPay settle `0x3148a4de…CF7E` · StreamVault `0x3791a605…Da13`
- EarnVault `0x740E816C…1D30` · UsernameRegistry `0xAc34e4b9…56E2`
- PaymentLinkEscrow `0x47C65974…0434`

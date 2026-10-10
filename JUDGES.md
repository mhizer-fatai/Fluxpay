# FluxPay — Judge's Quick Start

**Track:** Monad Metropolis 2026 — Track 2: Consumer Products & Payments
**Network:** Monad Testnet (chain 10143) · **Repo:** this repository (public)

FluxPay is a consumer money app where **every payment can build ownership**: send to a
@username, stream a subscription per second, earn yield on idle balance, and turn a slice
of what you pay into a tokenized-equity position you keep.

---

## 1. Open the app

| | |
|---|---|
| **Live app** | **https://fluxpay-monad.netlify.app** |
| **Live API** | **https://fluxpay-monad.onrender.com** (`/health` → `{"ok":true,"chainId":10143}`) |
| **No credentials needed** | Log in with any email / Google / X account (Privy). You choose a @username on first login. |
| **No testnet funds needed** | Gas is sponsored (ERC-4337 + Pimlico). Test USDC comes from the in-app faucet. |

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
2. **Get test USDC** — the dashboard shows a **“Get 5 test USDC”** button when your balance is
   low. One click, no faucet hunting, no MON required.
3. **Send** — Send → `@username` → amount → slide to send. Settlement is on-chain and gasless;
   watch the Activity feed update.
4. **Stream + Pay & Own** — Subscriptions → New Stream → USDC, e.g. `15`/month, **Invest & Own
   2%** → Approve & Create. One confirmation creates the per-second stream **and** buys your
   equity slice. The merchant still receives 100% of the payment.
5. **Portfolio** — the **Pay & Own** card shows your position (e.g. `0.0044 NVDAx`), its USD
   value, the price and its source, plus **Sell all for USDC**.
6. **Payment links** — Payment Link → create (MON or USDC, optional expiry and payer
   restriction) → share it. The payer connects **their own browser wallet** (MetaMask; the app
   offers to add Monad Testnet) and pays directly — single-use, verified on-chain.

## 3. What to look for (judging notes)

- **Real on-chain mechanics, not mocks in the flow:** per-second accrual with pause/resume and
  deposit-capped exhaustion (StreamVault), single-use links with on-chain verification of payer,
  recipient, token, amount and recency, ERC-4626 Earn vault, real buy/sell for Pay & Own.
- **Invisible blockchain:** no seed phrase, no gas, no addresses required — usernames, one-tap
  claims, sponsored transactions.
- **Honest about testnet limits:** the Earn yield source and the tokenized equity are simulated
  on testnet (no real venue exists there — xStocks and Monday Trade are Monad mainnet). Both are
  built as swappable adapters (`IYieldStrategy`, `IInvestVenue`) so mainnet plugs in real venues
  without changing the vault or the UI. Equity pricing reads the real **Pyth NVDA/USD** feed with
  a freshness window; the UI labels when the testnet fallback price is in use.

## 4. Repository map

| Path | What |
|---|---|
| `contracts/` | Foundry: FluxPay settle, StreamVault, UsernameRegistry, PaymentLinkEscrow, EarnVault + MockYieldStrategy, InvestVault + MockEquityVenue + StockToken (50 tests) |
| `backend/` | Express + Postgres: auth, payment intents, payment links (conditions, verification), activity watcher, WebSocket gateway, AA (Pimlico) proxy, demo faucet |
| `frontend/` | React + Vite: onboarding, dashboard, send, streams, payment links, earn, invest, swap, activity |
| `deployments/10143.json` | Deployed contract addresses (Monad testnet) |

## 5. Deployed contracts (Monad testnet)

See `deployments/10143.json` for the full list. Key ones:

- FluxPay settle `0x3148a4de…CF7E` · StreamVault `0x3791a605…Da13`
- EarnVault `0x740E816C…1D30` · InvestVault `0x9Ccf20a7…0f0e`
- UsernameRegistry `0xAc34e4b9…56E2` · PaymentLinkEscrow `0x47C65974…0434`

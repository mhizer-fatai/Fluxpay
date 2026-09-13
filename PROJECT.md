# Fluxpay — Project Handoff

> **Read this first.** It is the single source of truth for what Fluxpay is, its status, and how
> to contribute. Deeper detail lives in `SYSTEM_DESIGN.md` (architecture) and `PLAN.md`
> (7-day sprint). `Fluxpay-Project-Brief.pdf` is the judge-facing pitch.

---

## 1. What is Fluxpay?

**Fluxpay is a consumer payments app on Monad** — "money that moves like a message."

Users sign in with Face ID / a passkey (no seed phrase, no wallet, no gas, no "blockchain" in the
UI), then send, request, split, and **stream** money with sub-second settlement on Monad
(~400 ms blocks, ~800 ms finality). It targets **Track 2 (Consumer Products & Payments)** of the
**Monad Metropolis hackathon** (build window 1 Sep – 13 Oct 2026, winners 3 Nov).

- Tagline: *Money that moves like a message.*
- Three product surfaces: **Pay**, **Streams**, **Activity**.

## 2. Why it exists (the problem, with sources)

Stablecoins settled ~$390B of *real* payments in 2025, but **58% was B2B and <1% retail**
(McKinsey/Artemis). ~76% of users who *tried* a crypto payment abandoned it — wallets, gas,
and chain-selection friction (WalletConnect/PYMNTS). Monad has deep DeFi/institutional capital
but **no consumer-facing payment app**. Fluxpay is the human layer: someone should be able to pay a
friend like sending a text, and Monad's speed finally makes that UX technically honest.

## 3. Features (MVP)

| Feature | What it does | Differentiator |
|---|---|---|
| **Pay** | Send by username, request money, QR, shareable payment links, group splits (atomic batch) | The "never mentions blockchain" app from the track brief |
| **Streams** | Per-second billing vaults — pay-per-second subscriptions, pay-per-minute services, streaming allowances | Impossible-elsewhere proof on Monad's block time; the live demo moment (pause → tick freezes in <1 s) |
| **Activity** | Real-time feed of every settle/stream tick | Makes sub-second finality visible to judges |

**Deliberately NOT building (v1):** fiat ramps, cards, merchant POS, chain/token jargon in UI,
x402, AUSD, Chainlink CRE, AI commands (all post-core, bounty-driven stretch).

## 4. Tech stack & key decisions

- **Monad Testnet** — chain ID `10143`, RPC `https://testnet-rpc.monad.xyz`, faucet
  `https://faucet.monad.xyz`, explorers `testnet.monadvision.com` / `testnet.monadscan.com`.
  Mainnet chain ID `143`.
- **Language/stack:** Solidity (Foundry) · TypeScript (Node/Next.js) · Next.js PWA frontend ·
  Postgres + Redis backend · Envio or log-polling indexer.
- **Accounts (IMPORTANT — research corrected this):**
  - **Mera** (`@category-labs/mera`) derives a **regular EOA** from the passkey via WebAuthn PRF
    (BIP-44). It is **NOT** an ERC-4337 smart account, has **no gas sponsorship**, requires
    HTTPS, PRF-capable authenticators (desktop Chrome = Google Password Manager only), and is
    **bound to its domain (`rpId`)** — lock the demo domain early.
  - **Path A (preferred):** Mera EOA + **EIP-7702** delegation (supported on Monad, tx type
    `0x04`) to a session/batch account → gas sponsorship + batched splits. Caveats: delegated
    EOAs can't dip below 10 MON reserve; delegated code can't `CREATE`/`CREATE2`.
  - **Path B (fallback):** **Privy + Pimlico** Kernel smart wallet (EntryPoint v0.7) — Monad's
    official documented gasless stack with a template
    (`monad-developers/next-serwist-privy-smart-wallet`). **Decision rule: spike Path A on
    Day 1 for 2 hours; if not clean, ship Path B.**
- **Gas:** Monad charges `gas_limit`, **not** `gas_used`. Never rely on `eth_estimateGas` in the
  hot path — maintain a hardcoded `gasTable[selector] → limit`.
- **P256 precompile:** available at `0x0100` (EIP-7951) for on-chain WebAuthn verification if
  needed later; Mera itself doesn't use it.
- **Contract addresses (canonical, same on testnet+mainnet):** EntryPoint v0.7
  `0x0000000071727De22E5E9d8BAf0edAc6f37da032`, Multicall3 `0xcA11...CA11`, Permit2
  `0x0000...78ba3`, CreateX `0xba5E...a5Ed`. Full table in `SYSTEM_DESIGN.md` Appendix A.

## 5. Repo layout (to be scaffolded)

```
fluxpay/
├── contracts/          # Foundry: UsernameRegistry, FluxPay, PaymentLinkEscrow,
│                       #          SplitManager, StreamVault (+ mock USDC for testnet)
├── backend/            # TS services: registry, links, streams-api, indexer,
│                       #          relayer (userOp or 7702 sponsor), WS gateway
├── frontend/           # Next.js PWA: onboarding (passkey), home, pay, activity,
│                       #          groups, streams, link-claim
├── infra/              # docker-compose (pg, redis), deploy scripts, env templates
├── deployments/        # committed CREATE2 addresses per network
├── SYSTEM_DESIGN.md    # full architecture (read before changing anything structural)
├── PLAN.md             # 7-day sprint (status-tracked in this file's §6)
└── PROJECT.md          # this file
```

## 6. Status

| Phase | Status |
|---|---|
| Problem research + track selection | ✅ Done |
| Product scope (Pay/Streams/Activity) | ✅ Done |
| System design (SYSTEM_DESIGN.md) | ✅ Done, Monad params verified against docs |
| Monad platform verification | ✅ Done (chain IDs, EntryPoints, P256 `0x0100`, gas model, Mera/7702/Privy paths) |
| 7-day sprint plan (PLAN.md) | ✅ Done |
| **Code scaffold** | ⏳ **Not started** — this is the next step |
| Team registration at hackathon.monad.xyz | ⏳ Do immediately |
| Demo domain locked | ⏳ Day 1 |
| Faucet MON for all devs | ⏳ Day 1 |

## 7. How to contribute (for AI agents / teammates)

1. Read this file, then `SYSTEM_DESIGN.md` before touching structure.
2. Work in the mono-repo layout above; keep contracts deployable via CREATE2; always set
   explicit gas limits; never store secrets in code.
3. Test against Monad testnet (chain 10143) with mock USDC first.
4. Daily demoable increments (see `PLAN.md`); the demo script is in both `PLAN.md` and the PDF.
5. When adding bounty integrations, prefer the ones in `SYSTEM_DESIGN.md` §11 of the brief:
   Mera ($2.5k×2), Agora AUSD ($10k cross-border), Chainlink CRE ($3k), Envio ($1k), Privy/Dynamic ($5k).

## 8. Open questions (block nothing)

- Does Pimlico's Monad bundler honor explicitly-set userOp gas limits? (test with a 2-tx batch)
- Testnet USDC/AUSD addresses (see `monad-crypto/token-list` `tokenlist-testnet.json`).
- Envio reorg handling on Monad vs log-polling — polling is the plan of record.

---
*Fluxpay · Monad Metropolis 2026 · Track 2 · $250k pool · built to win on execution, not idea novelty.*

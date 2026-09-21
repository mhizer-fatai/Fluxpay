# Fluxpay — 7-Day Sprint Plan & Architecture
## Metropolis Hackathon 2026 · Track 2: Consumer Products & Payments
### Team of 3: Contracts dev (you) · Backend dev · Frontend dev
### Target: feature-complete in ~7 days, well before the 13 Oct deadline

---

## Scope for the sprint (ruthlessly cut)

**IN:** Privy auth (social + passkey, one wallet) · send by username · payment link · split · StreamVault (per-second billing) · live activity feed · demo video
**OUT (cut from the 6-week version):** x402 endpoint · Agora AUSD integration · Chainlink CRE automation · Aurora Intents · Kimi/Qwen commands · group management beyond one-tap split

### Account decision (locked: Privy-only)

**Privy is the single auth + wallet stack** — social logins (Google, X, Apple, email) and passkey login converge on one embedded wallet per user. Smart accounts (Kernel + EntryPoint v0.7) give built-in gas sponsorship via the Pimlico paymaster and native batched calls (splits). No Mera: Mera is passkey-only (no social logins) with authenticator friction (PRF support) and no gas sponsorship — dropped in favor of one provider doing both. This forfeits the Mera bounties ($2.5k×2); Privy bounty ($5k) stays in play.

**Do Day 1:** create the Privy app (App ID), wire login (social + passkey), deploy the first smart account, and send one Pimlico-sponsored tx. Grab testnet MON from the faucet for all devs (sponsor funds, not users).

> Rationale: judges reward a complete, working core loop over bounty checkbox sprawl. Bounties can be layered back later if the core lands early.

---

## Day-by-day plan

### Day 1 — Foundations (parallel)
- **Contracts:** repo + Foundry setup; deploy mock-USDC + payment escrow skeleton to **Monad testnet**
- **Backend:** Node/TS service skeleton, Alchemy testnet RPC, username registry v0 (SQLite is fine)
- **Frontend:** Next.js PWA shell + **Privy login (social + passkey)** — see decision block above
- **Also Day 1:** create Privy app + Pimlico paymaster, grab testnet MON from faucet for all devs
- **End-of-day demo:** log in with a passkey, **send a sponsored tx** (never touch MON)

### Day 2 — Pay (core loop)
- **Contracts:** `FluxPay` (username-address settle) + `PaymentLinkEscrow` (deposit → claim → refund-after-expiry)
- **Backend:** registry API (username ↔ address), link state machine, event polling v0 (logs)
- **Frontend:** onboarding (username + passkey), home screen, send flow
- **End-of-day demo:** Alice sends Bob testnet USDC by username, in-app

### Day 3 — Feed + links
- **Frontend:** Activity feed (live updates from backend WS), request flow, payment-link share page (claim via passkey)
- **Backend:** WebSocket fan-out from event polling (Envio only if integration goes smoothly — polling is the plan of record)
- **Contracts:** Foundry tests on escrow invariants (claim-before-expiry, double-claim revert, refund)
- **End-of-day demo:** full Pay loop — send, request, link claim — visible live in the feed

### Day 4 — StreamVault (the differentiator)
- **Contracts:** `StreamVault` — rate/sec, pull-based accrual, pause, cancel, withdraw; fuzz tests on invariants
- **Backend:** streams API (create/pause/cancel/inspect)
- **Frontend:** Streams screen — balance ticking every second, big pause button
- **End-of-day demo:** open a stream, watch it tick, hit pause → **ticking freezes in <1s**

### Day 5 — Splits + integration hardening
- **Contracts:** `SplitSettlement` (one tx → N transfers)
- **Frontend:** split flow (pick contacts, one tap settle)
- **All:** fix everything broken; run the full demo script end-to-end on fresh accounts
- **End-of-day demo:** the complete 5-minute demo script runs clean

### Day 6 — Polish + submission assets
- **Frontend:** empty/error states, animations, mobile QA, PWA install
- **All:** demo script rehearsal ×3, record backup video, clean README (setup, testnet addresses, env)
- **Contracts:** final review, deploy final addresses, verify on explorer

### Day 7 — Buffer
- Bug fixes only. Submit project profile (demo video, write-up, repo links) **today, not on deadline day**
- If everything is green: optionally layer the Envio bounty integration or Agora AUSD for extra credit

---

## Contract architecture

```
contracts/
├── FluxPay.sol              — P2P settle to username-registered recipients
├── PaymentLinkEscrow.sol    — linkId → {deposit, expiry, claimer, status}
├── SplitSettlement.sol      — one tx → N transfers (atomic batch)
└── StreamVault.sol          — streamId → {ratePerSecond, balance, accrued, paused}
```

**Events (indexed → backend consumer → WS → frontend):**
```solidity
event PaymentSettled(address indexed from, address indexed to, uint256 amount);
event LinkCreated(bytes32 indexed linkId, address indexed depositor, uint256 amount);
event LinkClaimed(bytes32 indexed linkId, address indexed claimer);
event LinkRefunded(bytes32 indexed linkId);
event SplitSettled(address indexed payer, uint256 total, uint256 count);
event StreamOpened(uint256 indexed id, address indexed to, uint96 ratePerSecond);
event StreamAccrued(uint256 indexed id, uint256 amount, uint40 at);
event StreamPaused(uint256 indexed id);
event StreamCancelled(uint256 indexed id, uint256 refunded, uint256 paidOut);
```

**StreamVault core invariants (test these):**
1. `accrued` is always `min(elapsed × rate, remaining deposit)` — no more, no less
2. Pause freezes accrual at the exact call block
3. Cancel pays recipient accrued-to-date + refunds sender the rest (atomic)
4. No tx is required while streaming — zero gas during active streams
5. Reentrancy-guarded withdraw; pull pattern only (recipient calls `withdraw`)

## Backend services

| Service | Responsibility |
|---|---|
| `registry` | username ↔ address, availability checks |
| `links` | payment-link CRUD + state machine (created → claimed/expired/refunded) |
| `events` | testnet log polling → normalized events → Postgres/SQLite + WebSocket fan-out (swap for Envio later if desired) |
| `streams-api` | create/pause/cancel/inspect streams |

## Frontend routes (PWA)

| Route | Purpose |
|---|---|
| `/onboarding` | username + Privy login (social + passkey) — target: <30s to first payment |
| `/` | home: balance, quick actions, live activity preview |
| `/pay` | send by username/QR/link |
| `/activity` | real-time feed |
| `/split` | split flow |
| `/streams` | live-ticking streams, pause/cancel |
| `/link/[id]` | claim page for payment links (passkey claim) |

---

## Risk register (compressed)

| Risk | Mitigation |
|---|---|
| Privy/Pimlico outage or misconfig | Fallback: Dynamic embedded wallet (also a bounty); pre-fund a demo sponsor wallet |
| Envio time sink | Not on critical path — log polling is the plan of record |
| StreamVault security bug | Foundry fuzz tests on Day 4; reentrancy guard; pull-only withdraw |
| Frontend polish eats feature time | Feature freeze end of Day 5, no exceptions |
| One day slips | Day 7 is pure buffer |

---

## Demo script (judging day — 5 minutes)

1. **(0:00)** Fresh phone → onboarding in 20 seconds (passkey, no seed phrase)
2. **(0:30)** Send $5 to teammate by username — feed updates before finger lifts
3. **(1:30)** Split a bill 3 ways — one tap, all settled
4. **(2:30)** Open a pay-per-second subscription — balance ticking live
5. **(3:30)** Hit pause — ticking freezes in <1s. *"Only possible on Monad."*
6. **(4:30)** Close: never said the word blockchain. Money that moves like a message.

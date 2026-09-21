# Fluxpay — Production System Design

**Metropolis Hackathon 2026 · Track 2: Consumer Products & Payments**
Non-custodial consumer payments app on Monad: Pay · Streams · Activity.

This document is the production-ready architecture. It intentionally over-engineers relative to
the 7-day sprint in `PLAN.md` — every section marks **[v1]** (hackathon MVP, build this) versus
**[prod]** (hardening needed before real money / scale).

---

## 1. Design goals & SLOs

| Goal | Target |
|---|---|
| **Latency** send → recipient feed update | p95 < 1.5 s |
| Stream pause → on-chain effect | < 2 s (≈1 finality round + margin) |
| API availability | 99.9% (stateless, horizontal scale) |
| Non-custodial | Server NEVER holds user signing keys |
| Gas abstraction | Users hold only USDC; never buy/see MON |
| Sanctions screening | Deposit/withdraw boundaries [prod] |
| Reorg tolerance | Monad ~800 ms deterministic finality → treat 1 confirmation as final for UX, verify before irreversible actions |

Core truth model: **the chain is the source of truth. Postgres is a read-optimized cache.**
The backend can be wiped and fully rebuilt from indexed events without money moving incorrectly.

---

## 2. High-level architecture

```
┌────────────┐   REST/WS    ┌──────────────────────────────┐
│  Mobile    │◄────────────►│  API Gateway (Next.js/BFF)   │
│  PWA       │   optimistic │  auth · idempotency · limits  │
└────────────┘              └──────┬───────────────┬───────┘
                                   │               │
                  ┌────────────────▼────┐   ┌──────▼───────────────┐
                  │  Services (TS)      │   │  WebSocket Gateway   │
                  │  identity · payments│   │  (Redis pub/sub fan) │
                  │  links · streams    │   └──────────┬───────────┘
                  │  notifier · keeper  │              │
                  └──────┬──────────────┘              │
                         │ enqueue intents             │
                  ┌──────▼──────────────┐       ┌──────▼──────────────┐
                  │  Relayer (userOps)  │       │  Indexer (Envio +  │
                  │  bundler · paymaster│       │  custom consumers)  │
                  └──────┬──────────────┘       └──────┬─────────────┘
                         │                             │
              ┌──────────▼──────────┐        ┌─────────▼──────────┐
              │  RPC (Alchemy/     │        │  Postgres (read    │
              │  QuickNode + own)   │        │  model) + Redis    │
              └──────────┬──────────┘        └────────────────────┘
                         ▼
                ┌──────────────────┐
                │  Monad chain     │
                │  (smart accounts,│
                │  contracts)      │
                └──────────────────┘
```

**Non-custodial invariant:** passkeys + signing keys live in the user's device (WebAuthn /
P256 hardware-backed). The backend submits signed intents; it can delay but never steal.

---

## 3. Identity & Account Model

> **DECISION — Privy-only (locked).** A single auth + wallet stack: social logins
> (Google, X, Apple, email) and passkey login converge on one embedded Kernel
> smart account (EntryPoint v0.7) per user. Gas is sponsored by the Pimlico
> paymaster; splits use native batched calls (`sendTransaction({ calls: [...] })`).
> Mera was evaluated and dropped: passkey-only (no social logins), WebAuthn PRF
> authenticator friction, no gas sponsorship. This forfeits the Mera bounties;
> Privy ($5,000) stays in play. Dynamic is the fallback embedded-wallet provider.

### 3.0 Account architecture (Privy + Pimlico)

| Concern | How |
|---|---|
| Login | Privy: social + passkey → one embedded wallet per user |
| Account | Kernel smart account (EntryPoint v0.7), counterfactual until first op |
| Gas sponsorship | **Built in** — Pimlico paymaster sponsors userOps; users hold ~0 MON |
| Batching (splits!) | **Native** — `sendTransaction({ calls: [...] })` |
| Recovery | Privy-managed auth + smart-account owners; ≥2 login methods per user |
| Bounty | Privy ($5,000) / Dynamic ($5,000 fallback) |
| Monad support | Official template repo (`next-serwist-privy-smart-wallet`) |

**Setup (Day 1):** create the Privy app (App ID), configure social + passkey login
methods, create the Pimlico paymaster with sponsor funds, deploy the first smart
account, and send one sponsored tx end-to-end.

### 3.1 Account primitives

- **EntryPoint (Path B only):** v0.7 at `0x0000000071727De22E5E9d8BAf0edAc6f37da032`
  (v0.6 / v0.8 also deployed — see Appendix A). Official Monad template uses **Kernel + EP v0.7**.
- **P256 precompile — VERIFIED AVAILABLE** at **`0x0100` per EIP-7951** (supersedes RIP-7212;
  identical address/interface). Enables cheap on-chain WebAuthn verification if we later want
   passkey signatures validated *on-chain*:
  ```solidity
  address constant P256_VERIFY = address(0x0100);
  function verifyP256(bytes32 h, uint256 r, uint256 s, uint256 qx, uint256 qy)
      internal view returns (bool ok)
  {
      (bool success, bytes memory res) = P256_VERIFY.staticcall(abi.encodePacked(h, r, s, qx, qy));
      return success && res.length == 32 && abi.decode(res, (uint256)) == 1;
  }
  ```
   Note: relevant only for a true on-chain-WebAuthn smart account — keep as a [prod] option.
- **Contract size limit is 128 kb** on Monad (vs 24.5 kb) — fewer proxies, simpler contracts.
- **Session keys**: prompting per transaction kills UX. Use a scoped session-key module:
  ```
  SessionPolicy { maxUsdPerTx, maxUsdPerDay, allowedSelectors[], expiresAt, revocable }
  ```
  Streams `pause/cancel/topUp` and small sends use the session; large sends re-prompt the passkey.


### 3.2 Recovery

- Multiple passkeys per account (≥2 devices).
- **[prod]** Time-locked social/guardian recovery + account-freeze flow (emit
  `AccountFrozen`, halt session keys, require fresh passkey + delay to unfreeze).
- Never a server-held "backup key" for user funds.

### 3.3 Username registry (hybrid)

On-chain canonical truth; off-chain cache for speed.

```solidity
contract UsernameRegistry {
    // usernameHash = keccak256(normalize(username))
    mapping(bytes32 => address) public ownerOf;
    // last registered timestamp => anti-squatting fee curve / auction (prod)
    function register(bytes32 usernameHash, address owner) external; // via account
    function resolve(bytes32 usernameHash) external view returns (address);
}
```

- **Never resolve usernames through a backend-only table for payment routing** — a compromised
  backend must not be able to redirect a payment. Backend caches registry for lookup UX, but the
  "final address used in a userOp calldata" is fetched from chain at build time.
- Registration via account owner with fee [v1 cheap / prod anti-squat: reserved names,
  normalized lowercase, homoglyph blacklist, renewal).

---

## 4. Smart contracts

```
contracts/
├── UsernameRegistry.sol          §3.3
├── SessionKeyModule.sol          §3.1 (spend limits, revocation)
├── FluxPay.sol                   single `settleBatch` — P2P + batches (atomic multicall)
├── PaymentLinkEscrow.sol         §4.2  recipient-bound claim links
├── SplitManager.sol              §4.3  collect & disburse
└── StreamVault.sol               §4.1  per-second pull-payment vault
```

All value-holding contracts: **immutable core + minimal upgradable shell**, or fully immutable
with versioned migration + registry pointer. **No UUPS on the vault itself [prod stance]:**
migration risk is cheaper than upgrade risk for a contract that holds user escrow.

**Key invariants (Foundry invariant tests):**
1. `sum(unclaimed) + sum(withdrawn) == vault token balance` (per asset).
2. Stream accrual is monotonic and never exceeds deposit.
3. Pause/cancel atomically settles accrued-to-timestamp; refundable remainder returns to owner.
4. Link funds claimable only by the bound recipient; expiry refund only to depositor.
5. Reentrancy: pull-only transfers, `ReentrancyGuard`, CEI ordering.

### 4.1 StreamVault — per-second billing done correctly

**Math problem:** USDC = 6 decimals. A $5/month stream = 5000000/2592000 ≈ **1.9 units/s**;
a $1/month stream = ~0.39 units/s → integer truncation steals money on low-rate streams.

**Solution: internal 18-decimal scaling, remainder-preserving:**

```solidity
// rate stored scaled by 1e18: ratePerSecondX18 = (amountPerSecond) * 1e18
struct Stream {
    address owner;                 // payer
    address recipient;
    IERC20 token;                  // USDC
    uint96  ratePerSecondX18;      // token units per second, *1e18
    uint64  createdAt;
    uint64  pausedAt;              // 0 = running
    uint64  totalPausedSeconds;    // for accrual math
    uint128 deposited;             // lifetime funded (whole units)
    uint128 unclaimedX18;          // accrued but unpaid, *1e18 (holds dust)
}
```

```solidity
function withdrawable(Stream memory s, uint64 nowTs) internal pure
    returns (uint128 wholeUnits, uint128 dustX18)
{
    uint64 activeSeconds = nowTs - s.createdAt - s.totalPausedSeconds;
    if (s.pausedAt != 0) { /* freeze at pausedAt, no further accrual */ }
    uint256 accruedX18 = uint256(activeSeconds) * s.ratePerSecondX18;
    uint256 totalX18 = s.unclaimedX18 + accruedX18;
    uint256 capped   = min(totalX18, uint256(s.deposited) * 1e18);
    wholeUnits = uint128(capped / 1e18);
    dustX18    = uint128(capped % 1e18);   // carried, never lost
    return (wholeUnits, dustX18);
}
```

- **No per-second transactions.** Accrual is derived (time × rate), O(1), and materialized only
  on state changes: `pause / resume / topUp / withdraw / cancel / changeRate`.
- **Solvency strategy [v1]:** per-stream prefunded escrow — can never be insolvent; stream
  auto-stops at cap (`StreamExhausted` event; keeper tops up or cancels).
- **Solvency strategy [prod]:** shared deposit pool (Superfluid-style) lets N streams draw on one
  balance; requires liquidation + insolvency handling → out of [v1].
- **Keepers [prod]:** anyone can call `expire()` / `liquidate()` on elapsed-but-unsettled streams
  for a small bounty — trustless, no trusted cron.
- Chainlink CRE can drive lifecycle automation (expiry checks) for the **$3k Chainlink bounty**.

**Pause UX (the demo):** user hits pause → session-key userOp → mined next block (400 ms) →
~800 ms finality → feed shows `StreamPaused`; contract math freezes accrual at that timestamp.
Frontend interpolates tick per-second locally (wallet-clock drift is cosmetic; chain is truth).

### 4.2 Payment links — recipient-bound claims (anti front-running)

Problem: a "claim with secret" model leaks the secret into the mempool (claim tx reveals it),
letting a front-runner steal the escrow.

**Production model — recipient-bound, signed claim:**

1. Client mints ephemeral keypair `(E, e)`; link carries `secret`.
2. `PaymentLinkEscrow.deposit(linkId, amount, expiry, hashOf(e), recipientAllowed=any)` — or
   deposit to a *specific* known recipient.
3. Claimer (whoever holds the link) must prove knowledge of `e` by signing over their own
   account address **with** ephemeral key `E`: `sigE = sign_e(claimDigest(linkId, claimer))`.
4. `claim(linkId, claimer, sigE, proofOfE)`:
   - verify `recover(claimDigest, sigE) == E && hashOf(e) == storedHash` → binds funds to
     `claimer` specifically. A front-runner seeing the tx **cannot** redirect to themselves.
5. If `claimer` has no account yet → funds route to a counterfactual `FluxPay` recipient
   (deploy on claim via CREATE2) — still non-custodial.
6. Expiry: anyone may `refund(linkId)` to depositor after `expiry` (bounty for caller [prod]).

Implementation care: EIP-712 domain `{name, version, chainId, verifyingContract}` everywhere —
a link signed on testnet is **not** replayable on mainnet.

### 4.3 Splits (two modes, one contract)

- **Disburse mode:** payer → `SplitManager.disburse([(to, amt)…])` — single userOp, batch
  transfers, atomic. (Group dinner paid by one person.)
- **Collect mode [prod]:** organizer creates bill; each payer authorizes pull up to cap
  (ERC-2612 `permit` or session key); `finalize()` moves funds when threshold reached;
  `expire()` refunds stragglers. Push-over-permit, no custody.

---

## 5. Gas abstraction (users never hold MON)

**Goal:** users deposit USDC and pay/stream; they must never obtain MON to pay gas.

### 5.1 Monad's gas model changes the paymaster math — read this first

**Verified from Monad docs — Monad charges `gas_limit`, NOT `gas_used`:**

```
gas_paid = gas_limit × price_per_gas
```

This exists to support asynchronous execution (leaders build/vote on blocks before executing).
Consequences for us, all of them significant:

1. **Over-estimating gas costs real money.** On Ethereum an inflated `gas_limit` is free;
   on Monad we pay for every unit we reserve. Our paymaster budget is set by limits we choose,
   not by actual execution.
2. **Set gas limits explicitly for known-cost operations.** All Fluxpay operations have
   deterministic cost profiles (transfer, claim, pause, withdraw, batch-of-N). Benchmark each,
   hardcode a per-selector table with a small safety margin, and **never** rely on
   `eth_estimateGas` in the hot path — it costs latency *and* over-reserves.
   Ship `gasTable[selector] → limit` in the relayer config; regression-test it in CI.
3. **Never let a wallet pick the limit.** Documented MetaMask behavior: when `eth_estimateGas`
   reverts, it sets a very high limit — on Monad that gets charged in full. Our relayer always
   sets the limit.
4. **Batch aggressively.** Because a batch's limit is only modestly higher than a single op's,
   `SplitSettlement` batching N transfers is dramatically cheaper per-recipient than N txs.
   Same logic for stream `withdraw` sweeps — coalesce into one call per block window.
5. EIP-1559 is supported: `price_per_gas = min(base + priority, max)`; **min base fee =
   100 MON-gwei**; block gas limit **200M**; per-tx gas limit **30M**. The base-fee controller
   rises slower and falls faster than Ethereum's, so priority fee is the lever for latency.

### 5.2 Mechanism (ERC-4337 paymaster)

- **[v1] sponsored paymaster** (EntryPoint v0.7 `validatePaymasterUserOp` + `postOp`):
  Fluxpay pays gas, policy-gated to prevent drain. Best demo UX.
- **[prod] USDC paymaster** with fee oracle: charge a small USDC fee per userOp from a
  Fluxpay-held MON reserve. Because we're charged `gas_limit`, quote the user from the
  **gas table**, not from estimation — the quote is then exact, not probabilistic.

**Policy engine (critical — a free-gas paymaster is a DoS target, doubly so when limits are billed):**
```
Allow(userOp) = perUserDailyGasCap not exceeded
             AND globalDailyGasCap not exceeded
             AND target ∈ {StreamVault, FluxPay, LinkEscrow, SplitManager, UsernameRegistry}
             AND selector ∈ allowlist
             AND gasLimit ≤ gasTable[selector] × 1.2      ← hard ceiling, Monad-specific
```
That last clause is the Monad-specific defense: an attacker submitting a 30M-limit userOp would
otherwise drain the paymaster in a handful of transactions.

---

## 6. Backend services & data model

Modular monolith first ([v1]), extract to services when load demands. Every service stateless;
Postgres is shared truth for the read model + outbox.

### 6.1 Data model (Postgres) — key tables

```sql
users        (id uuid pk, default_username text unique, created_at)
passkeys     (id, user_id fk, account_address fk, credential_id, pubkey_x, pubkey_y,
              device_label, added_at, revoked_at)
accounts     (address pk, owner_user_id, deploy_tx_hash, deployed_at, deploy_status)
usernames    (username pk, username_hash, address, registered_at)          -- registry cache
payments     (intent_id uuid pk, idempotency_key unique, from_address, to_address,
              asset, amount, fee, status, userop_hash, tx_hash, block_num, log_index,
              created_at, confirmed_at)                                    -- append-only
links        (link_id, deposit_tx_hash, amount, expiry, ephemeral_pub_x, ephemeral_pub_y,
              status[open|claimed|refunded], claimed_by, claimed_at)
streams      (stream_id, owner, recipient, asset, rate_x18, status[running|paused|exhausted|
              cancelled], created_at, paused_seconds, last_checkpoint)
checkpoints  (stream_id, kind, at_ts, amount_x18, tx_hash)                 -- audit trail
split_bills  (bill_id, organizer, asset, status, threshold, expires_at)
feed_events  (event_id, event_type, actor, payload jsonb, confirmed bool, created_at)
userops      (intent_id fk, ep_version, sender, nonce, call_data_hash, paymaster, status,
              attempts, last_error, submitted_at, mined_at, replaced_by)
outbox       (id bigserial pk, topic, payload jsonb, delivered_at)         -- reliable events
notifications(recipient_address, kind, payload, read_at)
```

Indexes: `payments(to_address, confirmed_at DESC)`, `streams(owner)`, `streams(recipient)`,
`feed_events(actor, event_id DESC)`, `userops(idempotency_key UNIQUE)`.

### 6.2 API surface (REST + WebSocket)

```
POST /auth/passkey/register       challenge issue + counterfactual address
POST /auth/passkey/assert         login -> short-lived JWT bound to passkey
POST /pay/intents                 create send (userOp intent; returns quote, gasEst)
POST /pay/intents/:id/sign        client returns userOpHash signature
POST /pay/intents/:id/submit      relayer pushes userOp, returns tx hash
GET  /activity?cursor=            feed (cursor pagination)
WS   /ws/activity                 live feed, per-user channels
POST /links                       create link (returns URL with secret fragment)
POST /links/:linkId/claim         recipient-bound claim
POST /links/:linkId/refund        (after expiry)
POST /streams  PATCH /streams/:id (create / pause / resume / topUp / cancel)
POST /splits                      disburse or create collect-bill
GET  /balances/:address           multicall USDC + MON balance, cached, event-invalidated
```

Every mutation: `Idempotency-Key` header; duplicate submission returns original result
(replays are safe at the API layer AND at the userOp nonce layer).

### 6.3 Relayer & userOp state machine

```text
CREATED → QUOTED → SIGNED(by client) → SUBMITTED → MINED → CONFIRMED
                                        └→ REJECTED → RETRY(expo backoff + gas bump)
                                        └→ REVERTED  → SURFACE_TO_USER
```

- One writer per sender account (nonce safety); queue (BullMQ/Temporal) with lease & retry.
- **[prod]** multiple bundler providers w/ failover; fee bump & replace-by-nonce on
  congestion; alert on `REVERTED` (should be ~0 for well-formed userOps).
- Postgres `userops` is the durable journal — relayer is crash-safe.

### 6.4 Indexer & real-time pipeline

Monad finality ~800 ms → optimistic UI with a confirm step is safe.

```
chain logs ─► Envio HyperIndex (contract-specific consumers, ordered per contract)
            ─► normalizers ─► outbox ─► Postgres upsert (tx_hash, log_index unique)
            ─► Redis pub/sub ─► WS gateway ─► client
```

- **Idempotency:** `(block, txHash, logIndex)` unique; consumers commit per-contract cursor.
- **Reorg handling:** Envio emits reorgs → consumers delete events above new head and re-apply.
  Monad's finality makes reorg windows rare; verify flags on `feed_events.confirmed`.
- **Reconciliation job [prod]:** periodic full-range scan detects dropped events (self-heal).
- **Backfill:** replay from `deploy_block` when adding a new consumer.

---

## 7. Security & threat model

| Threat | Mitigation |
|---|---|
| Server compromise steals funds | Impossible by construction — keys are device-side; server only relays signed intents; no server "master key" over user funds |
| Paymaster drained by bots | Policy engine §5: per-user + global caps, selector allowlist; session-key boundaries |
| Link claim front-running | Recipient-bound signed claim §4.2; secret never in query string |
| Username squatting / payment redirect | On-chain registry as truth; canonical fetch at userOp build time; reserved names, homoglyph filter, registration fee/curve [prod] |
| Signature replay (cross-chain) | EIP-712 with chainId + verifyingContract everywhere; userOp chainId validated |
| Malleable / missing P256 checks | Validate `r,s` ranges; verify `s` low-form; check authenticator origin/RP-ID (WebAuthn) in client + validator |
| Stream griefing (dust / cancel-lock) | min duration + min rate; cancel always allowed by owner; keepers settle elapsed streams |
| Reentrancy / CEI | `ReentrancyGuard`, pull-only withdrawals, checks-effects-interactions, invariant fuzz suite |
| Oracle/gas abuse (USDC paymaster) | fee oracle w/ deviation bounds; reserve monitor + circuit breaker [prod] |
| Sanctions / AML | Screen deposit & withdrawal addresses (TRM/Elliptic) at boundaries [prod]; travel-rule where applicable |

**Keys:** relayer/paymaster keys in KMS/HSM (never env vars in prod). Rotation + signing
quota. Backend secrets via vault; least-privilege IAM; network isolation for DB/Redis.

---

## 8. Observability, reliability, scaling

**Metrics (Prometheus + Grafana):**
- API RED; userOp latency breakdown; **p95 send→feed-update**; indexer lag (blocks & s);
- paymaster reserve USD + MON; WS connected/errors; `REVERTED` count; keeper jobs.

**Traces (OTel):** one trace id across client → intent → userOp → tx → indexer → WS push,
so a slow feed update is diagnosable end-to-end.

**SLOs / alerts:** indexer lag > 2 blocks, paymaster reserve < 48 h runway, WS error spike,
revert rate > 0.1%, send p95 > 2 s. Runbooks linked per alert.

**Scaling:**
- Stateless API/WS horizontally; WS nodes subscribe to Redis pub/sub (per-user channel).
- Indexer: one ordered consumer per contract; parallelize across contracts.
- Postgres: read replicas for `/activity` + `/balances`; primary for writes.
- Balances via `eth_call` multicall, cached 1 s, invalidated by indexer events.

---

## 9. Infrastructure & environments

```
local:  foundry anvil --fork monad-testnet   + docker-compose (pg, redis)
testnet: CI → build → migrate → deploy contracts (CREATE2, verified) → integration suite → staging
mainnet [prod]: IaC (Terraform) · k8s/Fly · managed pg/redis (multi-AZ) · blue-green · feature flags
```

- **Deterministic deployments:** CREATE2 + factory → same addresses everywhere; addresses
  committed to repo `deployments/`.
- DB migrations: gated, backward-compatible (expand→migrate→contract).
- Secrets: injected from vault at deploy; never in images.
- RPC failover (Alchemy + QuickNode + self-hosted); bundler failover.

---

## 10. Failure modes

| Failure | Behavior |
|---|---|
| RPC down | Multi-provider failover; reads degrade to cache; queue userOps |
| Bundler down | Second bundler; retry queue w/ bump |
| Paymaster reserve low | Circuit breaker: new userOps paused, existing streams unaffected (they're on-chain) |
| Indexer lag | Feed shows last confirmed cursor + "syncing" banner; no wrong data (only stale) |
| UserOp reverted | Deterministic surfacing; user retries; invariant tests keep this rare |
| Reorg | Events deleted/re-applied by Envio; no double-credit due to (tx_hash, log_index) idempotency |
| Stream exhausts mid-run | Auto-stop event; recipient notified; funds already streamed are claimable |

---

## 11. v1 → production phase map

| Area | [v1] hackathon | [prod] |
|---|---|---|
| Accounts | Privy (social + passkey) + session key | Pin validators, RIP-7212 path, recovery/guardians, spend-limit modules |
| Paymaster | Sponsored, policy-gated | USDC paymaster + fee oracle + reserve ops |
| Streams | Prefunded per-stream escrow | Shared pool + liquidation |
| Links | Recipient-bound signed claim | Expiry bounty, sanctions check |
| Indexer | Envio + Postgres | Multi-consumer sharding, reconciliation |
| Compliance | — | Sanctions, KYC-light at ramp boundaries, travel rule |
| Infra | single deploy | IaC multi-AZ, multi-RPC, multi-bundler |
| Testing | unit + invariant fuzz | audit, formal-verifiable core, chaos drills |

---

## Appendix A — Verified Monad parameters (checked against docs.monad.xyz)

### Networks

| | Testnet | Mainnet |
|---|---|---|
| Chain ID | **10143** | **143** |
| RPC | `https://testnet-rpc.monad.xyz` (QuickNode, 50 rps; 25 rps for `eth_call`/`eth_estimateGas`) · `https://rpc-testnet.monadinfra.com` (MF, 20 rps, archive) | `https://rpc.monad.xyz` (QuickNode) · `rpc1` Alchemy · `rpc2` Goldsky · `rpc3` Ankr |
| WS | `wss://testnet-rpc.monad.xyz` | `wss://rpc.monad.xyz` |
| Explorer | `testnet.monadvision.com` · `testnet.monadscan.com` | `monadvision.com` · `monadscan.com` |
| Faucet | `https://faucet.monad.xyz` | — |
| Version | v0.15.2 / `MONAD_NINE` | v0.15.2 / `MONAD_NINE` |
| UserOp explorer | Jiffyscan (`jiffyscan.xyz/?network=monad`) | same |

> Testnet was reset from genesis on 2025-12-16 — do not rely on pre-reset addresses.

### Canonical contracts (same addresses on testnet + mainnet unless noted)

| Contract | Address |
|---|---|
| **EntryPoint v0.7** (use this) | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| EntryPoint v0.8 | `0x4337084d9e255fF0702461CF8895cE9E3b5Ff108` |
| EntryPoint v0.6 | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` |
| SenderCreator v0.7 (mainnet) | `0xEFC2c1444eBCC4Db75e7613d20C6a62fF67A167C` |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` |
| Permit2 | `0x000000000022d473030f116ddee9f6b43ac78ba3` |
| CreateX | `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed` |
| Foundry deterministic deployer | `0x4e59b44847b379578588920ca78fbf26c0b4956c` |
| ERC-6492 UniversalSigValidator | `0xdAcD51A54883eb67D95FAEb2BBfdC4a9a6BD2a3B` |
| x402 ExactPermit2Proxy | `0x402085c248EeA27D92E8b30b2C58ed07f9E20001` |
| x402 UptoPermit2Proxy | `0x4020A4f3b7b90ccA423B9fabCc0CE57C6C240002` |
| WMON (testnet) | `0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541` |
| WMON (mainnet) | `0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A` |

### Precompiles

| Address | Function |
|---|---|
| `0x01`–`0x11` | All Ethereum precompiles as of Fusaka |
| **`0x0100`** | **P256 / secp256r1 verification (EIP-7951)** — WebAuthn/passkey verification on-chain |
| `0x1000` | Staking precompile |

EIP-7951 supersedes RIP-7212 — identical address/interface, renamed designation.

### Settlement assets (mainnet addresses; testnet list in `monad-crypto/token-list`)

| Symbol | Address | Bridge |
|---|---|---|
| **USDC** (primary) | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` | Circle CCTP (17 chains) |
| **AUSD** (Agora — bounty) | `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a` | LayerZero OFT |
| USDT0 | `0xe7cd86e13AC4309349F30B3435a9d337750fC82D` | LayerZero OFT |
| mUSD (MetaMask) | `0xacA92E438df0B2401fF60dA7E4337B687a2435DA` | Hyperlane |

Assume **6 decimals** for USDC/AUSD — confirm on-chain via `decimals()` at deploy time and
store per-asset in config; the StreamVault X18 scaling (§4.1) makes the app decimal-agnostic.

### Gas & execution

| Parameter | Value |
|---|---|
| **Gas charged** | **`gas_limit`, not `gas_used`** — reserving gas costs money |
| Pricing | EIP-1559: `price_per_gas = min(base + priority, max)` |
| Min base fee | 100 MON-gwei (`100 × 10⁻⁹ MON`) |
| Block gas limit | 200M |
| Per-tx gas limit | 30M |
| Base-fee controller | slower rises, faster falls than Ethereum |
| Tx ordering | Priority Gas Auction (descending total gas price) |
| Max contract size | **128 kb** (vs 24.5 kb Ethereum) |
| Opcodes | Fusaka-complete, minor repricings |

### Resolved during lookup (see §3.0)

1. **Mera evaluated and dropped (Privy-only decision).** Mera is an EOA-from-passkey lib,
   NOT 4337: derives a BIP-44 key from WebAuthn PRF, no deployment, no bundler, no native
   gas sponsorship — and critically, **no social logins**. Constraints that sealed it:
   PRF-capable authenticator (desktop Chrome = Google Password Manager only), HTTPS required,
   accounts bound to `rpId` (domain). → §3.0.
2. **Pimlico is confirmed on Monad testnet** and is Monad's documented sponsored-tx stack
   (Kernel + EntryPoint v0.7). Official template repo:
   `github.com/monad-developers/next-serwist-privy-smart-wallet` (PWA + Privy + Pimlico +
   web-push notifications + batch sponsored `calls`). → Path B.
3. **EIP-7702 is supported on Monad** (tx type `0x04`): EOAs can delegate to account code for
   batching/session-keys/gas sponsorship; a sponsor can submit the authorization. **Gotchas:**
   delegated EOAs can't dip below **10 MON** reserve; delegated code can't `CREATE`/`CREATE2`. → Path A.
4. **Bundler gas-limit behavior:** Monad bills `gas_limit`. The official template's
   `sendTransaction` still lets the client pass `data` but we must **set explicit gas limits**
   (e.g. a hardcoded `gasTable`), not `eth_estimateGas`, for sponsored paths.

### Still to verify (blocks nothing in [v1])

1. Whether Pimlico's Monad bundler honors explicitly-set `callGasLimit`/`verificationGasLimit`
   or pads them (test with a 2-tx batch on testnet, read actual charge).
2. Testnet USDC/AUSD addresses from `tokenlist-testnet.json` (mainnet values confirmed above).
3. **Envio HyperIndex** reorg semantics on Monad specifically (docs have a Monad+Envio guide).
4. Whether MPP (`@monad-crypto/mpp`) is a better fit than raw x402 for agent-payments stretch.

### Useful Monad-specific docs for the build

- Wallet Developer Integration Guide — `docs.monad.xyz/developer-essentials/wallet-developers`
- Best Practices for High Performance Apps — `/developer-essentials/best-practices`
- Reserve Balance semantics — `/developer-essentials/reserve-balance`
- Next.js PWA + sponsored transactions templates — `/templates/next-serwist-privy-smart-wallet`
- Envio HyperIndex guide on Monad — `/guides/indexers/tg-bot-using-envio`
- MPP overview — `/reference/mpp/overview`

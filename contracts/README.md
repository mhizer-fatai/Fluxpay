# FluxPay contracts (Foundry)

Solidity sources for the FluxPay protocol on Monad testnet (chain 10143).

## Build & test

Dependencies are not vendored — install them once:

```bash
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts
forge build
forge test
```

Requires Foundry (`forge`) and Solidity 0.8.28 (see `foundry.toml`).

## Layout

| Path | What |
|---|---|
| `src/FluxPay.sol` | P2P settlement + atomic batch (`settle`, `settleBatch`) |
| `src/StreamVault.sol` | Per-second prefunded payment streams (X18 accrual, pause/resume/cancel) |
| `src/UsernameRegistry.sol` | Username ↔ address binding (commit-reveal registration) |
| `src/PaymentLinkEscrow.sol` | Recipient-bound claim links with ephemeral-key proofs |
| `src/EarnVault.sol` | ERC-4626 vault with a swappable yield strategy |
| `src/MockYieldStrategy.sol` | Testnet yield source (fixed rate, reserve-capped, vault-only) |
| `src/mocks/MockUSDC.sol` | Testnet-only mock (open mint) — never deploy to mainnet |

## Deploy

```bash
PRIVATE_KEY=0x... forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast
PRIVATE_KEY=0x... EARN_YIELD_SEED=5000000 forge script script/DeployEarn.s.sol --rpc-url monad_testnet --broadcast
```

Recorded addresses live in `../deployments/10143.json`.

import { formatUnits, type Hex } from "viem";
import { Redis } from "ioredis";
import { config } from "./config.js";
import { publicClient } from "./chain.js";
import { query } from "./db/pool.js";
import { logger } from "./lib/logger.js";

type EvInput = { name: string; type: string; indexed: boolean };
interface EvDef { type: "event"; name: string; inputs: EvInput[] }
const ev = (name: string, inputs: Array<[string, string, boolean]>): EvDef => ({
  type: "event" as const,
  name,
  inputs: inputs.map(([n, t, indexed]): EvInput => ({ name: n, type: t, indexed })),
});

const paymentSettledEvent = ev("PaymentSettled", [["from", "address", true], ["to", "address", true], ["amount", "uint256", false], ["token", "address", true]]);
const batchSettledEvent = ev("BatchSettled", [["from", "address", true], ["total", "uint256", false], ["count", "uint256", false], ["token", "address", true]]);
const usernameRegisteredEvent = ev("UsernameRegistered", [["usernameHash", "bytes32", true], ["owner", "address", true], ["username", "string", false]]);
const streamOpenedEvent = ev("StreamOpened", [["id", "uint256", true], ["owner", "address", true], ["recipient", "address", true], ["token", "address", false], ["ratePerSecondX18", "uint96", false]]);
const streamTopUpEvent = ev("StreamTopUp", [["id", "uint256", true], ["amount", "uint256", false]]);
const streamPausedEvent = ev("StreamPaused", [["id", "uint256", true]]);
const streamResumedEvent = ev("StreamResumed", [["id", "uint256", true]]);
const streamWithdrawnEvent = ev("StreamWithdrawn", [["id", "uint256", true], ["recipient", "address", true], ["amount", "uint256", false]]);
const streamCancelledEvent = ev("StreamCancelled", [["id", "uint256", true], ["paidOut", "uint256", false], ["refunded", "uint256", false]]);
const linkCreatedEvent = ev("LinkCreated", [["linkId", "bytes32", true], ["depositor", "address", true], ["token", "address", true], ["amount", "uint256", false], ["expiry", "uint40", false]]);
const linkClaimedEvent = ev("LinkClaimed", [["linkId", "bytes32", true], ["claimer", "address", true], ["token", "address", true], ["amount", "uint256", false]]);
const linkRefundedEvent = ev("LinkRefunded", [["linkId", "bytes32", true], ["depositor", "address", true], ["amount", "uint256", false]]);
const wmonDepositEvent = ev("Deposit", [["dst", "address", true], ["wad", "uint256", false]]);
const wmonWithdrawalEvent = ev("Withdrawal", [["src", "address", true], ["wad", "uint256", false]]);
const erc20TransferEvent = ev("Transfer", [["from", "address", true], ["to", "address", true], ["value", "uint256", false]]);

const streamStructAbi = [
  { type: "function", name: "streams", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [
    { name: "owner", type: "address" }, { name: "recipient", type: "address" }, { name: "token", type: "address" },
    { name: "ratePerSecondX18", type: "uint96" }, { name: "createdAt", type: "uint64" }, { name: "pausedAt", type: "uint64" },
    { name: "lastFoldTs", type: "uint64" }, { name: "deposited", type: "uint128" }, { name: "unclaimedX18", type: "uint256" },
    { name: "cancelled", type: "bool" },
  ] },
] as const;

const POLL_INTERVAL_MS = 4000;
const CATCHUP_BLOCKS = 20n;
// Providers cap eth_getLogs (public Monad RPC = 100 blocks, QuickNode = 1000).
// Cap each tick's range so a large catch-up can never exceed the limit and fail
// forever; it drains in bounded windows across ticks instead.
const MAX_BLOCKS_PER_TICK = 900n;

interface WatchedEvent {
  type: string;
  addresses: string[];
  payload: Record<string, unknown>;
  txHash: Hex;
  blockNumber: bigint;
}

let publisher: Redis | null = null;

async function publish(event: WatchedEvent): Promise<void> {
  const message = JSON.stringify({
    type: event.type,
    txHash: event.txHash,
    blockNumber: event.blockNumber.toString(),
    ...event.payload,
  });
  for (const address of event.addresses) {
    await query(
      `INSERT INTO feed_events (event_type, actor, payload, confirmed)
       VALUES ($1, $2, $3, true)`,
      [event.type, address, message],
    );
    if (publisher) {
      try {
        await publisher.publish(`user:${address}`, message);
      } catch (err) {
        logger.warn("redis_publish_failed", { error: String(err) });
      }
    }
  }
}

const TOKEN_DECIMALS: Array<[string | undefined, number]> = [
  [config.contracts.usdc, 6],
  [config.contracts.ausd, 6],
  [config.contracts.kusdc, 6],
];
function decimalsFor(token: string): number {
  for (const [addr, dec] of TOKEN_DECIMALS) {
    if (addr && addr.toLowerCase() === token.toLowerCase()) return dec;
  }
  return 18;
}
function tokenLabel(token: string): string {
  const known = Object.entries(config.contracts).find(([, addr]) => addr && addr.toLowerCase() === token.toLowerCase());
  return known ? known[0] : token.slice(0, 10);
}
function fmt(raw: bigint, token: string): number {
  return Number(formatUnits(raw, decimalsFor(token)));
}

async function streamParties(id: bigint): Promise<{ owner: string; recipient: string; token: string } | null> {
  if (!config.contracts.streamVault) return null;
  try {
    const s = (await publicClient.readContract({
      address: config.contracts.streamVault as Hex,
      abi: streamStructAbi,
      functionName: "streams",
      args: [id],
    })) as unknown as readonly [string, string, string];
    if (!s[0] || s[0] === "0x0000000000000000000000000000000000000000") return null;
    return { owner: s[0], recipient: s[1], token: s[2] };
  } catch {
    return null;
  }
}

/**
 * Polls recent blocks for every FluxPay-family event, records them in feed_events and
 * pushes to Redis user channels (fanned out by the WS gateway). Ranges are tiny
 * (poll interval), so the 100-block RPC getLogs cap never bites.
 */
export function startChainWatcher(): void {
  if (!config.contracts.fluxPay) {
    logger.warn("watcher_disabled", { reason: "FLUXPAY_ADDRESS not configured" });
    return;
  }
  try {
    publisher = new Redis(config.redisUrl);
  } catch {
    logger.warn("watcher_redis_unavailable", {});
  }

  const C = {
    fluxPay: config.contracts.fluxPay as Hex,
    registry: config.contracts.registry as Hex | undefined,
    streamVault: config.contracts.streamVault as Hex | undefined,
    linkEscrow: config.contracts.linkEscrow as Hex | undefined,
    wmon: config.contracts.wmon as Hex | undefined,
  };

  // ERC-20 tokens whose Transfer events we index, so activity covers every
  // supported asset (not just FluxPay settlements). Native MON is handled
  // separately — it emits no logs.
  const TOKEN_CONTRACTS: Array<[string, string | undefined]> = [
    ["usdc", config.contracts.usdc],
    ["ausd", config.contracts.ausd],
    ["weth", config.contracts.weth],
    ["wmon", config.contracts.wmon],
    ["kusdc", config.contracts.kusdc],
  ];

  let lastProcessed: bigint | null = null;
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const latest = await publicClient.getBlockNumber();
      if (lastProcessed === null) {
        lastProcessed = latest > CATCHUP_BLOCKS ? latest - CATCHUP_BLOCKS : 0n;
      }
      if (latest <= lastProcessed) return;

interface LogLike { transactionHash: Hex; blockNumber: bigint; args: Record<string, any> }

      const fromBlock = lastProcessed + 1n;
      // Bound this tick's window (drains a backlog over successive ticks).
      const toBlock = latest - lastProcessed > MAX_BLOCKS_PER_TICK
        ? lastProcessed + MAX_BLOCKS_PER_TICK
        : latest;

      const getLogs = async (address: Hex, event: EvDef): Promise<LogLike[]> => {
        try {
          const logs = await publicClient.getLogs({
            address, event: event as never, args: {} as never,
            fromBlock, toBlock,
          });
          return logs as unknown as LogLike[];
        } catch (err) {
          logger.warn("watcher_logs_failed", { address, from: fromBlock.toString(), to: toBlock.toString(), error: String(err) });
          return [];
        }
      };

      for (const log of await getLogs(C.fluxPay, paymentSettledEvent)) {
        const { from, to, amount, token } = log.args as unknown as { from: string; to: string; amount: bigint; token: string };
        await publish({
          type: "payment_settled", addresses: [from.toLowerCase(), to.toLowerCase()],
          payload: { from, to, token, tokenLabel: tokenLabel(token), amount: fmt(amount, token) },
          txHash: log.transactionHash, blockNumber: log.blockNumber,
        });
      }
      for (const log of await getLogs(C.fluxPay, batchSettledEvent)) {
        const { from, total, count, token } = log.args as unknown as { from: string; total: bigint; count: bigint; token: string };
        await publish({
          type: "batch_settled", addresses: [from.toLowerCase()],
          payload: { from, token, tokenLabel: tokenLabel(token), amount: fmt(total, token), count: count.toString() },
          txHash: log.transactionHash, blockNumber: log.blockNumber,
        });
      }

      // Plain ERC-20 transfers for every supported token — covers sends/swaps/faucet
      // that never touch FluxPay, so Activity shows all assets, not just USDC.
      // Transfers to/from a FluxPay-family contract are skipped: those already
      // emit their own specific event (payment_settled, link_*, stream_*), and
      // indexing the raw Transfer too would double-list them.
      const family = [C.fluxPay, config.contracts.splitManager, C.linkEscrow, C.streamVault]
        .filter((a): a is string => Boolean(a))
        .map(a => a.toLowerCase());
      for (const [label, tokenAddr] of TOKEN_CONTRACTS) {
        if (!tokenAddr) continue;
        for (const log of await getLogs(tokenAddr as Hex, erc20TransferEvent)) {
          const { from, to, value } = log.args as unknown as { from: string; to: string; value: bigint };
          if (family.includes(from.toLowerCase()) || family.includes(to.toLowerCase())) continue;
          await publish({
            type: "token_transfer",
            addresses: [from.toLowerCase(), to.toLowerCase()],
            payload: { from, to, token: tokenAddr, tokenLabel: label, amount: fmt(value, tokenAddr) },
            txHash: log.transactionHash, blockNumber: log.blockNumber,
          });
        }
      }

      if (C.registry) {
        for (const log of await getLogs(C.registry, usernameRegisteredEvent)) {
          const { owner, username } = log.args as unknown as { owner: string; username: string };
          await publish({
            type: "username_registered", addresses: [owner.toLowerCase()],
            payload: { owner, username },
            txHash: log.transactionHash, blockNumber: log.blockNumber,
          });
        }
      }

      if (C.streamVault) {
        for (const log of await getLogs(C.streamVault, streamOpenedEvent)) {
          const { id, owner, recipient, token } = log.args as unknown as { id: bigint; owner: string; recipient: string; token: string };
          await publish({
            type: "stream_opened", addresses: [owner.toLowerCase(), recipient.toLowerCase()],
            payload: { streamId: id.toString(), owner, recipient, token, tokenLabel: tokenLabel(token) },
            txHash: log.transactionHash, blockNumber: log.blockNumber,
          });
        }
        for (const log of await getLogs(C.streamVault, streamWithdrawnEvent)) {
          const { id, recipient, amount } = log.args as unknown as { id: bigint; recipient: string; amount: bigint };
          const parties = await streamParties(id);
          const token = parties?.token ?? "";
          await publish({
            type: "stream_withdrawn",
            addresses: [recipient.toLowerCase(), ...(parties ? [parties.owner.toLowerCase()] : [])],
            payload: { streamId: id.toString(), recipient, amount: token ? fmt(amount, token) : amount.toString(), token, tokenLabel: token ? tokenLabel(token) : "" },
            txHash: log.transactionHash, blockNumber: log.blockNumber,
          });
        }
        for (const log of await getLogs(C.streamVault, streamTopUpEvent)) {
          const { id, amount } = log.args as unknown as { id: bigint; amount: bigint };
          const parties = await streamParties(id);
          if (!parties) continue;
          await publish({
            type: "stream_topup", addresses: [parties.owner.toLowerCase(), parties.recipient.toLowerCase()],
            payload: { streamId: id.toString(), amount: fmt(amount, parties.token), token: parties.token, tokenLabel: tokenLabel(parties.token) },
            txHash: log.transactionHash, blockNumber: log.blockNumber,
          });
        }
        for (const log of await getLogs(C.streamVault, streamCancelledEvent)) {
          const { id, paidOut, refunded } = log.args as unknown as { id: bigint; paidOut: bigint; refunded: bigint };
          const parties = await streamParties(id);
          if (!parties) continue;
          await publish({
            type: "stream_cancelled", addresses: [parties.owner.toLowerCase(), parties.recipient.toLowerCase()],
            payload: { streamId: id.toString(), owner: parties.owner, recipient: parties.recipient, paidOut: fmt(paidOut, parties.token), refunded: fmt(refunded, parties.token), token: parties.token, tokenLabel: tokenLabel(parties.token) },
            txHash: log.transactionHash, blockNumber: log.blockNumber,
          });
        }
        for (const log of await getLogs(C.streamVault, streamPausedEvent)) {
          const { id } = log.args as unknown as { id: bigint };
          const parties = await streamParties(id);
          if (!parties) continue;
          await publish({
            type: "stream_paused", addresses: [parties.owner.toLowerCase(), parties.recipient.toLowerCase()],
            payload: { streamId: id.toString() },
            txHash: log.transactionHash, blockNumber: log.blockNumber,
          });
        }
        for (const log of await getLogs(C.streamVault, streamResumedEvent)) {
          const { id } = log.args as unknown as { id: bigint };
          const parties = await streamParties(id);
          if (!parties) continue;
          await publish({
            type: "stream_resumed", addresses: [parties.owner.toLowerCase(), parties.recipient.toLowerCase()],
            payload: { streamId: id.toString() },
            txHash: log.transactionHash, blockNumber: log.blockNumber,
          });
        }
      }

      if (C.linkEscrow) {
        for (const log of await getLogs(C.linkEscrow, linkCreatedEvent)) {
          const { linkId, depositor, token, amount } = log.args as unknown as { linkId: string; depositor: string; token: string; amount: bigint };
          await publish({
            type: "link_created", addresses: [depositor.toLowerCase()],
            payload: { linkId, depositor, token, tokenLabel: tokenLabel(token), amount: fmt(amount, token) },
            txHash: log.transactionHash, blockNumber: log.blockNumber,
          });
        }
        for (const log of await getLogs(C.linkEscrow, linkClaimedEvent)) {
          const { linkId, claimer, token, amount } = log.args as unknown as { linkId: string; claimer: string; token: string; amount: bigint };
          await publish({
            type: "link_claimed", addresses: [claimer.toLowerCase()],
            payload: { linkId, claimer, token, tokenLabel: tokenLabel(token), amount: fmt(amount, token) },
            txHash: log.transactionHash, blockNumber: log.blockNumber,
          });
        }
        for (const log of await getLogs(C.linkEscrow, linkRefundedEvent)) {
          const { linkId, depositor, amount } = log.args as unknown as { linkId: string; depositor: string; amount: bigint };
          await publish({
            type: "link_refunded", addresses: [depositor.toLowerCase()],
            payload: { linkId, depositor, amount: amount.toString() },
            txHash: log.transactionHash, blockNumber: log.blockNumber,
          });
        }
      }

      if (C.wmon) {
        for (const log of await getLogs(C.wmon, wmonDepositEvent)) {
          const { dst, wad } = log.args as unknown as { dst: string; wad: bigint };
          await publish({
            type: "wrap", addresses: [dst.toLowerCase()],
            payload: { account: dst, amount: Number(formatUnits(wad, 18)) },
            txHash: log.transactionHash, blockNumber: log.blockNumber,
          });
        }
        for (const log of await getLogs(C.wmon, wmonWithdrawalEvent)) {
          const { src, wad } = log.args as unknown as { src: string; wad: bigint };
          await publish({
            type: "unwrap", addresses: [src.toLowerCase()],
            payload: { account: src, amount: Number(formatUnits(wad, 18)) },
            txHash: log.transactionHash, blockNumber: log.blockNumber,
          });
        }
      }

      lastProcessed = toBlock;
    } catch (err) {
      logger.warn("watcher_tick_failed", { error: err instanceof Error ? err.message : String(err) });
    } finally {
      running = false;
    }
  };

  void tick();
  const interval = setInterval(() => void tick(), POLL_INTERVAL_MS);
  logger.info("watcher_started", { intervalMs: POLL_INTERVAL_MS });
  void interval;
}

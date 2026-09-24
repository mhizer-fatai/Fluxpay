import { formatUnits, type Hex } from "viem";
import { Redis } from "ioredis";
import { config } from "./config.js";
import { publicClient } from "./chain.js";
import { query } from "./db/pool.js";
import { logger } from "./lib/logger.js";

const paymentSettledEvent = {
  type: "event" as const,
  name: "PaymentSettled",
  inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "amount", type: "uint256", indexed: false },
    { name: "token", type: "address", indexed: true },
  ],
};

const usernameRegisteredEvent = {
  type: "event" as const,
  name: "UsernameRegistered",
  inputs: [
    { name: "usernameHash", type: "bytes32", indexed: true },
    { name: "owner", type: "address", indexed: true },
    { name: "username", type: "string", indexed: false },
  ],
};

const POLL_INTERVAL_MS = 4000;
const CATCHUP_BLOCKS = 20n;

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

function tokenLabel(token: string): string {
  const known = Object.entries(config.contracts).find(([, addr]) => addr && addr.toLowerCase() === token.toLowerCase());
  return known ? known[0] : token.slice(0, 10);
}

/**
 * Polls recent blocks for FluxPay/registry events, records them in feed_events and
 * pushes to Redis user channels (fanned out by the WS gateway).
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

      const fromBlock = lastProcessed + 1n;
      const fluxPay = config.contracts.fluxPay as Hex;

      const payments = await publicClient.getLogs({
        address: fluxPay,
        event: paymentSettledEvent,
        args: {},
        fromBlock,
        toBlock: latest,
      });
      for (const log of payments) {
        const { from, to, amount, token } = log.args as { from: string; to: string; amount: bigint; token: string };
        const decimals = token.toLowerCase() === config.contracts.usdc?.toLowerCase() ? 6 : 18;
        await publish({
          type: "payment_settled",
          addresses: [from.toLowerCase(), to.toLowerCase()],
          payload: {
            from, to, token, tokenLabel: tokenLabel(token),
            amount: Number(formatUnits(amount, decimals)),
          },
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        });
      }

      if (config.contracts.registry) {
        const registrations = await publicClient.getLogs({
          address: config.contracts.registry as Hex,
          event: usernameRegisteredEvent,
          args: {},
          fromBlock,
          toBlock: latest,
        });
        for (const log of registrations) {
          const { owner, username } = log.args as { owner: string; username: string };
          await publish({
            type: "username_registered",
            addresses: [owner.toLowerCase()],
            payload: { owner, username },
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
          });
        }
      }

      lastProcessed = latest;
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

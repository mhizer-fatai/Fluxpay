import { WebSocketServer } from "ws";
import { Redis } from "ioredis";
import { config } from "../config.js";
import { verifyPrivyToken } from "../auth/privy.js";
import { assertAddressAccess } from "../services/accessService.js";
import { logger } from "../lib/logger.js";

/**
 * WebSocket gateway: subscribes to per-user Redis channels and fans events out to
 * connected clients. Connections are authenticated (Privy token) and scoped to an
 * address the caller owns. Channels are refcounted so one client disconnecting can
 * never silence another, and every live channel is re-subscribed after a Redis
 * reconnect.
 */
export function startWsGateway(server: import("http").Server): void {
  const wss = new WebSocketServer({ server, path: "/ws/activity" });
  let sub: Redis | null = null;
  let redisUp = false;
  /** address -> number of live sockets watching it */
  const subscribers = new Map<string, number>();

  const subscribe = (address: string): void => {
    const count = subscribers.get(address) ?? 0;
    subscribers.set(address, count + 1);
    if (count === 0 && sub && redisUp) {
      void sub.subscribe(`user:${address}`).catch(() => { redisUp = false; });
    }
  };

  const unsubscribe = (address: string): void => {
    const count = subscribers.get(address) ?? 0;
    if (count <= 1) {
      subscribers.delete(address);
      if (sub && redisUp) {
        void sub.unsubscribe(`user:${address}`).catch(() => { /* already down */ });
      }
      return;
    }
    subscribers.set(address, count - 1);
  };

  try {
    sub = new Redis(config.redisUrl, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 });
    // ioredis emits 'error' on every failed (re)connect — without a listener
    // Node throws and the whole backend dies. Swallow it: pub/sub just stays idle.
    sub.on("error", (err) => console.warn("[ws] redis error — pub/sub idle:", (err as Error).message));
    sub.on("message", (channel, message) => {
      const address = channel.replace("user:", "");
      for (const client of wss.clients) {
        if ((client as { address?: string }).address === address && client.readyState === 1) {
          client.send(message);
        }
      }
    });
    sub.on("ready", () => {
      redisUp = true;
      for (const address of subscribers.keys()) {
        void sub!.subscribe(`user:${address}`).catch(() => { redisUp = false; });
      }
    });
    sub.on("close", () => { redisUp = false });
    sub.on("end", () => { redisUp = false });
    void sub.connect().catch((err: Error) => console.warn("[ws] redis connect failed — pub/sub idle:", err.message));
  } catch { console.warn("[ws] Redis unavailable — pub/sub disabled"); }

  wss.on("connection", (socket, req) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const address = url.searchParams.get("address");
    const token = url.searchParams.get("token");
    if (!address) {
      socket.close(4000, "missing address");
      return;
    }
    if (!token) {
      socket.close(4001, "missing token");
      return;
    }
    const normalized = address.toLowerCase();
    void (async () => {
      try {
        const claims = await verifyPrivyToken(token);
        await assertAddressAccess(claims.userId, normalized);
      } catch (err) {
        logger.warn("ws_auth_rejected", { error: err instanceof Error ? err.message : String(err) });
        socket.close(4003, "unauthorized");
        return;
      }
      (socket as { address?: string }).address = normalized;
      subscribe(normalized);
      socket.on("close", () => unsubscribe(normalized));
    })();
  });
}

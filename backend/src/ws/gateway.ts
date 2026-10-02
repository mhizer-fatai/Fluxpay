import { WebSocketServer } from "ws";
import { Redis } from "ioredis";
import { config } from "../config.js";

/**
 * WebSocket gateway: subscribes to per-user Redis channels and fans events out to
 * connected clients. If Redis is unavailable (e.g. no Upstash set up yet), the
 * gateway still accepts connections but no events will fan out — the indexer can
 * later be wired to push directly via the WS server.
 */
export function startWsGateway(server: import("http").Server): void {
  const wss = new WebSocketServer({ server, path: "/ws/activity" });
  let sub: Redis | null = null;
  let redisUp = false;
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
    sub.on("ready", () => { redisUp = true });
    sub.on("close", () => { redisUp = false });
    sub.on("end", () => { redisUp = false });
    void sub.connect().catch((err: Error) => console.warn("[ws] redis connect failed — pub/sub idle:", err.message));
  } catch { console.warn("[ws] Redis unavailable — pub/sub disabled"); }

  wss.on("connection", (socket, req) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const address = url.searchParams.get("address");
    if (!address) {
      socket.close(4000, "missing address");
      return;
    }
    (socket as { address?: string }).address = address.toLowerCase();
    // Only touch Redis while connected — subscribe/unsubscribe on a dead client
    // rejects, and an unhandled rejection would take the backend down with it.
    if (sub && redisUp) {
      void sub.subscribe(`user:${address.toLowerCase()}`).catch(() => { redisUp = false });
    }
    socket.on("close", () => {
      if (sub && redisUp) {
        void sub.unsubscribe(`user:${address.toLowerCase()}`).catch(() => { /* already down */ });
      }
    });
  });
}

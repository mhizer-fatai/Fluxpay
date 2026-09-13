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
  try {
    sub = new Redis(config.redisUrl);
  } catch { console.warn("[ws] Redis unavailable — pub/sub disabled"); }

  if (sub) {
    sub.on("message", (channel, message) => {
      const address = channel.replace("user:", "");
      for (const client of wss.clients) {
        if ((client as { address?: string }).address === address && client.readyState === 1) {
          client.send(message);
        }
      }
    });
  }

  wss.on("connection", (socket, req) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const address = url.searchParams.get("address");
    if (!address) {
      socket.close(4000, "missing address");
      return;
    }
    (socket as { address?: string }).address = address.toLowerCase();
    if (sub) void sub.subscribe(`user:${address.toLowerCase()}`);
    socket.on("close", () => {
      if (sub) void sub.unsubscribe(`user:${address.toLowerCase()}`);
    });
  });
}

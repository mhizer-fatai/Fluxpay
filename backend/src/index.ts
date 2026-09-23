import express from "express";
import { createServer } from "node:http";
import { config } from "./config.js";
import { startWsGateway } from "./ws/gateway.js";
import { registryRouter } from "./routes/registry.js";
import { meRouter } from "./routes/me.js";

export function createApp(): express.Express {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, chainId: config.chain.id });
  });

  app.use("/api/v1/registry", registryRouter);
  app.use("/api/v1/me", meRouter);
  return app;
}

const app = createApp();
const server = createServer(app);
startWsGateway(server);

server.listen(config.port, () => {
  console.log(`[fluxpay-backend] listening on :${config.port}`);
});

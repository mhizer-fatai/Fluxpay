import express from "express";
import { createServer } from "node:http";
import { config } from "./config.js";
import { startWsGateway } from "./ws/gateway.js";
import { registryRouter } from "./routes/registry.js";

export function createApp(): express.Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, chainId: config.chain.id });
  });

  app.use("/api/v1/registry", registryRouter);
  return app;
}

const app = createApp();
const server = createServer(app);
startWsGateway(server);

server.listen(config.port, () => {
  console.log(`[fluxpay-backend] listening on :${config.port}`);
});

import express from "express";
import { createServer } from "node:http";
import { config } from "./config.js";
import { startWsGateway } from "./ws/gateway.js";
import { requestContextMiddleware } from "./middleware/requestContext.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { registryRouter } from "./routes/registry.js";
import { meRouter } from "./routes/me.js";
import { profileRouter } from "./routes/profile.js";
import { aaRouter } from "./routes/aa.js";
import { activityRouter } from "./routes/activity.js";
import { paymentLinkRouter } from "./routes/paymentLinks.js";
import { paymentRouter } from "./routes/payments.js";
import { priceRouter } from "./routes/prices.js";
import { startChainWatcher } from "./watcher.js";

export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.use(corsMiddleware);
  app.use(requestContextMiddleware);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, chainId: config.chain.id });
  });

  app.use("/api/v1/registry", registryRouter);
  app.use("/api/v1/me", meRouter);
  app.use("/api/v1/profile", profileRouter);
  app.use("/api/v1/aa", aaRouter);
  app.use("/api/v1/activity", activityRouter);
  app.use("/api/v1/payment-links", paymentLinkRouter);
  app.use("/api/v1/payments", paymentRouter);
  app.use("/api/v1/prices", priceRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = createApp();
const server = createServer(app);
startWsGateway(server);

server.listen(config.port, () => {
  console.log(`[fluxpay-backend] listening on :${config.port}`);
  startChainWatcher();
});

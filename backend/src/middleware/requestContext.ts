import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { runWithRequestContext, setRequestAuth } from "../context/requestContext.js";
import { logger } from "../lib/logger.js";

/** Assigns a request id, runs downstream handlers inside AsyncLocalStorage, and logs completion. */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.header("x-request-id") ?? randomUUID()).slice(0, 64);
  res.setHeader("x-request-id", requestId);
  const startedAt = Date.now();

  runWithRequestContext({ requestId, startedAt }, () => {
    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      logger[level](`${req.method} ${req.originalUrl} ${res.statusCode}`, { durationMs });
    });
    next();
  });
}

/** Attaches verified auth claims to the ambient request context (called after requireAuth). */
export function attachAuthToContext(req: Request, _res: Response, next: NextFunction) {
  if (req.auth) setRequestAuth({ userId: req.auth.userId, appId: req.auth.appId });
  next();
}

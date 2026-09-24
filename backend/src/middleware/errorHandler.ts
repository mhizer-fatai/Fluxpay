import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { config } from "../config.js";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: "route_not_found", path: req.originalUrl });
}

/** eslint-disable-next-line @typescript-eslint/no-unused-vars */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    if (err.status >= 500) logger.error(err.message, { code: err.code });
    res.status(err.status).json({ error: err.code, ...(err.details !== undefined ? { details: err.details } : {}) });
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: "validation_failed", details: err.issues.map(i => ({ path: i.path.join("."), message: i.message })) });
    return;
  }
  logger.error("unhandled_error", { message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
  res.status(500).json({
    error: "internal_error",
    ...(config.env !== "production" && err instanceof Error ? { message: err.message } : {}),
  });
}

import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors.js";

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Small in-memory fixed-window rate limiter (no extra dependency). Buckets are swept
 * lazily, so the map cannot grow without bound.
 */
export function rateLimit(opts: {
  windowMs: number;
  max: number;
  name: string;
  key?: (req: Request) => string;
}) {
  const buckets = new Map<string, Bucket>();
  let lastSweep = Date.now();

  return (req: Request, _res: Response, next: NextFunction): void => {
    const now = Date.now();
    if (now - lastSweep > opts.windowMs) {
      for (const [k, b] of buckets) {
        if (b.resetAt <= now) buckets.delete(k);
      }
      lastSweep = now;
    }
    const key = opts.key?.(req) ?? req.ip ?? "unknown";
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }
    if (bucket.count >= opts.max) {
      next(new AppError("too many requests", 429, "rate_limited", { limiter: opts.name }));
      return;
    }
    bucket.count += 1;
    next();
  };
}

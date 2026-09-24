import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { notFound } from "../lib/errors.js";
import { registryService } from "../services/registryService.js";

export const registryRouter = Router();

const usernameQuery = z.object({ username: z.string().min(1).max(64) });

/**
 * GET /api/v1/registry/resolve?username=alice
 * Cached lookup. Final address must be re-fetched on-chain at userOp build time.
 */
registryRouter.get("/resolve", validate({ query: usernameQuery }), async (req, res, next) => {
  try {
    const { username } = res.locals.query as { username: string };
    const address = await registryService.resolveCached(username);
    if (!address) throw notFound("username");
    res.json({ username, address });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/registry/available?username=alice
 * Live on-chain availability check (source of truth).
 */
registryRouter.get("/available", validate({ query: usernameQuery }), async (req, res, next) => {
  try {
    const { username } = res.locals.query as { username: string };
    const normalized = username.toLowerCase();
    res.json({ username: normalized, available: await registryService.isAvailable(normalized) });
  } catch (err) {
    next(err);
  }
});

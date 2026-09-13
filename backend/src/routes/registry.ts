import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";

export const registryRouter = Router();

const resolveSchema = z.object({ username: z.string().min(1).max(64) });

/**
 * GET /api/v1/registry/resolve?username=alice
 * Lookup from the on-chain registry cache. The final address embedded into any userOp
 * calldata is re-fetched from the chain at build time (never trusted from cache).
 */
registryRouter.get("/resolve", async (req, res, next) => {
  try {
    const { username } = resolveSchema.parse(req.query);
    const rows = await query<{ address: string }>(
      `SELECT address FROM usernames WHERE username = $1 AND address IS NOT NULL`,
      [username.toLowerCase()],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "username_not_found" });
      return;
    }
    res.json({ username, address: rows[0]!.address });
  } catch (err) {
    next(err);
  }
});

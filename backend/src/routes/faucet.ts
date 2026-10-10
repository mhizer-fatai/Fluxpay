import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/requireAuth.js";
import { attachAuthToContext } from "../middleware/requestContext.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { faucetService } from "../services/faucetService.js";
import { assertAddressAccess } from "../services/accessService.js";

export const faucetRouter = Router();

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

/**
 * POST /api/v1/faucet/usdc — send a little testnet USDC to the caller's wallet so a
 * fresh user (or judge) can try the product immediately. Per-address cooldown and a
 * rolling daily cap live in the service.
 */
faucetRouter.post(
  "/usdc",
  requireAuth,
  attachAuthToContext,
  rateLimit({ windowMs: 60_000, max: 6, name: "faucet" }),
  validate({ body: z.object({ address: addressSchema }) }),
  async (req, res, next) => {
    try {
      const { address } = req.body as { address: string };
      await assertAddressAccess(req.auth!.userId, address);
      res.json(await faucetService.claimUsdc(address));
    } catch (err) {
      next(err);
    }
  },
);

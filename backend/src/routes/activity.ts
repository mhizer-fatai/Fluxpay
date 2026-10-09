import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/requireAuth.js";
import { attachAuthToContext } from "../middleware/requestContext.js";
import { validate } from "../middleware/validate.js";
import { activityService } from "../services/activityService.js";
import { assertAddressAccess } from "../services/accessService.js";

export const activityRouter = Router();

const querySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** GET /api/v1/activity?address=0x...&limit=50 — recorded on-chain events for an address. */
activityRouter.get(
  "/",
  requireAuth,
  attachAuthToContext,
  validate({ query: querySchema }),
  async (req, res, next) => {
    try {
      const { address, limit } = res.locals.query as { address: string; limit: number };
      await assertAddressAccess(req.auth!.userId, address);
      res.json(await activityService.list(address.toLowerCase(), limit));
    } catch (err) {
      next(err);
    }
  },
);

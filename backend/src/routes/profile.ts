import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/requireAuth.js";
import { attachAuthToContext } from "../middleware/requestContext.js";
import { validate } from "../middleware/validate.js";
import { profileService } from "../services/profileService.js";

export const profileRouter = Router();

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const usernameSchema = z.string().regex(/^[a-z0-9_]{3,32}$/);

/** GET /api/v1/profile?address=0x... */
profileRouter.get(
  "/",
  requireAuth,
  attachAuthToContext,
  validate({ query: z.object({ address: addressSchema }) }),
  async (req, res, next) => {
    try {
      const { address } = res.locals.query as { address: string };
      res.json(await profileService.get(address.toLowerCase()));
    } catch (err) {
      next(err);
    }
  },
);

const upsertSchema = z.object({
  address: addressSchema,
  fullName: z.string().min(1).max(120),
  email: z.string().email().max(200).optional(),
});

/** PUT /api/v1/profile */
profileRouter.put(
  "/",
  requireAuth,
  attachAuthToContext,
  validate({ body: upsertSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof upsertSchema>;
      res.json(
        await profileService.upsertBase({
          address: body.address.toLowerCase(),
          fullName: body.fullName,
          email: body.email,
          privyUserId: req.auth!.userId,
        }),
      );
    } catch (err) {
      next(err);
    }
  },
);

const claimSchema = z.object({
  address: addressSchema,
  username: usernameSchema,
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  fullName: z.string().min(1).max(120),
  email: z.string().email().max(200).optional(),
});

/** POST /api/v1/profile/claim-username */
profileRouter.post(
  "/claim-username",
  requireAuth,
  attachAuthToContext,
  validate({ body: claimSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof claimSchema>;
      res.json(
        await profileService.claimUsername({
          address: body.address.toLowerCase(),
          username: body.username,
          txHash: body.txHash,
          fullName: body.fullName,
          email: body.email,
          privyUserId: req.auth!.userId,
        }),
      );
    } catch (err) {
      next(err);
    }
  },
);

import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/requireAuth.js";
import { attachAuthToContext } from "../middleware/requestContext.js";
import { validate } from "../middleware/validate.js";
import { paymentService } from "../services/paymentService.js";

export const paymentRouter = Router();

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

const createSchema = z.object({
  idempotencyKey: z.string().min(1).max(128),
  fromAddress: addressSchema,
  toAddress: addressSchema,
  asset: z.string().min(1).max(64),
  amountRaw: z.string().regex(/^[0-9]{1,78}$/),
});

/**
 * POST /api/v1/payments/intents — idempotent intent creation.
 * Same idempotency key → the existing intent is returned, never a duplicate.
 */
paymentRouter.post(
  "/intents",
  requireAuth,
  attachAuthToContext,
  validate({ body: createSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof createSchema>;
      res.status(201).json(
        await paymentService.createIntent({
          idempotencyKey: body.idempotencyKey,
          fromAddress: body.fromAddress.toLowerCase(),
          toAddress: body.toAddress.toLowerCase(),
          asset: body.asset,
          amount: body.amountRaw,
        }, req.auth!.userId),
      );
    } catch (err) {
      next(err);
    }
  },
);

/** GET /api/v1/payments/intents/:intentId — poll intent status (resume after timeouts). */
paymentRouter.get(
  "/intents/:intentId",
  requireAuth,
  attachAuthToContext,
  async (req, res, next) => {
    try {
      res.json(await paymentService.getIntent(req.params.intentId as string, req.auth!.userId));
    } catch (err) {
      next(err);
    }
  },
);

const patchSchema = z.object({
  status: z.enum(["submitted", "confirmed", "failed"]),
  useropHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  blockNum: z.string().regex(/^[0-9]{1,20}$/).optional(),
});

/** PATCH /api/v1/payments/intents/:intentId — forward-only status transitions. */
paymentRouter.patch(
  "/intents/:intentId",
  requireAuth,
  attachAuthToContext,
  validate({ body: patchSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof patchSchema>;
      res.json(
        await paymentService.updateIntent(req.params.intentId as string, body.status, {
          useropHash: body.useropHash,
          txHash: body.txHash,
          blockNum: body.blockNum,
        }, req.auth!.userId),
      );
    } catch (err) {
      next(err);
    }
  },
);

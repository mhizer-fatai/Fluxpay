import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/requireAuth.js";
import { attachAuthToContext } from "../middleware/requestContext.js";
import { validate } from "../middleware/validate.js";
import { paymentLinkService } from "../services/paymentLinkService.js";
import { assertAddressAccess } from "../services/accessService.js";
import { rateLimit } from "../middleware/rateLimit.js";

export const paymentLinkRouter = Router();

/** Public payer route: bound the upstream RPC work per IP. */
const paidLimiter = rateLimit({ windowMs: 60_000, max: 20, name: "link-paid" });

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

const createSchema = z.object({
  creatorAddress: addressSchema,
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  token: addressSchema,
  amountRaw: z.string().regex(/^[0-9]{1,78}$/),
  /** Optional "programmable gift" conditions. */
  expiresAt: z.string().datetime().optional(),
  payerAllowed: addressSchema.optional(),
});

/** POST /api/v1/payment-links — create a payment request (auth required). */
paymentLinkRouter.post(
  "/",
  requireAuth,
  attachAuthToContext,
  validate({ body: createSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof createSchema>;
      await assertAddressAccess(req.auth!.userId, body.creatorAddress);
      res.status(201).json(
        await paymentLinkService.create({
          creatorAddress: body.creatorAddress.toLowerCase(),
          title: body.title,
          description: body.description,
          token: body.token.toLowerCase(),
          amountRaw: body.amountRaw,
          expiresAt: body.expiresAt ?? null,
          payerAllowed: body.payerAllowed ?? null,
        }),
      );
    } catch (err) {
      next(err);
    }
  },
);

/** GET /api/v1/payment-links/mine?address=0x... — creator's links (auth required). */
paymentLinkRouter.get(
  "/mine",
  requireAuth,
  attachAuthToContext,
  validate({ query: z.object({ address: addressSchema, limit: z.coerce.number().int().min(1).max(200).default(50) }) }),
  async (req, res, next) => {
    try {
      const { address, limit } = res.locals.query as { address: string; limit: number };
      await assertAddressAccess(req.auth!.userId, address);
      res.json(await paymentLinkService.listMine(address.toLowerCase(), limit));
    } catch (err) {
      next(err);
    }
  },
);

/** GET /api/v1/payment-links/:id — public; payers open shared links without an account gate. */
paymentLinkRouter.get("/:id", async (req, res, next) => {
  try {
    res.json(await paymentLinkService.get(req.params.id as string));
  } catch (err) {
    next(err);
  }
});

const paidSchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  payerAddress: addressSchema,
});

/**
 * POST /api/v1/payment-links/:id/paid — verify tx on-chain, flip pending→paid once.
 * Public: the payer pays from their own browser wallet and has no FluxPay account.
 * Safety comes from on-chain verification, not from auth.
 */
paymentLinkRouter.post(
  "/:id/paid",
  paidLimiter,
  validate({ body: paidSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof paidSchema>;
      res.json(
        await paymentLinkService.recordPayment({
          id: req.params.id as string,
          txHash: body.txHash,
          payerAddress: body.payerAddress.toLowerCase(),
        }),
      );
    } catch (err) {
      next(err);
    }
  },
);

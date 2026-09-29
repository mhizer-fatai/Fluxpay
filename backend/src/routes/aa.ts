import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/requireAuth.js";
import { attachAuthToContext } from "../middleware/requestContext.js";
import { validate } from "../middleware/validate.js";
import { aaService } from "../services/aaService.js";

export const aaRouter = Router();

const rpcSchema = z.object({
  jsonrpc: z.literal("2.0").optional(),
  method: z.string().min(1).max(64),
  params: z.unknown(),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
});

/**
 * POST /api/v1/aa/rpc — authenticated JSON-RPC proxy to Pimlico (bundler + paymaster).
 * Keeps PIMLICO_API_KEY server-side; the browser never sees it.
 */
aaRouter.post(
  "/rpc",
  requireAuth,
  attachAuthToContext,
  validate({ body: rpcSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof rpcSchema>;
      res.json(await aaService.forward({ method: body.method, params: body.params, id: body.id }));
    } catch (err) {
      next(err);
    }
  },
);

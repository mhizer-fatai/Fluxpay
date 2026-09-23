import { Router } from "express";
import { requireAuth } from "../auth/requireAuth.js";

export const meRouter = Router();

/** GET /api/v1/me — returns the Privy identity of the caller. */
meRouter.get("/", requireAuth, (req, res) => {
  res.json({ userId: req.auth!.userId, appId: req.auth!.appId });
});

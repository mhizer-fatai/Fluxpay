import type { NextFunction, Request, Response } from "express";
import { verifyPrivyToken, type PrivyClaims } from "./privy.js";

declare global {
  namespace Express {
    interface Request {
      auth?: PrivyClaims;
    }
  }
}

/** Reject requests without a valid Privy access token. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: "missing_token" });
      return;
    }
    req.auth = await verifyPrivyToken(token);
    next();
  } catch (err) {
    if (err instanceof Error && err.message === "auth_not_configured") {
      res.status(500).json({ error: "auth_not_configured" });
      return;
    }
    res.status(401).json({ error: "invalid_token" });
  }
}

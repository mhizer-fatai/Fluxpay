import type { NextFunction, Request, Response } from "express";
import { verifyPrivyToken, type PrivyClaims } from "./privy.js";
import { logger } from "../lib/logger.js";

declare global {
  namespace Express {
    interface Request {
      auth?: PrivyClaims;
    }
  }
}

/** Reject requests without a valid Privy access token. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  let token: string | null = null;
  try {
    const header = req.header("authorization");
    token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      logger.warn("auth_reject", { reason: "missing_token", path: req.path });
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
    const message = err instanceof Error ? err.message : String(err);
    const reason = /expired/i.test(message) ? "expired" : "invalid";

    // Diagnostic WITHOUT logging token material: decode the timing claims and
    // compare against this host's clock. A large `now - exp` on a freshly issued
    // token points at host clock skew rather than a bad token.
    const now = Math.floor(Date.now() / 1000);
    let iat: number | undefined;
    let exp: number | undefined;
    if (token) {
      try {
        const segment = token.split(".")[1];
        if (segment) {
          const payload = JSON.parse(Buffer.from(segment, "base64url").toString());
          if (typeof payload.iat === "number") iat = payload.iat;
          if (typeof payload.exp === "number") exp = payload.exp;
        }
      } catch { /* not a decodable JWT — the verify error above is the signal */ }
    }

    logger.warn("auth_reject", {
      reason,
      path: req.path,
      verifyError: message,
      iat,
      exp,
      now,
      ...(reason === "expired" && exp !== undefined ? { expiredBySeconds: now - exp } : {}),
    });
    res.status(401).json({ error: "invalid_token", reason });
  }
}

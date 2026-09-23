import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import { verifyAccessToken } from "@privy-io/node";

let cachedJWKS: JWTVerifyGetKey | null = null;

function settings(): { appId: string; jwksUrl: string } {
  const appId = process.env.PRIVY_APP_ID;
  const jwksUrl = process.env.PRIVY_JWKS_URL;
  if (!appId || !jwksUrl) {
    throw new Error("auth_not_configured");
  }
  return { appId, jwksUrl };
}

function getJWKS(jwksUrl: string): JWTVerifyGetKey {
  if (!cachedJWKS) cachedJWKS = createRemoteJWKSet(new URL(jwksUrl));
  return cachedJWKS;
}

export interface PrivyClaims {
  userId: string;
  appId: string;
  sessionId: string;
  issuedAt: number;
  expiration: number;
}

/** Verify a Privy access token (sent as `Authorization: Bearer <token>`). */
export async function verifyPrivyToken(token: string): Promise<PrivyClaims> {
  const { appId, jwksUrl } = settings();
  const claims = await verifyAccessToken({
    access_token: token,
    app_id: appId,
    verification_key: getJWKS(jwksUrl),
  });
  return {
    userId: claims.user_id,
    appId: claims.app_id,
    sessionId: claims.session_id,
    issuedAt: claims.issued_at,
    expiration: claims.expiration,
  };
}

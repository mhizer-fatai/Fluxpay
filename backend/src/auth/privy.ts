import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import { verifyAccessToken } from "@privy-io/node";

let cachedJWKS: JWTVerifyGetKey | null = null;

// The Privy app id is public (it ships in the browser bundle) and the JWKS URL is
// derived from it — both are defaults, overridable via env.
const DEFAULT_APP_ID = "cmuamdld600480cjtff83vl6j";

function settings(): { appId: string; jwksUrl: string } {
  const appId = process.env.PRIVY_APP_ID || DEFAULT_APP_ID;
  const jwksUrl = process.env.PRIVY_JWKS_URL || `https://auth.privy.io/api/v1/apps/${appId}/jwks.json`;
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

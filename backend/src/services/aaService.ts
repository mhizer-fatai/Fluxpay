import { config } from "../config.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { assertAddressAccess } from "./accessService.js";

/**
 * Read-only allowlist for the Pimlico JSON-RPC surface the app needs
 * (ERC-4337 bundler + verifying paymaster). Anything else is rejected
 * before it ever reaches upstream — the proxy must not become an open relay.
 */
const ALLOWED_METHODS = new Set([
  "eth_chainId",
  "eth_sendUserOperation",
  "eth_estimateUserOperationGas",
  "eth_getUserOperationReceipt",
  "eth_getUserOperationByHash",
  "eth_supportedEntryPoints",
  "pimlico_getUserOperationGasPrice",
  "pimlico_getUserOperationStatus",
  "pm_sponsorUserOperation",
  "pm_validateSponsorshipPolicies",
  "pm_getPaymasterStubData",
  "pm_getPaymasterData",
]);

/**
 * Methods that carry a userOp: the sender is bound to the authenticated user so
 * one account cannot spend the paymaster's gas on behalf of another user's
 * (or an arbitrary) smart account.
 */
const SENDER_BOUND_METHODS = new Set([
  "eth_sendUserOperation",
  "eth_estimateUserOperationGas",
  "pm_sponsorUserOperation",
  "pm_validateSponsorshipPolicies",
  "pm_getPaymasterStubData",
  "pm_getPaymasterData",
]);

function userOpSender(params: unknown): string | null {
  if (!Array.isArray(params) || params.length === 0) return null;
  const first = params[0];
  if (first && typeof first === "object" && typeof (first as { sender?: unknown }).sender === "string") {
    return (first as { sender: string }).sender;
  }
  return null;
}

const UPSTREAM_TIMEOUT_MS = 30_000;

export interface AaRpcRequest {
  method: string;
  params?: unknown;
  id?: string | number | null;
}

/**
 * Forward one JSON-RPC call to Pimlico using the server-side API key.
 * Transport failures → 502. Upstream JSON-RPC error payloads pass through
 * untouched (permissionless clients parse them normally).
 */
export const aaService = {
  async forward(req: AaRpcRequest, callerUserId: string): Promise<unknown> {
    if (!ALLOWED_METHODS.has(req.method)) {
      logger.warn("aa_method_forbidden", { method: req.method });
      throw new AppError("method not allowed through AA proxy", 403, "aa_method_forbidden", {
        method: req.method,
      });
    }
    if (SENDER_BOUND_METHODS.has(req.method)) {
      const sender = userOpSender(req.params);
      if (!sender || !/^0x[a-fA-F0-9]{40}$/.test(sender)) {
        logger.warn("aa_sender_missing", { method: req.method });
        throw new AppError("userOperation sender required", 400, "aa_sender_required");
      }
      await assertAddressAccess(callerUserId, sender);
    }
    if (!config.pimlico.apiKey) {
      throw new AppError("paymaster not configured", 503, "aa_not_configured");
    }
    const url = `${config.pimlico.baseUrl}/${config.chain.id}/rpc?apikey=${encodeURIComponent(config.pimlico.apiKey)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: req.id ?? 1, method: req.method, params: req.params ?? [] }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        logger.warn("aa_upstream_http_error", { method: req.method, status: res.status });
        throw new AppError("paymaster upstream error", 502, "aa_upstream_error");
      }
      return (await res.json()) as unknown;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.warn("aa_upstream_failed", { method: req.method, error: String(err) });
      throw new AppError("paymaster request failed", 502, "aa_upstream_error");
    } finally {
      clearTimeout(timer);
    }
  },
};

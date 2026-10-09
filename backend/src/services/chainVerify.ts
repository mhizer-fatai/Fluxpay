import { decodeEventLog, type Hex } from "viem";
import { publicClient } from "../chain.js";
import { config } from "../config.js";

/** Zero address is the sentinel for native MON (MON has no token contract). */
export const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";
export const isNativeToken = (token: string): boolean => token.toLowerCase() === NATIVE_TOKEN;

interface TraceCall {
  type?: string;
  from?: string;
  to?: string;
  value?: string;
  error?: string;
  revertReason?: string;
  calls?: TraceCall[];
}

/** Raw JSON-RPC call for debug_traceTransaction — viem doesn't type debug_* methods. */
async function traceTransaction(txHash: string): Promise<TraceCall | null> {
  try {
    const res = await fetch(config.chain.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "debug_traceTransaction",
        params: [txHash, { tracer: "callTracer" }],
      }),
      signal: AbortSignal.timeout(12_000),
    });
    const json = (await res.json()) as { result?: TraceCall };
    return json.result ?? null;
  } catch {
    return null;
  }
}

/**
 * Native MON moves inside the userOp's call tree and emits no ERC-20 log, so walk
 * the callTracer output for a value transfer from the payer to the recipient.
 * Reverted subcalls are skipped — a failed inner call moves nothing, and the
 * callTracer includes them alongside successful ones.
 */
function traceHasNativePayment(call: TraceCall, from: string, to: string, expectedRaw: bigint): boolean {
  const reverted = Boolean(call.error || call.revertReason);
  if (!reverted) {
    const callFrom = (call.from ?? "").toLowerCase();
    const callTo = (call.to ?? "").toLowerCase();
    if (callFrom === from && callTo === to) {
      const value = call.value && call.value !== "0x" ? BigInt(call.value) : 0n;
      if (value >= expectedRaw) return true;
    }
  }
  return (call.calls ?? []).some((child) => traceHasNativePayment(child, from, to, expectedRaw));
}

const paymentSettledAbi = [
  {
    type: "event",
    name: "PaymentSettled",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "token", type: "address", indexed: true },
    ],
  },
] as const;

const transferAbi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

export interface TransferClaim {
  txHash: string;
  /** Payer that must have moved the funds. */
  from: string;
  /** Recipient that must have received at least `expectedRaw`. */
  to: string;
  /** ERC-20 address, or NATIVE_TOKEN for MON. */
  token: string;
  expectedRaw: bigint;
  /** When set, the tx must be at/after this time — rejects stale payments. */
  notBefore?: Date | string | null;
}

/**
 * Verify a mined tx moved at least `expectedRaw` from `from` to `to`, either through
 * FluxPay.settle, a direct ERC-20 transfer in the same receipt, or (for MON) a
 * value-bearing call in the userOp trace. Requires the top-level tx to have succeeded.
 */
export async function verifyTransferTx(claim: TransferClaim): Promise<boolean> {
  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: claim.txHash as Hex });
  } catch {
    return false;
  }
  if (receipt.status !== "success") return false;

  if (claim.notBefore) {
    try {
      const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
      const floor = Math.floor(new Date(claim.notBefore).getTime() / 1000);
      if (Number(block.timestamp) < floor) return false;
    } catch {
      /* block unavailable — fall through to the payment checks */
    }
  }

  const from = claim.from.toLowerCase();
  const to = claim.to.toLowerCase();
  const token = claim.token.toLowerCase();

  if (isNativeToken(token)) {
    const trace = await traceTransaction(claim.txHash);
    return trace ? traceHasNativePayment(trace, from, to, claim.expectedRaw) : false;
  }

  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: paymentSettledAbi, data: log.data, topics: log.topics });
      if (decoded.eventName !== "PaymentSettled") continue;
      const args = decoded.args as unknown as { from: string; to: string; amount: bigint; token: string };
      if (
        args.from.toLowerCase() === from &&
        args.to.toLowerCase() === to &&
        args.token.toLowerCase() === token &&
        args.amount >= claim.expectedRaw
      ) {
        return true;
      }
      continue;
    } catch {
      /* not a PaymentSettled log */
    }
    try {
      const decoded = decodeEventLog({ abi: transferAbi, data: log.data, topics: log.topics });
      if (decoded.eventName !== "Transfer") continue;
      const args = decoded.args as unknown as { from: string; to: string; value: bigint };
      if (args.from.toLowerCase() !== from) continue;
      if (args.to.toLowerCase() !== to) continue;
      if (log.address.toLowerCase() !== token) continue;
      if (args.value >= claim.expectedRaw) return true;
    } catch {
      /* ignore non-Transfer logs */
    }
  }
  return false;
}

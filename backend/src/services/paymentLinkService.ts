import { decodeEventLog, type Hex } from "viem";
import { AppError, notFound } from "../lib/errors.js";
import { paymentLinkRepo, type PaymentLinkRow } from "../repositories/paymentLinkRepo.js";
import { publicClient } from "../chain.js";
import { config } from "../config.js";
import { paymentService } from "./paymentService.js";

export interface PaymentLinkDto {
  id: string;
  creatorAddress: string;
  title: string;
  description: string;
  token: string;
  amount: string;
  status: "pending" | "paid" | "expired";
  txHash: string | null;
  createdAt: string;
}

const toDto = (row: PaymentLinkRow): PaymentLinkDto => ({
  id: row.id,
  creatorAddress: row.creator_address,
  title: row.title,
  description: row.description,
  token: row.token,
  amount: row.amount,
  status: row.status,
  txHash: row.tx_hash,
  createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
});

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

/** Zero address is the sentinel for native MON in payment links (MON has no token contract). */
const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";

interface TraceCall {
  type?: string;
  from?: string;
  to?: string;
  value?: string;
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
 * the callTracer output for a value transfer from the payer to the creator.
 */
function traceHasNativePayment(call: TraceCall, payer: string, creator: string, expectedRaw: bigint): boolean {
  const from = (call.from ?? "").toLowerCase();
  const to = (call.to ?? "").toLowerCase();
  if (from === payer && to === creator) {
    const value = call.value && call.value !== "0x" ? BigInt(call.value) : 0n;
    if (value >= expectedRaw) return true;
  }
  return (call.calls ?? []).some((child) => traceHasNativePayment(child, payer, creator, expectedRaw));
}

/**
 * Verify a payment tx actually paid `creator` at least `expectedRaw` of `token`,
 * either through FluxPay.settle or a direct transfer in the same receipt. Native
 * MON links are verified from the userOp call trace instead (no token logs).
 */
async function verifyPaymentTx(
  txHash: string,
  creator: string,
  token: string,
  expectedRaw: bigint,
  payer: string,
): Promise<boolean> {
  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash as Hex });
  } catch {
    return false;
  }
  if (receipt.status !== "success") return false;
  const creatorLower = creator.toLowerCase();
  const tokenLower = token.toLowerCase();

  if (tokenLower === NATIVE_TOKEN) {
    const trace = await traceTransaction(txHash);
    return trace ? traceHasNativePayment(trace, payer.toLowerCase(), creatorLower, expectedRaw) : false;
  }

  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: paymentSettledAbi, data: log.data, topics: log.topics });
      if (decoded.eventName !== "PaymentSettled") continue;
      const args = decoded.args as { to: string; amount: bigint; token: string };
      if (args.to.toLowerCase() === creatorLower && args.token.toLowerCase() === tokenLower && args.amount >= expectedRaw) {
        return true;
      }
      continue;
    } catch { /* not a PaymentSettled log */ }
    try {
      const decoded = decodeEventLog({ abi: transferAbi, data: log.data, topics: log.topics });
      if (decoded.eventName !== "Transfer") continue;
      const args = decoded.args as { to: string; value: bigint };
      if (args.to.toLowerCase() !== creatorLower) continue;
      if (log.address.toLowerCase() !== tokenLower) continue;
      if (args.value >= expectedRaw) return true;
    } catch { /* ignore */ }
  }
  return false;
}

export const paymentLinkService = {
  async create(input: {
    creatorAddress: string;
    title: string;
    description?: string;
    token: string;
    amountRaw: string;
  }): Promise<PaymentLinkDto> {
    if (!/^0x[a-fA-F0-9]{40}$/.test(input.token)) {
      throw new AppError("invalid token address", 400, "invalid_token");
    }
    let amount: bigint;
    try {
      amount = BigInt(input.amountRaw);
    } catch {
      throw new AppError("invalid amount", 400, "invalid_amount");
    }
    if (amount <= 0n) throw new AppError("invalid amount", 400, "invalid_amount");
    const row = await paymentLinkRepo.create({
      id: paymentLinkRepo.newId(),
      creatorAddress: input.creatorAddress.toLowerCase(),
      title: input.title.slice(0, 120),
      description: (input.description ?? "").slice(0, 500),
      token: input.token.toLowerCase(),
      amount: amount.toString(),
    });
    return toDto(row);
  },

  async get(id: string): Promise<PaymentLinkDto> {
    const row = await paymentLinkRepo.findById(id);
    if (!row) throw notFound("payment link");
    return toDto(row);
  },

  async listMine(creatorAddress: string, limit: number): Promise<PaymentLinkDto[]> {
    const rows = await paymentLinkRepo.listByCreator(creatorAddress, limit);
    return rows.map(toDto);
  },

  /**
   * Record payment for a link. Verifies the tx on-chain first; the pending→paid
   * flip is atomic so a link can never be paid twice.
   */
  async recordPayment(input: { id: string; txHash: string; payerAddress: string }): Promise<PaymentLinkDto> {
    const row = await paymentLinkRepo.findById(input.id);
    if (!row) throw notFound("payment link");
    if (row.status !== "pending") {
      throw new AppError(`link is already ${row.status}`, 409, "link_not_payable");
    }
    const ok = await verifyPaymentTx(input.txHash, row.creator_address, row.token, BigInt(row.amount), input.payerAddress);
    if (!ok) {
      throw new AppError("transaction does not pay this link", 400, "payment_not_verified");
    }
    const flipped = await paymentLinkRepo.markPaid(input.id, input.txHash, input.payerAddress);
    if (!flipped) {
      throw new AppError("link is already paid", 409, "link_not_payable");
    }
    // Native MON emits no ERC-20 logs, so record an intent for the Activity feed.
    // Idempotent (key = link id) and best-effort: the link is already marked paid.
    if (row.token.toLowerCase() === NATIVE_TOKEN) {
      try {
        const intent = await paymentService.createIntent({
          idempotencyKey: `link:${row.id}`,
          fromAddress: input.payerAddress,
          toAddress: row.creator_address,
          asset: "MON",
          amount: row.amount,
        });
        if (intent.status === "created") {
          await paymentService.updateIntent(intent.intentId, "submitted", { txHash: input.txHash });
          await paymentService.updateIntent(intent.intentId, "confirmed", { txHash: input.txHash });
        }
      } catch {
        /* activity record is best-effort */
      }
    }
    return toDto(flipped);
  },
};

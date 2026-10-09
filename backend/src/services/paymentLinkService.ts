import { AppError, notFound } from "../lib/errors.js";
import { paymentLinkRepo, type PaymentLinkRow } from "../repositories/paymentLinkRepo.js";
import { paymentService } from "./paymentService.js";
import { isNativeToken, verifyTransferTx } from "./chainVerify.js";

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

/** Failed verifications are cached briefly so a bad tx can't hammer the RPC. */
const failedVerifications = new Map<string, number>();
const FAILED_TTL_MS = 60_000;

function recentlyFailed(txHash: string): boolean {
  const key = txHash.toLowerCase();
  const until = failedVerifications.get(key);
  if (!until) return false;
  if (until <= Date.now()) {
    failedVerifications.delete(key);
    return false;
  }
  return true;
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
   * Record payment for a link. The tx is verified on-chain first — payer, recipient,
   * token, amount, and recency — and the pending→paid flip is atomic and unique per
   * tx, so neither one link nor one transaction can be reused.
   */
  async recordPayment(input: { id: string; txHash: string; payerAddress: string }): Promise<PaymentLinkDto> {
    const row = await paymentLinkRepo.findById(input.id);
    if (!row) throw notFound("payment link");
    if (row.status !== "pending") {
      throw new AppError(`link is already ${row.status}`, 409, "link_not_payable");
    }
    if (recentlyFailed(input.txHash)) {
      throw new AppError("transaction does not pay this link", 400, "payment_not_verified");
    }

    const ok = await verifyTransferTx({
      txHash: input.txHash,
      from: input.payerAddress,
      to: row.creator_address,
      token: row.token,
      expectedRaw: BigInt(row.amount),
      notBefore: row.created_at,
    });
    if (!ok) {
      if (failedVerifications.size > 1_000) {
        const now = Date.now();
        for (const [k, until] of failedVerifications) if (until <= now) failedVerifications.delete(k);
      }
      failedVerifications.set(input.txHash.toLowerCase(), Date.now() + FAILED_TTL_MS);
      throw new AppError("transaction does not pay this link", 400, "payment_not_verified");
    }

    let flipped: PaymentLinkRow | null;
    try {
      flipped = await paymentLinkRepo.markPaid(input.id, input.txHash, input.payerAddress);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        throw new AppError("transaction already settled another link", 409, "tx_already_used");
      }
      throw err;
    }
    if (!flipped) {
      throw new AppError("link is already paid", 409, "link_not_payable");
    }

    // Native MON emits no ERC-20 logs, so record an intent for the Activity feed.
    // Idempotent (key = link id) and best-effort: the link is already marked paid.
    if (isNativeToken(row.token)) {
      try {
        const intent = await paymentService.createIntent({
          idempotencyKey: `link:${row.id}`,
          fromAddress: input.payerAddress,
          toAddress: row.creator_address,
          asset: "MON",
          amount: row.amount,
        }, "");
        if (intent.status === "created") {
          await paymentService.updateIntent(intent.intentId, "submitted", { txHash: input.txHash }, "");
          await paymentService.updateIntent(intent.intentId, "confirmed", { txHash: input.txHash }, "");
        }
      } catch {
        /* activity record is best-effort */
      }
    }
    return toDto(flipped);
  },
};

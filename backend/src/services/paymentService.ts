import { AppError, notFound } from "../lib/errors.js";
import { paymentRepo, type PaymentIntentRow, type PaymentStatus } from "../repositories/paymentRepo.js";
import { config } from "../config.js";
import { assertAddressAccess } from "./accessService.js";
import { NATIVE_TOKEN, verifyTransferTx } from "./chainVerify.js";

export interface PaymentIntentDto {
  intentId: string;
  status: PaymentStatus;
  toAddress: string;
  asset: string;
  amount: string;
  useropHash: string | null;
  txHash: string | null;
  deduped: boolean;
}

const toDto = (row: PaymentIntentRow, deduped: boolean): PaymentIntentDto => ({
  intentId: row.intent_id,
  status: row.status,
  toAddress: row.to_address,
  asset: row.asset,
  amount: row.amount,
  useropHash: row.userop_hash,
  txHash: row.tx_hash,
  deduped,
});

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/** Map an intent's asset key (USDC, WMON, …) to its token address; MON is native. */
function assetToken(asset: string): string | null {
  const key = asset.toUpperCase();
  if (key === "MON") return NATIVE_TOKEN;
  const contracts = config.contracts as Record<string, string | undefined>;
  return contracts[key.toLowerCase()] ?? null;
}

export const paymentService = {
  /**
   * Create-or-return a payment intent. Retrying with the same idempotency key
   * can never create a second payment — the existing intent (with its status
   * and hashes) is returned instead. Keys are scoped per sender.
   */
  async createIntent(input: {
    idempotencyKey: string;
    fromAddress: string;
    toAddress: string;
    asset: string;
    amount: string;
  }, callerUserId: string): Promise<PaymentIntentDto> {
    if (!ADDRESS_RE.test(input.fromAddress) || !ADDRESS_RE.test(input.toAddress)) {
      throw new AppError("invalid address", 400, "invalid_address");
    }
    if (!/^[0-9]{1,78}$/.test(input.amount) || BigInt(input.amount) <= 0n) {
      throw new AppError("invalid amount", 400, "invalid_amount");
    }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.idempotencyKey)) {
      throw new AppError("invalid idempotency key", 400, "invalid_idempotency_key");
    }
    if (callerUserId) {
      await assertAddressAccess(callerUserId, input.fromAddress);
    }
    const { row, deduped } = await paymentRepo.getOrCreate({
      idempotencyKey: input.idempotencyKey,
      fromAddress: input.fromAddress.toLowerCase(),
      toAddress: input.toAddress.toLowerCase(),
      asset: input.asset.slice(0, 64),
      amount: input.amount,
    });
    return toDto(row, deduped);
  },

  async getIntent(intentId: string, callerUserId: string): Promise<PaymentIntentDto> {
    const row = await paymentRepo.findById(intentId);
    if (!row) throw notFound("payment intent");
    if (callerUserId) {
      await assertAddressAccess(callerUserId, row.from_address);
    }
    return toDto(row, false);
  },

  /**
   * Forward-only status transitions. A `confirmed` transition is verified on-chain
   * (payer, recipient, asset, amount, recency) before it is accepted, and intents
   * can only be touched by the user who owns the sender address.
   */
  async updateIntent(
    intentId: string,
    status: PaymentStatus,
    patch: { useropHash?: string; txHash?: string; blockNum?: string },
    callerUserId: string,
  ): Promise<PaymentIntentDto> {
    const existing = await paymentRepo.findById(intentId);
    if (!existing) throw notFound("payment intent");
    if (callerUserId) {
      await assertAddressAccess(callerUserId, existing.from_address);
    }
    if (status === "confirmed") {
      const txHash = patch.txHash ?? existing.tx_hash;
      if (!txHash) throw new AppError("confirmed intent needs a tx hash", 400, "missing_tx_hash");
      const token = assetToken(existing.asset);
      if (!token) throw new AppError("cannot verify this asset on-chain", 400, "unsupported_asset");
      const ok = await verifyTransferTx({
        txHash,
        from: existing.from_address,
        to: existing.to_address,
        token,
        expectedRaw: BigInt(existing.amount),
        notBefore: existing.created_at,
      });
      if (!ok) {
        throw new AppError("transaction does not match this payment", 400, "payment_not_verified");
      }
    }
    const row = await paymentRepo.transition(intentId, status, patch);
    if (!row) throw notFound("payment intent");
    return toDto(row, false);
  },
};

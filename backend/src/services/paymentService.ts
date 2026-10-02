import { AppError, notFound } from "../lib/errors.js";
import { paymentRepo, type PaymentIntentRow, type PaymentStatus } from "../repositories/paymentRepo.js";

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

export const paymentService = {
  /**
   * Create-or-return a payment intent. Retrying with the same idempotency key
   * can never create a second payment — the existing intent (with its status
   * and hashes) is returned instead.
   */
  async createIntent(input: {
    idempotencyKey: string;
    fromAddress: string;
    toAddress: string;
    asset: string;
    amount: string;
  }): Promise<PaymentIntentDto> {
    if (!ADDRESS_RE.test(input.fromAddress) || !ADDRESS_RE.test(input.toAddress)) {
      throw new AppError("invalid address", 400, "invalid_address");
    }
    if (!/^[0-9]{1,78}$/.test(input.amount) || BigInt(input.amount) <= 0n) {
      throw new AppError("invalid amount", 400, "invalid_amount");
    }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.idempotencyKey)) {
      throw new AppError("invalid idempotency key", 400, "invalid_idempotency_key");
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

  async getIntent(intentId: string): Promise<PaymentIntentDto> {
    const row = await paymentRepo.findById(intentId);
    if (!row) throw notFound("payment intent");
    return toDto(row, false);
  },

  async updateIntent(
    intentId: string,
    status: PaymentStatus,
    patch: { useropHash?: string; txHash?: string; blockNum?: string },
  ): Promise<PaymentIntentDto> {
    const row = await paymentRepo.transition(intentId, status, patch);
    if (!row) throw notFound("payment intent");
    return toDto(row, false);
  },
};

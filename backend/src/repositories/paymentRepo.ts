import { randomUUID } from "node:crypto";
import { query } from "../db/pool.js";

export type PaymentStatus = "created" | "submitted" | "confirmed" | "failed";

export interface PaymentIntentRow {
  intent_id: string;
  idempotency_key: string;
  from_address: string;
  to_address: string;
  asset: string;
  amount: string;
  fee: string;
  status: PaymentStatus;
  userop_hash: string | null;
  tx_hash: string | null;
  block_num: string | null;
  created_at: Date;
  confirmed_at: Date | null;
}

const COLUMNS = `intent_id, idempotency_key, from_address, to_address, asset, amount, fee, status, userop_hash, tx_hash, block_num, created_at, confirmed_at`;

/** Forward-only status transitions. Anything else is rejected. */
const ALLOWED: Record<PaymentStatus, PaymentStatus[]> = {
  created: ["submitted", "failed"],
  submitted: ["confirmed", "failed"],
  confirmed: [],
  failed: ["submitted"],
};

export const paymentRepo = {
  /** Idempotent create: same key returns the existing row, never a second one. */
  async getOrCreate(input: {
    idempotencyKey: string;
    fromAddress: string;
    toAddress: string;
    asset: string;
    amount: string;
  }): Promise<{ row: PaymentIntentRow; deduped: boolean }> {
    const existing = await query<PaymentIntentRow>(
      `SELECT ${COLUMNS} FROM payments WHERE idempotency_key = $1`,
      [input.idempotencyKey],
    );
    if (existing[0]) return { row: existing[0], deduped: true };
    try {
      const rows = await query<PaymentIntentRow>(
        `INSERT INTO payments (intent_id, idempotency_key, from_address, to_address, asset, amount, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'created')
         RETURNING ${COLUMNS}`,
        [randomUUID(), input.idempotencyKey, input.fromAddress.toLowerCase(), input.toAddress.toLowerCase(), input.asset, input.amount],
      );
      return { row: rows[0]!, deduped: false };
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        const retry = await query<PaymentIntentRow>(
          `SELECT ${COLUMNS} FROM payments WHERE idempotency_key = $1`,
          [input.idempotencyKey],
        );
        if (retry[0]) return { row: retry[0], deduped: true };
      }
      throw err;
    }
  },

  async findById(intentId: string): Promise<PaymentIntentRow | null> {
    const rows = await query<PaymentIntentRow>(
      `SELECT ${COLUMNS} FROM payments WHERE intent_id = $1`,
      [intentId],
    );
    return rows[0] ?? null;
  },

  async transition(
    intentId: string,
    to: PaymentStatus,
    patch: { useropHash?: string; txHash?: string; blockNum?: string },
  ): Promise<PaymentIntentRow | null> {
    const current = await paymentRepo.findById(intentId);
    if (!current) return null;
    if (!ALLOWED[current.status].includes(to)) return current;
    const rows = await query<PaymentIntentRow>(
      `UPDATE payments SET status = $2, userop_hash = COALESCE($3, userop_hash),
        tx_hash = COALESCE($4, tx_hash), block_num = COALESCE($5, block_num),
        confirmed_at = CASE WHEN $2 = 'confirmed' THEN now() ELSE confirmed_at END
       WHERE intent_id = $1
       RETURNING ${COLUMNS}`,
      [intentId, to, patch.useropHash ?? null, patch.txHash ?? null, patch.blockNum ?? null],
    );
    return rows[0] ?? null;
  },
};

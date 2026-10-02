import { randomBytes } from "node:crypto";
import { query } from "../db/pool.js";

export interface PaymentLinkRow {
  id: string;
  creator_address: string;
  title: string;
  description: string;
  token: string;
  amount: string;
  status: "pending" | "paid" | "expired";
  tx_hash: string | null;
  payer_address: string | null;
  created_at: Date;
  paid_at: Date | null;
}

export const paymentLinkRepo = {
  newId(): string {
    return `pl_${randomBytes(12).toString("hex")}`;
  },

  async create(input: {
    id: string;
    creatorAddress: string;
    title: string;
    description: string;
    token: string;
    amount: string;
  }): Promise<PaymentLinkRow> {
    const rows = await query<PaymentLinkRow>(
      `INSERT INTO payment_links (id, creator_address, title, description, token, amount)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, creator_address, title, description, token, amount, status, tx_hash, payer_address, created_at, paid_at`,
      [input.id, input.creatorAddress, input.title, input.description, input.token, input.amount],
    );
    return rows[0]!;
  },

  async findById(id: string): Promise<PaymentLinkRow | null> {
    const rows = await query<PaymentLinkRow>(
      `SELECT id, creator_address, title, description, token, amount, status, tx_hash, payer_address, created_at, paid_at
       FROM payment_links WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },

  async listByCreator(creatorAddress: string, limit: number): Promise<PaymentLinkRow[]> {
    return query<PaymentLinkRow>(
      `SELECT id, creator_address, title, description, token, amount, status, tx_hash, payer_address, created_at, paid_at
       FROM payment_links WHERE creator_address = $1 ORDER BY created_at DESC LIMIT $2`,
      [creatorAddress.toLowerCase(), Math.min(Math.max(limit, 1), 200)],
    );
  },

  /** Flip pending → paid exactly once. Returns the row only if this call won the flip. */
  async markPaid(id: string, txHash: string, payerAddress: string): Promise<PaymentLinkRow | null> {
    const rows = await query<PaymentLinkRow>(
      `UPDATE payment_links SET status = 'paid', tx_hash = $2, payer_address = $3, paid_at = now()
       WHERE id = $1 AND status = 'pending'
       RETURNING id, creator_address, title, description, token, amount, status, tx_hash, payer_address, created_at, paid_at`,
      [id, txHash, payerAddress.toLowerCase()],
    );
    return rows[0] ?? null;
  },
};

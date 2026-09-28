import { decodeEventLog, type Hex } from "viem";
import { AppError, notFound } from "../lib/errors.js";
import { paymentLinkRepo, type PaymentLinkRow } from "../repositories/paymentLinkRepo.js";
import { publicClient } from "../chain.js";

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

/**
 * Verify a payment tx actually paid `creator` at least `expectedRaw` of `token`,
 * either through FluxPay.settle or a direct ERC-20 transfer in the same receipt.
 */
async function verifyPaymentTx(
  txHash: string,
  creator: string,
  token: string,
  expectedRaw: bigint,
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
    const ok = await verifyPaymentTx(input.txHash, row.creator_address, row.token, BigInt(row.amount));
    if (!ok) {
      throw new AppError("transaction does not pay this link", 400, "payment_not_verified");
    }
    const flipped = await paymentLinkRepo.markPaid(input.id, input.txHash, input.payerAddress);
    if (!flipped) {
      throw new AppError("link is already paid", 409, "link_not_payable");
    }
    return toDto(flipped);
  },
};

import { feedRepo } from "../repositories/feedRepo.js";
import { paymentRepo } from "../repositories/paymentRepo.js";

export interface ActivityDto {
  type: string;
  txHash: string | null;
  blockNumber: string | null;
  timestamp: string;
  actor: string;
  payload: Record<string, unknown>;
}

const toDto = (row: { event_type: string; actor: string; payload: unknown; created_at: Date }): ActivityDto => {
  const p = (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload ?? {}) as Record<string, unknown>;
  const { type, txHash, blockNumber, ...rest } = p;
  return {
    type: (type as string) ?? row.event_type,
    txHash: (txHash as string) ?? null,
    blockNumber: blockNumber != null ? String(blockNumber) : null,
    timestamp: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    actor: row.actor,
    payload: rest,
  };
};

export const activityService = {
  async list(address: string, limit: number): Promise<ActivityDto[]> {
    const max = Math.min(Math.max(limit, 1), 200);
    const addr = address.toLowerCase();
    // feed_events carries every indexed on-chain event (all ERC-20 tokens + MON
    // wraps). Native-MON transfers emit no logs, so they come from the app's own
    // payment intents. Token sends never collide: those intents are filtered to
    // asset 'MON' only, while their feed event is payment_settled.
    const [feedRows, nativeRows] = await Promise.all([
      feedRepo.listByActor(addr, max),
      paymentRepo.listNativeByAddress(addr, max),
    ]);

    const feed = feedRows.map(toDto);
    const native: ActivityDto[] = nativeRows.map((row) => {
      const at = row.confirmed_at ?? row.created_at;
      return {
        type: "native_payment",
        txHash: row.tx_hash,
        blockNumber: row.block_num != null ? String(row.block_num) : null,
        timestamp: at instanceof Date ? at.toISOString() : String(at),
        actor: addr,
        payload: {
          from: row.from_address,
          to: row.to_address,
          amount: Number(row.amount) / 1e18,
          tokenLabel: "MON",
          status: row.status,
        },
      };
    });

    return [...feed, ...native]
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
      .slice(0, max);
  },
};

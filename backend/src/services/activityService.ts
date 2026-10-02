import { feedRepo } from "../repositories/feedRepo.js";

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
    const rows = await feedRepo.listByActor(address, limit);
    return rows.map(toDto);
  },
};

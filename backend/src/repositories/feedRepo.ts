import { query } from "../db/pool.js";

export interface FeedRow {
  event_id: string;
  event_type: string;
  actor: string;
  payload: unknown;
  confirmed: boolean;
  created_at: Date;
}

export const feedRepo = {
  async listByActor(address: string, limit: number): Promise<FeedRow[]> {
    return query<FeedRow>(
      `SELECT event_id, event_type, actor, payload, confirmed, created_at
       FROM feed_events WHERE actor = $1 ORDER BY event_id DESC LIMIT $2`,
      [address.toLowerCase(), Math.min(Math.max(limit, 1), 200)],
    );
  },
};

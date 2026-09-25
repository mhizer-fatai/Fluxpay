import { query } from "../db/pool.js";

export const registryService = {
  /** DB lookup (usernames are app data owned by Fluxpay). */
  async resolveCached(username: string): Promise<string | null> {
    const rows = await query<{ address: string }>(
      `SELECT address FROM usernames WHERE username = $1 AND address IS NOT NULL`,
      [username.toLowerCase()],
    );
    return rows[0]?.address ?? null;
  },

  /** Availability from the DB — fast, no chain dependency. */
  async isAvailable(username: string): Promise<boolean> {
    const rows = await query<{ one: number }>(
      `SELECT 1 AS one FROM usernames WHERE username = $1 LIMIT 1`,
      [username.toLowerCase()],
    );
    return rows.length === 0;
  },
};

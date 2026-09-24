import { query } from "../db/pool.js";
import { resolveUsernameOnChain } from "../chain.js";

export const registryService = {
  /** Cached lookup; callers must re-verify on-chain before embedding into userOp calldata. */
  async resolveCached(username: string): Promise<string | null> {
    const rows = await query<{ address: string }>(
      `SELECT address FROM usernames WHERE username = $1 AND address IS NOT NULL`,
      [username.toLowerCase()],
    );
    return rows[0]?.address ?? null;
  },

  /** Chain is the source of truth for availability. */
  async isAvailable(username: string): Promise<boolean> {
    const owner = await resolveUsernameOnChain(username.toLowerCase());
    return owner === null;
  },
};

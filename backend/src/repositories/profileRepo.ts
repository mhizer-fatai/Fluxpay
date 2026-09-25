import { pool, query } from "../db/pool.js";

export interface ProfileRow {
  address: string;
  username: string | null;
  full_name: string;
  email: string | null;
  privy_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UpsertProfileInput {
  address: string;
  fullName: string;
  email: string | null;
  privyUserId: string;
}

export interface ClaimUsernameInput extends UpsertProfileInput {
  username: string;
  usernameHash: string;
}

const COLUMNS = `address, username, full_name, email, privy_user_id, created_at, updated_at`;

export const profileRepo = {
  async findByAddress(address: string): Promise<ProfileRow | null> {
    const rows = await query<ProfileRow>(`SELECT ${COLUMNS} FROM profiles WHERE address = $1`, [address]);
    return rows[0] ?? null;
  },

  async isUsernameTaken(username: string): Promise<boolean> {
    const rows = await query<{ taken: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM usernames WHERE username = $1) AS taken`,
      [username],
    );
    return rows[0]!.taken;
  },

  /**
   * DB-first username claim (product decision: usernames are app data owned by Fluxpay).
   * Atomically inserts the username and upserts the profile; unique violation → null (taken).
   */
  async claimUsernameDb(input: {
    address: string;
    username: string;
    fullName: string;
    email: string | null;
    privyUserId: string;
    usernameHash: string;
  }): Promise<ProfileRow | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      try {
        await client.query(
          `INSERT INTO usernames (username, username_hash, address, registered_at)
           VALUES ($1, $2, $3, now())`,
          [input.username, input.usernameHash, input.address],
        );
      } catch (err) {
        await client.query("ROLLBACK");
        if ((err as { code?: string }).code === "23505") return null; // unique violation → taken
        throw err;
      }
      const inserted = await client.query<ProfileRow>(
        `INSERT INTO profiles (address, username, full_name, email, privy_user_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (address) DO UPDATE
           SET username = $2, full_name = $3, email = $4, privy_user_id = $5, updated_at = now()
         RETURNING ${COLUMNS}`,
        [input.address, input.username, input.fullName, input.email, input.privyUserId],
      );
      await client.query("COMMIT");
      return inserted.rows[0] ?? null;
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch { /* already rolled back */ }
      throw err;
    } finally {
      client.release();
    }
  },

  async upsertBase(input: UpsertProfileInput): Promise<ProfileRow> {
    const rows = await query<ProfileRow>(
      `INSERT INTO profiles (address, full_name, email, privy_user_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (address) DO UPDATE
         SET full_name = $2, email = $3, privy_user_id = $4, updated_at = now()
       RETURNING ${COLUMNS}`,
      [input.address, input.fullName, input.email, input.privyUserId],
    );
    return rows[0]!;
  },

  async upsertUsernameCache(username: string, usernameHash: string, address: string): Promise<void> {
    await query(
      `INSERT INTO usernames (username, username_hash, address)
       VALUES ($1, $2, $3)
       ON CONFLICT (username) DO UPDATE SET address = $3`,
      [username, usernameHash, address],
    );
  },

  async claimUsername(input: ClaimUsernameInput): Promise<ProfileRow> {
    const rows = await query<ProfileRow>(
      `INSERT INTO profiles (address, username, full_name, email, privy_user_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (address) DO UPDATE
         SET username = $2, full_name = $3, email = $4, privy_user_id = $5, updated_at = now()
       RETURNING ${COLUMNS}`,
      [input.address, input.username, input.fullName, input.email, input.privyUserId],
    );
    return rows[0]!;
  },
};

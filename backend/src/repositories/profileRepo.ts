import { query } from "../db/pool.js";

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

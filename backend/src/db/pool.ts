import pg from "pg";

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ?? "postgres://fluxpay:fluxpay@localhost:5432/fluxpay";

// Supabase requires TLS on remote hosts. Local dev (postgres via docker/backfill) does not.
const isRemote = !/localhost|127\.0\.0\.1/.test(connectionString);

/** Postgres is the read-optimized cache of on-chain truth, never the source of truth. */
export const pool = new Pool({
  connectionString,
  max: 10,
  ssl: isRemote ? { rejectUnauthorized: false } : undefined,
});

export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
  const res = await pool.query(text, params as never[]);
  return res.rows as T[];
}

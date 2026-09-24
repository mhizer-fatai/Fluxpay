-- User profiles: off-chain identity tied to the on-chain username.
CREATE TABLE IF NOT EXISTS profiles (
  address text PRIMARY KEY,
  username text UNIQUE,
  full_name text NOT NULL DEFAULT '',
  email text,
  privy_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profiles_privy_idx ON profiles (privy_user_id);

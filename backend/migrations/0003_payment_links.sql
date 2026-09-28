-- Payment links (request model): creator asks to be paid, payer pays, link flips to paid.
CREATE TABLE IF NOT EXISTS payment_links (
  id text PRIMARY KEY,
  creator_address text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  token text NOT NULL,
  amount numeric(78, 0) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  tx_hash text,
  payer_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS payment_links_creator_idx ON payment_links (creator_address, created_at DESC);

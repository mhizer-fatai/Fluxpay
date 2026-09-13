-- Fluxpay base schema. The chain is the source of truth; these are read-optimized caches.

CREATE TABLE IF NOT EXISTS usernames (
  username      text PRIMARY KEY,
  username_hash text NOT NULL UNIQUE,
  address       text,
  registered_at timestamptz
);

CREATE TABLE IF NOT EXISTS feed_events (
  event_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type  text NOT NULL,
  actor       text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  confirmed   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_events_actor ON feed_events (actor, event_id DESC);
CREATE INDEX IF NOT EXISTS idx_feed_events_confirmed ON feed_events (confirmed);

CREATE TABLE IF NOT EXISTS payments (
  intent_id        uuid PRIMARY KEY,
  idempotency_key  text NOT NULL UNIQUE,
  from_address     text NOT NULL,
  to_address       text NOT NULL,
  asset            text NOT NULL,
  amount           numeric(78, 0) NOT NULL,
  fee              numeric(78, 0) NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'created',
  userop_hash      text,
  tx_hash          text,
  block_num        bigint,
  created_at       timestamptz NOT NULL DEFAULT now(),
  confirmed_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_payments_to ON payments (to_address, confirmed_at DESC);

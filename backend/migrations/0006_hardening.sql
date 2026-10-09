-- Hardening pass: per-link tx uniqueness, scoped idempotency keys, watcher cursor,
-- and duplicate-proof feed events.

-- One on-chain tx can only ever settle one payment link.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_payment_links_tx_hash
  ON payment_links (tx_hash) WHERE tx_hash IS NOT NULL;

-- Idempotency keys are scoped per sender: one user can no longer squat another
-- user's key (or the server's predictable `link:<id>` keys).
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_idempotency_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_payments_key_from
  ON payments (idempotency_key, from_address);

-- Watcher cursor survives restarts (no more re-scanning / silently skipped ranges).
CREATE TABLE IF NOT EXISTS watcher_state (
  id         text PRIMARY KEY,
  last_block bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The same on-chain event must never be recorded twice, even if a tick is retried.
-- Existing duplicates (from earlier retried ticks) are collapsed first, keeping the
-- earliest row per (event_type, txHash, actor).
DELETE FROM feed_events a
USING feed_events b
WHERE a.event_id > b.event_id
  AND a.event_type = b.event_type
  AND a.actor = b.actor
  AND a.payload->>'txHash' = b.payload->>'txHash'
  AND a.payload->>'txHash' IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_feed_events_tx_type
  ON feed_events (event_type, (payload->>'txHash'), actor)
  WHERE payload->>'txHash' IS NOT NULL;

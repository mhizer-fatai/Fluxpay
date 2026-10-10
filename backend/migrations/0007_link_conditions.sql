-- Payment-link conditions ("programmable gifts"): expiry and an optional payer restriction.
-- Expiry is enforced by the API at payment-record time; the deployed PaymentLinkEscrow
-- contract provides the same conditions trustlessly on-chain (next on the roadmap).

ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS payer_allowed text;

CREATE INDEX IF NOT EXISTS idx_payment_links_expires ON payment_links (expires_at) WHERE expires_at IS NOT NULL;

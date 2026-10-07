-- Activity: native-MON sends/receives are read from payments by address
-- (native transfers emit no ERC-20 log). Index both directions.
CREATE INDEX IF NOT EXISTS idx_payments_from ON payments (from_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_asset_from ON payments (asset, from_address);

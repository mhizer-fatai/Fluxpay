-- Fix payments.intent_id: earlier schema had no DEFAULT, so inserts without an
-- explicit intent_id failed with "null value in column intent_id" (HTTP 500 on
-- POST /api/v1/payments/intents). The app now generates the UUID client-side,
-- but keep a server-side default for safety on fresh databases.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
ALTER TABLE IF EXISTS payments ALTER COLUMN intent_id SET DEFAULT gen_random_uuid();

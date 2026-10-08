-- Regular leagues need to tell "fee not set yet" apart from "free (0 won)".
-- Nullable add only: no backfill, existing leagues stay NULL (= unset) and tournaments never read it.
ALTER TABLE "v1_tournaments"
  ADD COLUMN IF NOT EXISTS "entry_fee_configured_at" TIMESTAMP(3);

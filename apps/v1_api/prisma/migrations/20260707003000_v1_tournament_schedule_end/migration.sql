ALTER TABLE "v1_tournaments"
ADD COLUMN IF NOT EXISTS "scheduled_end_at" TIMESTAMP(3);

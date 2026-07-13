ALTER TABLE "v1_tournament_reviews" ADD COLUMN IF NOT EXISTS "hidden_at" TIMESTAMP(3);
ALTER TABLE "v1_tournament_reviews" ADD COLUMN IF NOT EXISTS "hidden_reason" TEXT;

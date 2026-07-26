ALTER TABLE "v1_tournaments" ADD COLUMN IF NOT EXISTS "roster_deadline_at" TIMESTAMP(3);
ALTER TABLE "v1_tournament_registrations" ADD COLUMN IF NOT EXISTS "roster_deadline_override_at" TIMESTAMP(3);

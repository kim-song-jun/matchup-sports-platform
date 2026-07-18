ALTER TABLE "v1_post_event_reviews" ADD COLUMN IF NOT EXISTS "sport_id" TEXT;

CREATE INDEX IF NOT EXISTS "v1_post_event_reviews_target_user_sport_idx"
  ON "v1_post_event_reviews" ("target_user_id", "sport_id", "submitted_at");

CREATE INDEX IF NOT EXISTS "v1_post_event_reviews_target_team_sport_idx"
  ON "v1_post_event_reviews" ("target_team_id", "sport_id", "submitted_at");

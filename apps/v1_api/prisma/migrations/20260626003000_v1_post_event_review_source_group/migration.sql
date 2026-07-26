ALTER TABLE "v1_post_event_reviews" ADD COLUMN "source_group_id" TEXT;

UPDATE "v1_post_event_reviews" AS review
SET "source_group_id" = fixture."tournament_id"
FROM "v1_tournament_fixtures" AS fixture
WHERE review."source_type" = 'tournament_fixture'
  AND review."source_id" = fixture."id";

CREATE UNIQUE INDEX "v1_post_event_reviews_team_source_group_key"
  ON "v1_post_event_reviews"("reviewer_team_id", "target_team_id", "source_type", "source_group_id");

CREATE INDEX "v1_post_event_reviews_source_type_source_group_id_idx"
  ON "v1_post_event_reviews"("source_type", "source_group_id");

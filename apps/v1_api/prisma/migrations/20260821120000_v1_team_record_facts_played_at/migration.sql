ALTER TABLE "v1_team_record_facts"
ADD COLUMN "played_at" TIMESTAMP(3);

UPDATE "v1_team_record_facts" AS fact
SET "played_at" = COALESCE(team_match."start_at", fixture."scheduled_at", fact."official_at")
FROM "v1_games" AS game
LEFT JOIN "v1_team_matches" AS team_match
  ON team_match."id" = game."team_match_id"
LEFT JOIN "v1_tournament_fixtures" AS fixture
  ON fixture."id" = game."tournament_fixture_id"
WHERE game."id" = fact."game_id";

UPDATE "v1_team_record_facts"
SET "played_at" = "official_at"
WHERE "played_at" IS NULL;

ALTER TABLE "v1_team_record_facts"
ALTER COLUMN "played_at" SET NOT NULL;

DROP INDEX IF EXISTS "v1_team_record_facts_team_official_at_idx";
DROP INDEX IF EXISTS "v1_team_record_facts_team_tournament_idx";

CREATE INDEX "v1_team_record_facts_team_played_at_idx"
ON "v1_team_record_facts"("team_id", "played_at");

CREATE INDEX "v1_team_record_facts_team_tournament_played_at_idx"
ON "v1_team_record_facts"("team_id", "tournament_id", "played_at");

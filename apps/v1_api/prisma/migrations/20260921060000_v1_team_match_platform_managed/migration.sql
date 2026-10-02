ALTER TABLE "v1_team_matches"
ADD COLUMN "platform_managed" BOOLEAN NOT NULL DEFAULT false;

UPDATE "v1_team_matches"
SET "platform_managed" = true
WHERE "host_team_id" IS NULL
  AND "league_id" IS NULL
  AND "tournament_id" IS NULL;

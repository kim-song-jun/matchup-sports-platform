-- Persist the first approved platform-recruitment applicant as HOME.
-- This backfills rows created before the approval transaction started writing host_team_id.
UPDATE "v1_team_matches" AS "team_match"
SET
  "host_team_id" = "approved"."applicant_team_id",
  "updated_at" = CURRENT_TIMESTAMP
FROM (
  SELECT
    "team_match_id",
    "applicant_team_id"
  FROM (
    SELECT
      "team_match_id",
      "applicant_team_id",
      COUNT(*) OVER (PARTITION BY "team_match_id") AS "approved_count"
    FROM "v1_team_match_applications"
    WHERE "status" = 'approved'
  ) AS "approved_application"
  WHERE "approved_count" = 1
) AS "approved"
WHERE "team_match"."id" = "approved"."team_match_id"
  AND "team_match"."platform_managed" = true
  AND "team_match"."status" = 'recruiting'
  AND "team_match"."host_team_id" IS NULL
  AND "team_match"."approved_applicant_team_id" IS NULL
  AND "team_match"."league_id" IS NULL
  AND "team_match"."tournament_id" IS NULL;

-- Platform recruitment intentionally has no host until two applications are assigned.
-- Keep every other friendly-match requirement, and retain the host requirement for ordinary matches.
BEGIN;
ALTER TABLE "v1_team_matches" DROP CONSTRAINT "v1_team_matches_friendly_required_ck";
ALTER TABLE "v1_team_matches"
  ADD CONSTRAINT "v1_team_matches_friendly_required_ck"
  CHECK (
    COALESCE("tournament_id", "league_id") IS NOT NULL
    OR (
      ("host_team_id" IS NOT NULL OR "platform_managed" = true)
      AND "created_by_user_id" IS NOT NULL
      AND "region_id" IS NOT NULL
      AND "place_name" IS NOT NULL
      AND "start_at" IS NOT NULL
    )
  );
COMMIT;

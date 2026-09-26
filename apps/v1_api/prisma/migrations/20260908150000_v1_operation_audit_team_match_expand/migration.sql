BEGIN;

-- Task 168: preserve immutable historical fixture audit links while allowing
-- canonical TeamMatch commands to retain their tournament and match scope.
UPDATE "v1_team_matches" SET "tournament_id" = "league_id"
WHERE "tournament_id" IS NULL AND "league_id" IS NOT NULL;

ALTER TABLE "v1_operation_audits" ADD COLUMN "team_match_id" TEXT;
ALTER TABLE "v1_operation_audits"
  ADD CONSTRAINT "v1_operation_audits_team_match_fk"
  FOREIGN KEY ("tournament_id", "team_match_id")
  REFERENCES "v1_team_matches" ("tournament_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "v1_operation_audits"
  ADD CONSTRAINT "v1_operation_audits_team_match_scope_ck" CHECK (
    "team_match_id" IS NULL OR (
      "tournament_id" IS NOT NULL AND
      ("fixture_id" IS NULL OR "fixture_id" = "team_match_id")
    )
  );
CREATE INDEX "v1_operation_audits_team_match_idx"
  ON "v1_operation_audits" ("team_match_id", "created_at");

COMMIT;

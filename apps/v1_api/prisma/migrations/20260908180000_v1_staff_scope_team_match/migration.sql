BEGIN;

-- Canonical tournament TeamMatches can now be staff-scoped without creating a
-- V1TournamentFixture mirror. Existing fixture IDs remain valid at the API boundary.

-- Add the expanded shape and all constraints before touching populated rows. The
-- old scope trigger is deferred, so no ALTER TABLE may follow an update until
-- its pending events have been flushed.
ALTER TABLE "v1_tournament_staff_fixture_scopes"
  ADD COLUMN "team_match_id" TEXT,
  ADD COLUMN "tournament_id" TEXT NOT NULL DEFAULT '';
ALTER TABLE "v1_tournament_staff_fixture_scopes"
  ALTER COLUMN "fixture_id" DROP NOT NULL;

ALTER TABLE "v1_tournament_staff_fixture_scopes"
  ADD CONSTRAINT "v1_staff_scope_source_ck"
  CHECK (num_nonnulls("fixture_id", "team_match_id") = 1),
  ADD CONSTRAINT "v1_staff_scope_tournament_id_ck"
  CHECK ("tournament_id" <> '') NOT VALID;

CREATE UNIQUE INDEX "v1_tournament_staff_fixture_scopes_assignment_team_match_key"
  ON "v1_tournament_staff_fixture_scopes"("assignment_id", "team_match_id");
CREATE INDEX "v1_tournament_staff_fixture_scopes_tournament_team_match_idx"
  ON "v1_tournament_staff_fixture_scopes"("tournament_id", "team_match_id");

ALTER TABLE "v1_tournament_staff_fixture_scopes"
  ADD CONSTRAINT "v1_staff_scope_team_match_fk"
  FOREIGN KEY ("tournament_id", "team_match_id")
  REFERENCES "v1_team_matches"("tournament_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION v1_guard_staff_fixture_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  assignment_tournament TEXT;
  scope_tournament TEXT;
BEGIN
  SELECT tournament_id INTO assignment_tournament
  FROM v1_tournament_staff_assignments
  WHERE id = NEW.assignment_id;

  IF NEW.fixture_id IS NOT NULL THEN
    SELECT tournament_id INTO scope_tournament
    FROM v1_tournament_fixtures
    WHERE id = NEW.fixture_id;
  ELSE
    SELECT tournament_id INTO scope_tournament
    FROM v1_team_matches
    WHERE tournament_id = NEW.tournament_id AND id = NEW.team_match_id;
  END IF;

  IF assignment_tournament IS NULL
     OR scope_tournament IS NULL
     OR NEW.tournament_id <> assignment_tournament
     OR scope_tournament <> assignment_tournament THEN
    RAISE EXCEPTION 'staff scope must stay within tournament' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- Preserve permissions for expanded rows that already have a canonical TeamMatch
-- with the same UUID. The public/admin contract continues to expose that UUID as
-- fixtureId, so this is an internal source switch with no API change.
UPDATE "v1_tournament_staff_fixture_scopes" s
SET "tournament_id" = a."tournament_id",
    "team_match_id" = (
      SELECT tm."id"
      FROM "v1_team_matches" tm
      JOIN "v1_tournament_match_details" d
        ON d."team_match_id" = tm."id"
       AND d."tournament_id" = tm."tournament_id"
      WHERE tm."id" = s."fixture_id"
        AND tm."tournament_id" = a."tournament_id"
    ),
    "fixture_id" = CASE WHEN EXISTS (
      SELECT 1
      FROM "v1_team_matches" tm
      JOIN "v1_tournament_match_details" d
        ON d."team_match_id" = tm."id"
       AND d."tournament_id" = tm."tournament_id"
      WHERE tm."id" = s."fixture_id"
        AND tm."tournament_id" = a."tournament_id"
    ) THEN NULL ELSE s."fixture_id" END
FROM "v1_tournament_staff_assignments" a
WHERE a."id" = s."assignment_id";

-- The update above queued the deferred scope guards. Flush them before the
-- remaining validation/default DDL so populated databases do not hit SQLSTATE 55006.
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "v1_tournament_staff_fixture_scopes"
  VALIDATE CONSTRAINT "v1_staff_scope_tournament_id_ck",
  ALTER COLUMN "tournament_id" DROP DEFAULT;

COMMIT;

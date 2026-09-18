-- Permit only the one-way same-ID fixture -> TeamMatch binding migration.
-- All audit content remains append-only, including future columns added later.
CREATE OR REPLACE FUNCTION v1_reject_operation_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'v1_operation_audits_append_only: DELETE is forbidden' USING ERRCODE = '55000';
  END IF;

  IF OLD.fixture_id IS NULL
     OR OLD.tournament_id IS NULL
     OR NEW.fixture_id IS NOT NULL
     OR NEW.team_match_id IS DISTINCT FROM OLD.fixture_id
     OR (OLD.team_match_id IS NOT NULL AND OLD.team_match_id IS DISTINCT FROM OLD.fixture_id)
     OR OLD.tournament_id IS DISTINCT FROM NEW.tournament_id
     OR NOT EXISTS (
       SELECT 1 FROM "v1_tournament_fixtures" fixture
       WHERE fixture.id = OLD.fixture_id
         AND fixture.tournament_id = OLD.tournament_id
     )
     OR NOT EXISTS (
       SELECT 1 FROM "v1_team_matches" match
       WHERE match.id = NEW.team_match_id
         AND match.tournament_id = NEW.tournament_id
     )
     OR NOT EXISTS (
       SELECT 1 FROM "v1_tournament_match_details" details
       WHERE details.team_match_id = NEW.team_match_id
         AND details.tournament_id = NEW.tournament_id
     )
     OR (to_jsonb(NEW) - 'fixture_id' - 'team_match_id') IS DISTINCT FROM
        (to_jsonb(OLD) - 'fixture_id' - 'team_match_id') THEN
    RAISE EXCEPTION 'v1_operation_audits_append_only: UPDATE is forbidden except same-ID canonical binding' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

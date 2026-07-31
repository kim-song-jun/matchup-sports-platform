BEGIN;

CREATE OR REPLACE FUNCTION v1_validate_competition_config() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF jsonb_typeof(NEW.periods) <> 'array'
    OR jsonb_array_length(NEW.periods) = 0
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(NEW.periods) period
      WHERE jsonb_typeof(period) <> 'object'
        OR COALESCE((period->>'durationMinutes')::integer, 0) <= 0
        OR NULLIF(period->>'code', '') IS NULL
        OR NULLIF(period->>'label', '') IS NULL
        OR jsonb_typeof(period->'extraTime') <> 'boolean'
    )
  THEN
    RAISE EXCEPTION 'COMPETITION_CONFIG_INVALID: periods' USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(NEW.events) <> 'array'
    OR jsonb_array_length(NEW.events) = 0
    OR NOT NEW.events ? 'GOAL'
  THEN
    RAISE EXCEPTION 'COMPETITION_CONFIG_INVALID: events' USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(NEW.lineup) <> 'object'
    OR COALESCE((NEW.lineup->>'minPlayers')::integer, 0) < 1
    OR COALESCE((NEW.lineup->>'maxPlayers')::integer, 0) < COALESCE((NEW.lineup->>'minPlayers')::integer, 0)
    OR COALESCE(NEW.lineup->>'substitutions', '') NOT IN ('limited', 'rolling')
    OR (
      NEW.lineup->'maxSubstitutions' <> 'null'::jsonb
      AND COALESCE((NEW.lineup->>'maxSubstitutions')::integer, -1) < 0
    )
  THEN
    RAISE EXCEPTION 'COMPETITION_CONFIG_INVALID: lineup' USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(NEW.result) <> 'object'
    OR COALESCE(NEW.result->>'tournamentScorerPolicy', '') NOT IN ('required', 'optional')
    OR COALESCE(NEW.result->>'teamMatchScorerPolicy', '') <> 'optional_with_warning'
    OR COALESCE((NEW.result->>'mvpMin')::integer, -1) <> 0
    OR COALESCE((NEW.result->>'mvpMax')::integer, -1) <> 1
  THEN
    RAISE EXCEPTION 'COMPETITION_CONFIG_INVALID: result' USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(NEW.tie_break) <> 'object'
    OR jsonb_typeof(NEW.tie_break->'points') <> 'object'
    OR jsonb_typeof(NEW.tie_break->'points'->'win') <> 'number'
    OR jsonb_typeof(NEW.tie_break->'points'->'draw') <> 'number'
    OR jsonb_typeof(NEW.tie_break->'points'->'loss') <> 'number'
    OR NEW.tie_break->'order' <> '["points","head_to_head","goal_difference","goals_for","fair_play","seeded_draw"]'::jsonb
    OR COALESCE(NEW.tie_break->>'seededDraw', '') <> 'sha256-v1'
  THEN
    RAISE EXCEPTION 'COMPETITION_CONFIG_INVALID: tie_break' USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(NEW.visibility) <> 'object'
    OR COALESCE(NEW.visibility->>'default', '') <> 'live'
    OR NOT COALESCE(NEW.visibility->'allowed', '[]'::jsonb) @> '["live","official"]'::jsonb
    OR jsonb_array_length(COALESCE(NEW.visibility->'allowed', '[]'::jsonb)) <> 2
  THEN
    RAISE EXCEPTION 'COMPETITION_CONFIG_INVALID: visibility' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER v1_validate_competition_config
BEFORE INSERT OR UPDATE ON v1_competition_config_versions
FOR EACH ROW EXECUTE FUNCTION v1_validate_competition_config();

INSERT INTO v1_competition_config_versions (
  id, sport_code, name, version, status, periods, events, lineup, result,
  tie_break, visibility, content_hash, created_by_user_id, created_at, updated_at
) VALUES
(
  '11111111-1111-4111-8111-111111111111',
  'football',
  'football-v1',
  1,
  'ACTIVE',
  '[{"code":"FIRST_HALF","label":"전반","durationMinutes":45,"extraTime":false},{"code":"SECOND_HALF","label":"후반","durationMinutes":45,"extraTime":false}]',
  '["GOAL","OWN_GOAL","YELLOW_CARD","RED_CARD","SUBSTITUTION"]',
  '{"minPlayers":7,"maxPlayers":11,"substitutions":"limited","maxSubstitutions":5}',
  '{"tournamentScorerPolicy":"required","teamMatchScorerPolicy":"optional_with_warning","mvpMin":0,"mvpMax":1}',
  '{"points":{"win":3,"draw":1,"loss":0},"order":["points","head_to_head","goal_difference","goals_for","fair_play","seeded_draw"],"seededDraw":"sha256-v1"}',
  '{"default":"live","allowed":["live","official"]}',
  '60b7ecf936bc02ede713b204bef345ceab57188aad50271f56c5f6ca1957b31c',
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  '22222222-2222-4222-8222-222222222222',
  'futsal',
  'futsal-v1',
  1,
  'ACTIVE',
  '[{"code":"FIRST_HALF","label":"전반","durationMinutes":20,"extraTime":false},{"code":"SECOND_HALF","label":"후반","durationMinutes":20,"extraTime":false}]',
  '["GOAL","OWN_GOAL","YELLOW_CARD","RED_CARD","SUBSTITUTION","TEAM_FOUL"]',
  '{"minPlayers":3,"maxPlayers":5,"substitutions":"rolling","maxSubstitutions":null}',
  '{"tournamentScorerPolicy":"required","teamMatchScorerPolicy":"optional_with_warning","mvpMin":0,"mvpMax":1}',
  '{"points":{"win":3,"draw":1,"loss":0},"order":["points","head_to_head","goal_difference","goals_for","fair_play","seeded_draw"],"seededDraw":"sha256-v1"}',
  '{"default":"live","allowed":["live","official"]}',
  '769fa5d3ddb9284e98b53ef368f46be75004ae1a06c1039486cdc494eaa648d8',
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

ALTER TABLE v1_tournaments ADD COLUMN competition_config_version_id TEXT;

CREATE OR REPLACE FUNCTION v1_assert_competition_config_source_supported(
  source_type TEXT,
  source_id TEXT,
  sport_code TEXT
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF sport_code IS NULL OR lower(sport_code) NOT IN ('soccer', 'football', 'futsal') THEN
    RAISE EXCEPTION 'COMPETITION_CONFIG_SOURCE_UNSUPPORTED: % % %',
      source_type,
      source_id,
      COALESCE(sport_code, '<missing>')
      USING ERRCODE = '23514';
  END IF;
END $$;

DO $$
DECLARE
  unsupported record;
BEGIN
  SELECT source_type, source_id, sport_code
  INTO unsupported
  FROM (
    SELECT 'tournament' AS source_type, tournament.id AS source_id, sport.code AS sport_code
    FROM v1_tournaments tournament
    LEFT JOIN v1_sports sport ON sport.id = tournament.sport_id
    WHERE sport.code IS NULL OR lower(sport.code) NOT IN ('soccer', 'football', 'futsal')
    UNION ALL
    SELECT 'team_match', team_match.id, sport.code
    FROM v1_team_matches team_match
    LEFT JOIN v1_sports sport ON sport.id = team_match.sport_id
    WHERE sport.code IS NULL OR lower(sport.code) NOT IN ('soccer', 'football', 'futsal')
  ) invalid_source
  LIMIT 1;

  IF FOUND THEN
    PERFORM v1_assert_competition_config_source_supported(
      unsupported.source_type,
      unsupported.source_id,
      unsupported.sport_code
    );
  END IF;
END $$;

UPDATE v1_tournaments tournament
SET competition_config_version_id = CASE
  WHEN lower(sport.code) IN ('soccer', 'football') THEN '11111111-1111-4111-8111-111111111111'
  WHEN lower(sport.code) = 'futsal' THEN '22222222-2222-4222-8222-222222222222'
END
FROM v1_sports sport
WHERE sport.id = tournament.sport_id;

UPDATE v1_team_matches team_match
SET competition_config_version_id = CASE
  WHEN lower(sport.code) IN ('soccer', 'football') THEN '11111111-1111-4111-8111-111111111111'
  WHEN lower(sport.code) = 'futsal' THEN '22222222-2222-4222-8222-222222222222'
END
FROM v1_sports sport
WHERE sport.id = team_match.sport_id;

UPDATE v1_tournament_fixtures fixture
SET competition_config_version_id = tournament.competition_config_version_id
FROM v1_tournaments tournament
WHERE tournament.id = fixture.tournament_id;

ALTER TABLE v1_tournaments ALTER COLUMN competition_config_version_id SET NOT NULL;
ALTER TABLE v1_team_matches ALTER COLUMN competition_config_version_id SET NOT NULL;
ALTER TABLE v1_tournament_fixtures ALTER COLUMN competition_config_version_id SET NOT NULL;

CREATE OR REPLACE FUNCTION v1_default_competition_config_version() RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT '00000000-0000-0000-0000-000000000000'::text
$$;

ALTER TABLE v1_tournaments
  ALTER COLUMN competition_config_version_id SET DEFAULT v1_default_competition_config_version();
ALTER TABLE v1_team_matches
  ALTER COLUMN competition_config_version_id SET DEFAULT v1_default_competition_config_version();
ALTER TABLE v1_tournament_fixtures
  ALTER COLUMN competition_config_version_id SET DEFAULT v1_default_competition_config_version();

ALTER TABLE v1_tournaments
  ADD CONSTRAINT v1_tournaments_competition_config_fk
  FOREIGN KEY (competition_config_version_id)
  REFERENCES v1_competition_config_versions(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX v1_tournaments_competition_config_idx
  ON v1_tournaments(competition_config_version_id);
CREATE INDEX v1_team_matches_competition_config_idx
  ON v1_team_matches(competition_config_version_id);
CREATE INDEX v1_tournament_fixtures_competition_config_idx
  ON v1_tournament_fixtures(competition_config_version_id);

CREATE OR REPLACE FUNCTION v1_competition_config_for_sport(source_sport_id TEXT)
RETURNS TEXT LANGUAGE plpgsql STABLE AS $$
DECLARE
  source_code TEXT;
  config_id TEXT;
BEGIN
  IF source_sport_id IS NULL THEN
    RAISE EXCEPTION 'COMPETITION_CONFIG_SPORT_REQUIRED' USING ERRCODE = '23514';
  END IF;
  SELECT lower(code) INTO source_code FROM v1_sports WHERE id = source_sport_id;
  IF source_code IS NULL THEN
    RAISE EXCEPTION 'COMPETITION_CONFIG_SPORT_REQUIRED' USING ERRCODE = '23514';
  END IF;
  config_id := CASE
    WHEN source_code IN ('soccer', 'football') THEN '11111111-1111-4111-8111-111111111111'
    WHEN source_code = 'futsal' THEN '22222222-2222-4222-8222-222222222222'
    ELSE NULL
  END;
  IF config_id IS NULL THEN
    RAISE EXCEPTION 'COMPETITION_CONFIG_SPORT_UNSUPPORTED: %', source_code USING ERRCODE = '23514';
  END IF;
  RETURN config_id;
END $$;

CREATE OR REPLACE FUNCTION v1_pin_sport_competition_config() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  expected_id TEXT;
  selected_sport_code TEXT;
  config_sport_code TEXT;
BEGIN
  expected_id := v1_competition_config_for_sport(NEW.sport_id);
  IF NEW.competition_config_version_id IS NULL
    OR NEW.competition_config_version_id = '00000000-0000-0000-0000-000000000000'
  THEN
    NEW.competition_config_version_id := expected_id;
  END IF;
  SELECT lower(code) INTO selected_sport_code FROM v1_sports WHERE id = NEW.sport_id;
  SELECT lower(sport_code) INTO config_sport_code
    FROM v1_competition_config_versions
    WHERE id = NEW.competition_config_version_id;
  IF config_sport_code IS NULL
    OR (selected_sport_code IN ('soccer', 'football') AND config_sport_code <> 'football')
    OR (selected_sport_code = 'futsal' AND config_sport_code <> 'futsal')
  THEN
    RAISE EXCEPTION 'COMPETITION_CONFIG_SPORT_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER v1_pin_tournament_competition_config
BEFORE INSERT OR UPDATE OF sport_id, competition_config_version_id ON v1_tournaments
FOR EACH ROW EXECUTE FUNCTION v1_pin_sport_competition_config();

CREATE TRIGGER v1_pin_team_match_competition_config
BEFORE INSERT OR UPDATE OF sport_id, competition_config_version_id ON v1_team_matches
FOR EACH ROW EXECUTE FUNCTION v1_pin_sport_competition_config();

CREATE OR REPLACE FUNCTION v1_pin_fixture_competition_config() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  tournament_config_id TEXT;
BEGIN
  SELECT competition_config_version_id INTO tournament_config_id
  FROM v1_tournaments
  WHERE id = NEW.tournament_id;
  IF tournament_config_id IS NULL THEN
    RAISE EXCEPTION 'COMPETITION_CONFIG_TOURNAMENT_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF NEW.competition_config_version_id IS NULL
    OR NEW.competition_config_version_id = '00000000-0000-0000-0000-000000000000'
  THEN
    NEW.competition_config_version_id := tournament_config_id;
  ELSIF (
    TG_OP = 'INSERT'
    OR NEW.competition_config_version_id IS DISTINCT FROM OLD.competition_config_version_id
  ) AND NEW.competition_config_version_id <> tournament_config_id THEN
    RAISE EXCEPTION 'COMPETITION_CONFIG_FIXTURE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER v1_pin_fixture_competition_config
BEFORE INSERT OR UPDATE OF tournament_id, competition_config_version_id ON v1_tournament_fixtures
FOR EACH ROW EXECUTE FUNCTION v1_pin_fixture_competition_config();

CREATE OR REPLACE FUNCTION v1_block_used_config_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM v1_games WHERE competition_config_version_id = OLD.id)
    OR EXISTS (SELECT 1 FROM v1_tournaments WHERE competition_config_version_id = OLD.id)
    OR EXISTS (SELECT 1 FROM v1_team_matches WHERE competition_config_version_id = OLD.id)
    OR EXISTS (SELECT 1 FROM v1_tournament_fixtures WHERE competition_config_version_id = OLD.id)
  THEN
    RAISE EXCEPTION 'COMPETITION_CONFIG_VERSION_IN_USE' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

COMMIT;

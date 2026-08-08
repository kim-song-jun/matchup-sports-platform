-- Expand phase only. This migration used to also seed config rows, backfill
-- competition_config_version_id on existing v1_tournaments/v1_team_matches/
-- v1_tournament_fixtures rows, SET NOT NULL/SET DEFAULT on that column, add
-- the v1_tournaments FK, and attach v1_pin_*_competition_config triggers to
-- those three pre-existing tables in one shot. That combination is rejected
-- by scripts/qa/check-expand-contract-migrations.mjs (the alpha rollback
-- compatibility gate) because a legacy app instance rolled back onto this
-- DB state would have its plain `UPDATE ... SET sport_id = ...` calls
-- rejected by the new pin triggers, and its INSERTs would violate the new
-- NOT NULL constraint. See docs/ops/task9-competition-config-contract-phase.md
-- for exactly what moved out, where it went, and when it is safe to apply
-- the deferred contract-phase migration.
--
-- Seeding + backfill now lives in
-- apps/v1_api/src/tournaments/competition-config/competition-config-backfill.ts
-- (run via .cli.ts), matching the apps/v1_api/prisma/migrations/
-- 20260803000100_v1_task10_game_result_backfill precedent of keeping DML out
-- of migration.sql entirely.

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

CREATE OR REPLACE FUNCTION v1_default_competition_config_version() RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT '00000000-0000-0000-0000-000000000000'::text
$$;

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

-- v1_pin_sport_competition_config()/v1_pin_fixture_competition_config() are
-- defined here (harmless — defining a function does not run it) but the
-- CREATE TRIGGER statements that attach them to v1_tournaments/
-- v1_team_matches/v1_tournament_fixtures are part of the deferred
-- contract-phase migration: those triggers intercept
-- `UPDATE OF sport_id`/`UPDATE OF tournament_id`, which pre-existing
-- (legacy) app code already performs on these tables today, and would
-- start rejecting an old app instance's plain sport_id-only update with
-- COMPETITION_CONFIG_SPORT_MISMATCH if attached before every existing row
-- has a valid competition_config_version_id.
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

-- v1_tournaments_competition_config_fk is safe to add here (unlike the
-- SET NOT NULL/SET DEFAULT/pin-trigger statements above) because
-- competition_config_version_id is still nullable at this point in the
-- migration (its SET NOT NULL was moved to the contract-phase migration) —
-- Postgres FK checks never reject a NULL referencing column, so no
-- pre-existing row (which is NULL here until the backfill CLI runs) can
-- violate it.
ALTER TABLE v1_tournaments
  ADD CONSTRAINT v1_tournaments_competition_config_fk
  FOREIGN KEY (competition_config_version_id)
  REFERENCES v1_competition_config_versions(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

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

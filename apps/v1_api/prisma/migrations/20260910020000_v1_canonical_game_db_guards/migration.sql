-- Task 168: seal the remaining database guards on the canonical Game ->
-- TeamMatch -> (TournamentMatchDetails | league) graph.  This migration is
-- intentionally additive: the old columns remain until the final schema
-- retirement migration, but no guard reads the legacy fixture table.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  legacy_games BIGINT;
  legacy_staff_scopes BIGINT;
  legacy_audits BIGINT;
  legacy_fixtures BIGINT;
  retired_write_seals BIGINT;
  retired_link_seals BIGINT;
  retired_write_tables BIGINT;
  retired_link_tables BIGINT;
  retired_write_function_missing BOOLEAN;
  retired_link_function_missing BOOLEAN;
  retired_table TEXT;
  retired_row_seals BIGINT;
BEGIN
  LOCK TABLE "v1_games" IN EXCLUSIVE MODE;
  LOCK TABLE "v1_operation_audits" IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE "v1_tournament_staff_fixture_scopes" IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE "v1_tournament_fixtures", "v1_tournament_fixture_results",
    "v1_tournament_fixture_goals", "v1_tournament_fixture_videos",
    "v1_tournament_fixture_advancement_edges" IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*) INTO legacy_games
    FROM "v1_games"
   WHERE "source_type"::text = 'TOURNAMENT_FIXTURE'
      OR "tournament_fixture_id" IS NOT NULL;
  SELECT count(*) INTO legacy_staff_scopes
    FROM "v1_tournament_staff_fixture_scopes"
   WHERE "fixture_id" IS NOT NULL;
  SELECT count(*) INTO legacy_audits
    FROM "v1_operation_audits"
   WHERE "fixture_id" IS NOT NULL;
  SELECT count(*) INTO legacy_fixtures
    FROM "v1_tournament_fixtures";

  -- Existing historical fixtures require a previously committed full cutover
  -- seal. Hold the tables so writes or trigger changes cannot race this gate.
  SELECT count(*) INTO retired_write_tables
    FROM (VALUES
      ('v1_tournament_fixtures'),
      ('v1_tournament_fixture_results'),
      ('v1_tournament_fixture_goals'),
      ('v1_tournament_fixture_videos'),
      ('v1_tournament_fixture_advancement_edges')
    ) AS wanted(table_name)
   WHERE to_regclass(wanted.table_name) IS NOT NULL;
  SELECT count(*) INTO retired_link_tables
    FROM (VALUES ('v1_games'), ('v1_tournament_staff_fixture_scopes'), ('v1_operation_audits'))
      AS wanted(table_name)
   WHERE to_regclass(wanted.table_name) IS NOT NULL;
  SELECT count(*) INTO retired_write_seals
    FROM pg_trigger t
   WHERE t.tgname = 'v1_tournament_fixture_retired_write'
     AND t.tgfoid = to_regprocedure('v1_reject_retired_tournament_fixture_write()')
     AND t.tgenabled = 'A'
     AND t.tgtype::int = 62
     AND NOT t.tgisinternal
     AND t.tgrelid IN (
       to_regclass('v1_tournament_fixtures'),
       to_regclass('v1_tournament_fixture_results'),
       to_regclass('v1_tournament_fixture_goals'),
       to_regclass('v1_tournament_fixture_videos'),
       to_regclass('v1_tournament_fixture_advancement_edges')
     );
  SELECT count(*) INTO retired_link_seals
    FROM pg_trigger t
   WHERE t.tgname = 'v1_000_tournament_fixture_retired_link'
     AND t.tgfoid = to_regprocedure('v1_reject_retired_tournament_fixture_link()')
     AND t.tgenabled = 'A'
     AND t.tgtype::int = 23
     AND NOT t.tgisinternal
     AND t.tgrelid IN (
       to_regclass('v1_games'),
       to_regclass('v1_tournament_staff_fixture_scopes'),
       to_regclass('v1_operation_audits')
     );
  retired_write_function_missing := to_regprocedure('v1_reject_retired_tournament_fixture_write()') IS NULL;
  retired_link_function_missing := to_regprocedure('v1_reject_retired_tournament_fixture_link()') IS NULL;

  IF legacy_fixtures > 0 AND (
       retired_write_tables <> 5 OR retired_link_tables <> 3
       OR retired_write_seals <> 5 OR retired_link_seals <> 3
       OR retired_write_function_missing OR retired_link_function_missing
     ) THEN
    RAISE EXCEPTION
      'CANONICAL_GAME_GUARD_PRECONDITION_FAILED legacy_fixtures=% write_tables=% write_seals=% link_tables=% link_seals=% write_fn_missing=% link_fn_missing=%',
      legacy_fixtures, retired_write_tables, retired_write_seals,
      retired_link_tables, retired_link_seals,
      retired_write_function_missing, retired_link_function_missing
      USING ERRCODE = '55000';
  END IF;

  IF legacy_games <> 0 OR legacy_staff_scopes <> 0 OR legacy_audits <> 0 THEN
    RAISE EXCEPTION
      'CANONICAL_GAME_GUARD_PRECONDITION_FAILED games=% staff_scopes=% audits=%',
      legacy_games, legacy_staff_scopes, legacy_audits
      USING ERRCODE = '55000';
  END IF;

  -- Install the same ALWAYS seals used by the full cutover even when the
  -- fixture tables are empty.  Otherwise a clean database could pass this
  -- gate and accept a new legacy row immediately afterwards.
  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION v1_reject_retired_tournament_fixture_write()
    RETURNS trigger LANGUAGE plpgsql AS $seal$
    BEGIN
      IF TG_LEVEL = 'STATEMENT' AND TG_OP IN ('UPDATE', 'DELETE') AND pg_trigger_depth() > 1 THEN
        RETURN NULL;
      END IF;
      RAISE EXCEPTION 'tournament_fixture_retired: % on % is forbidden', TG_OP, TG_TABLE_NAME
        USING ERRCODE = '55000';
    END;
    $seal$;
  $fn$;
  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION v1_reject_retired_tournament_fixture_link()
    RETURNS trigger LANGUAGE plpgsql AS $seal$
    BEGIN
      IF TG_TABLE_NAME = 'v1_games' THEN
        IF NEW.tournament_fixture_id IS NOT NULL OR NEW.source_type::text = 'TOURNAMENT_FIXTURE' THEN
          RAISE EXCEPTION 'tournament_fixture_retired: legacy game source is forbidden' USING ERRCODE = '55000';
        END IF;
      ELSIF NEW.fixture_id IS NOT NULL THEN
        RAISE EXCEPTION 'tournament_fixture_retired: legacy fixture scope is forbidden' USING ERRCODE = '55000';
      END IF;
      RETURN NEW;
    END;
    $seal$;
  $fn$;
  EXECUTE 'CREATE OR REPLACE TRIGGER v1_tournament_fixture_retired_write
    BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON "v1_tournament_fixtures"
    FOR EACH STATEMENT EXECUTE FUNCTION v1_reject_retired_tournament_fixture_write()';
  EXECUTE 'CREATE OR REPLACE TRIGGER v1_tournament_fixture_retired_write
    BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON "v1_tournament_fixture_results"
    FOR EACH STATEMENT EXECUTE FUNCTION v1_reject_retired_tournament_fixture_write()';
  EXECUTE 'CREATE OR REPLACE TRIGGER v1_tournament_fixture_retired_write
    BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON "v1_tournament_fixture_goals"
    FOR EACH STATEMENT EXECUTE FUNCTION v1_reject_retired_tournament_fixture_write()';
  EXECUTE 'CREATE OR REPLACE TRIGGER v1_tournament_fixture_retired_write
    BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON "v1_tournament_fixture_videos"
    FOR EACH STATEMENT EXECUTE FUNCTION v1_reject_retired_tournament_fixture_write()';
  EXECUTE 'CREATE OR REPLACE TRIGGER v1_tournament_fixture_retired_write
    BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON "v1_tournament_fixture_advancement_edges"
    FOR EACH STATEMENT EXECUTE FUNCTION v1_reject_retired_tournament_fixture_write()';
  EXECUTE 'ALTER TABLE "v1_tournament_fixtures" ENABLE ALWAYS TRIGGER v1_tournament_fixture_retired_write';
  EXECUTE 'ALTER TABLE "v1_tournament_fixture_results" ENABLE ALWAYS TRIGGER v1_tournament_fixture_retired_write';
  EXECUTE 'ALTER TABLE "v1_tournament_fixture_goals" ENABLE ALWAYS TRIGGER v1_tournament_fixture_retired_write';
  EXECUTE 'ALTER TABLE "v1_tournament_fixture_videos" ENABLE ALWAYS TRIGGER v1_tournament_fixture_retired_write';
  EXECUTE 'ALTER TABLE "v1_tournament_fixture_advancement_edges" ENABLE ALWAYS TRIGGER v1_tournament_fixture_retired_write';
  -- Cascading FK statements with no matching legacy rows must not block live
  -- canonical deletes. This row guard blocks every actual nested mutation.
  FOREACH retired_table IN ARRAY ARRAY[
    'v1_tournament_fixtures', 'v1_tournament_fixture_results',
    'v1_tournament_fixture_goals', 'v1_tournament_fixture_videos',
    'v1_tournament_fixture_advancement_edges'
  ] LOOP
    EXECUTE format('CREATE OR REPLACE TRIGGER v1_tournament_fixture_retired_row_write
      BEFORE UPDATE OR DELETE ON %I FOR EACH ROW
      EXECUTE FUNCTION v1_reject_retired_tournament_fixture_write()', retired_table);
    EXECUTE format('ALTER TABLE %I ENABLE ALWAYS TRIGGER v1_tournament_fixture_retired_row_write', retired_table);
  END LOOP;
  EXECUTE 'CREATE OR REPLACE TRIGGER v1_000_tournament_fixture_retired_link
    BEFORE INSERT OR UPDATE ON "v1_games"
    FOR EACH ROW EXECUTE FUNCTION v1_reject_retired_tournament_fixture_link()';
  EXECUTE 'CREATE OR REPLACE TRIGGER v1_000_tournament_fixture_retired_link
    BEFORE INSERT OR UPDATE ON "v1_tournament_staff_fixture_scopes"
    FOR EACH ROW EXECUTE FUNCTION v1_reject_retired_tournament_fixture_link()';
  EXECUTE 'CREATE OR REPLACE TRIGGER v1_000_tournament_fixture_retired_link
    BEFORE INSERT OR UPDATE ON "v1_operation_audits"
    FOR EACH ROW EXECUTE FUNCTION v1_reject_retired_tournament_fixture_link()';
  EXECUTE 'ALTER TABLE "v1_games" ENABLE ALWAYS TRIGGER v1_000_tournament_fixture_retired_link';
  EXECUTE 'ALTER TABLE "v1_tournament_staff_fixture_scopes" ENABLE ALWAYS TRIGGER v1_000_tournament_fixture_retired_link';
  EXECUTE 'ALTER TABLE "v1_operation_audits" ENABLE ALWAYS TRIGGER v1_000_tournament_fixture_retired_link';
  SELECT count(*) INTO retired_row_seals FROM pg_trigger
   WHERE tgname = 'v1_tournament_fixture_retired_row_write'
     AND tgfoid = to_regprocedure('v1_reject_retired_tournament_fixture_write()')
     AND tgtype::int = 27 AND tgenabled = 'A' AND NOT tgisinternal
     AND tgrelid IN (
       'v1_tournament_fixtures'::regclass, 'v1_tournament_fixture_results'::regclass,
       'v1_tournament_fixture_goals'::regclass, 'v1_tournament_fixture_videos'::regclass,
       'v1_tournament_fixture_advancement_edges'::regclass
     );
  IF retired_row_seals <> 5 THEN
    RAISE EXCEPTION 'CANONICAL_GAME_GUARD_ROW_SEAL_INCOMPLETE count=%', retired_row_seals USING ERRCODE = '55000';
  END IF;

  ALTER TABLE "v1_games"
    ADD CONSTRAINT "v1_games_canonical_source_guard_ck"
    CHECK ("source_type"::text <> 'TOURNAMENT_FIXTURE' AND "tournament_fixture_id" IS NULL)
    NOT VALID;
  ALTER TABLE "v1_tournament_staff_fixture_scopes"
    ADD CONSTRAINT "v1_staff_scope_canonical_source_guard_ck"
    CHECK ("fixture_id" IS NULL AND "team_match_id" IS NOT NULL)
    NOT VALID;
  ALTER TABLE "v1_operation_audits"
    ADD CONSTRAINT "v1_operation_audits_canonical_source_guard_ck"
    CHECK ("fixture_id" IS NULL)
    NOT VALID;
  ALTER TABLE "v1_games"
    VALIDATE CONSTRAINT "v1_games_canonical_source_guard_ck";
  ALTER TABLE "v1_tournament_staff_fixture_scopes"
    VALIDATE CONSTRAINT "v1_staff_scope_canonical_source_guard_ck";
  ALTER TABLE "v1_operation_audits"
    VALIDATE CONSTRAINT "v1_operation_audits_canonical_source_guard_ck";
END $$;

-- Resolve and validate the only source accepted by the runtime guards.  The
-- nullable tournament_id on a TeamMatch is intentional: a league match owns
-- its competition through league_id, while a tournament match owns it through
-- Details.  Friendly matches have neither owner and no Details row.
CREATE OR REPLACE FUNCTION v1_resolve_canonical_guard_game(p_game_id TEXT)
RETURNS TABLE (
  team_match_id TEXT,
  semantic_tournament_id TEXT,
  home_team_id TEXT,
  away_team_id TEXT
)
LANGUAGE plpgsql AS $$
DECLARE
  game_source TEXT;
  game_team_match_id TEXT;
  legacy_fixture_id TEXT;
  tm_tournament_id TEXT;
  tm_league_id TEXT;
  details_team_match_id TEXT;
  details_tournament_id TEXT;
  details_exist BOOLEAN;
BEGIN
  SELECT g."source_type"::text, g."team_match_id", g."tournament_fixture_id"
    INTO game_source, game_team_match_id, legacy_fixture_id
    FROM "v1_games" g
   WHERE g."id" = p_game_id
   FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'canonical game source does not exist' USING ERRCODE = '23514';
  END IF;
  IF game_source <> 'TEAM_MATCH' OR legacy_fixture_id IS NOT NULL THEN
    RAISE EXCEPTION 'canonical game source must be TEAM_MATCH without legacy fixture binding'
      USING ERRCODE = '23514';
  END IF;
  IF game_team_match_id IS NULL THEN
    RAISE EXCEPTION 'TEAM_MATCH game requires TeamMatch ownership' USING ERRCODE = '23514';
  END IF;

  SELECT tm."tournament_id", tm."league_id", d."team_match_id", d."tournament_id"
    INTO tm_tournament_id, tm_league_id, details_team_match_id, details_tournament_id
    FROM "v1_team_matches" tm
    LEFT JOIN "v1_tournament_match_details" d
      ON d."team_match_id" = tm."id"
     AND d."tournament_id" = tm."tournament_id"
   WHERE tm."id" = game_team_match_id
     AND tm."deleted_at" IS NULL
   FOR KEY SHARE OF tm;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'canonical game TeamMatch is missing or deleted' USING ERRCODE = '23514';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM "v1_tournament_match_details" d
     WHERE d."team_match_id" = game_team_match_id
  ) INTO details_exist;
  IF details_exist AND details_team_match_id IS NULL THEN
    RAISE EXCEPTION 'canonical TeamMatch has mismatched tournament details' USING ERRCODE = '23514';
  END IF;
  IF tm_league_id IS NOT NULL AND details_team_match_id IS NOT NULL THEN
    RAISE EXCEPTION 'league TeamMatch cannot have tournament match details' USING ERRCODE = '23514';
  END IF;
  IF tm_league_id IS NOT NULL
     AND tm_tournament_id IS NOT NULL
     AND tm_league_id IS DISTINCT FROM tm_tournament_id THEN
    RAISE EXCEPTION 'league TeamMatch has conflicting ownership' USING ERRCODE = '23514';
  END IF;
  IF tm_league_id IS NULL THEN
    IF tm_tournament_id IS NULL THEN
      IF details_exist THEN
        RAISE EXCEPTION 'friendly TeamMatch cannot have tournament details' USING ERRCODE = '23514';
      END IF;
    ELSIF details_team_match_id IS DISTINCT FROM game_team_match_id
       OR details_tournament_id IS DISTINCT FROM tm_tournament_id THEN
      RAISE EXCEPTION 'tournament TeamMatch requires matching tournament details'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  team_match_id := game_team_match_id;
  semantic_tournament_id := CASE WHEN tm_league_id IS NULL THEN details_tournament_id ELSE NULL END;
  SELECT s."team_id" INTO home_team_id
    FROM "v1_game_sides" s WHERE s."game_id" = p_game_id AND s."side_key" = 'HOME';
  SELECT s."team_id" INTO away_team_id
    FROM "v1_game_sides" s WHERE s."game_id" = p_game_id AND s."side_key" = 'AWAY';
  RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION v1_guard_game_official_fact_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  revision_row RECORD;
  source_row RECORD;
  revision_home JSONB;
  revision_away JSONB;
BEGIN
  SELECT state, revision, score, events_hash, official_at
    INTO revision_row
    FROM "v1_game_result_revisions"
   WHERE game_id = NEW.game_id AND id = NEW.revision_id
   FOR KEY SHARE;
  IF NOT FOUND OR revision_row.state IS DISTINCT FROM 'OFFICIAL' OR revision_row.official_at IS NULL THEN
    RAISE EXCEPTION 'official fact requires an official game revision' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO source_row FROM v1_resolve_canonical_guard_game(NEW.game_id);
  revision_home := COALESCE(revision_row.score -> 'home', revision_row.score -> 'regulation' -> 'home');
  revision_away := COALESCE(revision_row.score -> 'away', revision_row.score -> 'regulation' -> 'away');
  IF NEW.revision IS DISTINCT FROM revision_row.revision
     OR NEW.source_type::text IS DISTINCT FROM 'TEAM_MATCH'
     OR NEW.tournament_id IS DISTINCT FROM source_row.semantic_tournament_id
     OR NEW.home_team_id IS DISTINCT FROM source_row.home_team_id
     OR NEW.away_team_id IS DISTINCT FROM source_row.away_team_id
     OR NEW.score IS DISTINCT FROM revision_row.score
     OR NEW.events_hash IS DISTINCT FROM revision_row.events_hash
     OR NEW.official_at IS DISTINCT FROM revision_row.official_at
     OR jsonb_typeof(revision_home) IS DISTINCT FROM 'number'
     OR jsonb_typeof(revision_away) IS DISTINCT FROM 'number'
     OR NEW.home_score IS DISTINCT FROM (revision_home #>> '{}')::INTEGER
     OR NEW.away_score IS DISTINCT FROM (revision_away #>> '{}')::INTEGER
  THEN
    RAISE EXCEPTION 'official fact must exactly snapshot its official game revision' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION v1_guard_game_official_result_cache()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  revision_row RECORD;
  source_row RECORD;
BEGIN
  SELECT r.game_id, r.revision, r.state, r.events_hash, r.official_at,
         g.current_official_revision_id
    INTO revision_row
    FROM "v1_game_result_revisions" r
    JOIN "v1_games" g ON g.id = r.game_id
   WHERE r.id = NEW.revision_id
   FOR KEY SHARE OF r, g;
  IF NOT FOUND OR revision_row.state IS DISTINCT FROM 'OFFICIAL' OR revision_row.official_at IS NULL THEN
    RAISE EXCEPTION 'public result cache requires an exact official revision snapshot' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO source_row FROM v1_resolve_canonical_guard_game(revision_row.game_id);
  IF NEW.game_id IS DISTINCT FROM revision_row.game_id
     OR NEW.revision IS DISTINCT FROM revision_row.revision
     OR NEW.tournament_id IS DISTINCT FROM source_row.semantic_tournament_id
     OR NEW.source_hash IS DISTINCT FROM revision_row.events_hash
     OR (NEW.is_current AND revision_row.current_official_revision_id IS DISTINCT FROM NEW.revision_id)
  THEN
    RAISE EXCEPTION 'public result cache requires an exact official revision snapshot' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION v1_guard_staff_fixture_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  assignment_tournament TEXT;
  scope_tournament TEXT;
BEGIN
  IF NEW.fixture_id IS NOT NULL OR NEW.team_match_id IS NULL THEN
    RAISE EXCEPTION 'staff scope requires a canonical TeamMatch' USING ERRCODE = '23514';
  END IF;
  SELECT tournament_id INTO assignment_tournament
    FROM "v1_tournament_staff_assignments" WHERE id = NEW.assignment_id;
  SELECT tournament_id INTO scope_tournament
    FROM "v1_team_matches"
   WHERE id = NEW.team_match_id AND tournament_id = NEW.tournament_id AND deleted_at IS NULL;
  IF assignment_tournament IS NULL OR scope_tournament IS NULL
     OR NEW.tournament_id IS DISTINCT FROM assignment_tournament
     OR scope_tournament IS DISTINCT FROM assignment_tournament THEN
    RAISE EXCEPTION 'staff scope must stay within tournament' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION v1_block_used_config_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "v1_games" WHERE competition_config_version_id = OLD.id)
     OR EXISTS (SELECT 1 FROM "v1_tournaments" WHERE competition_config_version_id = OLD.id)
     OR EXISTS (SELECT 1 FROM "v1_team_matches" WHERE competition_config_version_id = OLD.id)
  THEN
    RAISE EXCEPTION 'COMPETITION_CONFIG_VERSION_IN_USE' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION v1_guard_tournament_result_lineage_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  game_team_match_id TEXT;
  game_source_type TEXT;
  revision_state "V1GameResultRevisionState";
  source_row RECORD;
BEGIN
  SELECT g.team_match_id, g.source_type::text
    INTO game_team_match_id, game_source_type
    FROM "v1_games" g WHERE g.id = NEW.game_id FOR UPDATE;
  SELECT r.state INTO revision_state
    FROM "v1_game_result_revisions" r
   WHERE r.game_id = NEW.game_id AND r.id = NEW.official_revision_id;
  SELECT * INTO source_row FROM v1_resolve_canonical_guard_game(NEW.game_id);
  IF game_source_type IS DISTINCT FROM 'TEAM_MATCH'
     OR game_team_match_id IS DISTINCT FROM NEW.team_match_id
     OR source_row.semantic_tournament_id IS DISTINCT FROM NEW.tournament_id
     OR NEW.original_fixture_id IS DISTINCT FROM NEW.team_match_id
     OR revision_state IS DISTINCT FROM 'OFFICIAL'::"V1GameResultRevisionState"
  THEN
    RAISE EXCEPTION 'tournament result lineage requires the matching canonical TeamMatch official revision'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION v1_block_tournament_result_lineage_game_reparent()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "v1_tournament_result_lineages" WHERE game_id = OLD.id)
     AND (NEW.source_type IS DISTINCT FROM OLD.source_type
          OR NEW.team_match_id IS DISTINCT FROM OLD.team_match_id
          OR NEW.tournament_fixture_id IS DISTINCT FROM OLD.tournament_fixture_id)
  THEN
    RAISE EXCEPTION 'game ownership is immutable after tournament result lineage capture' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;

-- Operation history is append-only after the legacy binding gate above.  No
-- same-ID rewrite is allowed once this migration has sealed the old column.
CREATE OR REPLACE FUNCTION v1_reject_operation_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'v1_operation_audits_append_only: mutation is forbidden' USING ERRCODE = '55000';
END $$;

COMMIT;

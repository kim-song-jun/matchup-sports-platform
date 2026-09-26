-- Task 168 Phase 3 final retirement preparation.
-- This migration is deliberately fail-closed. It may run only after the full
-- cutover has been committed, all legacy writes are sealed, and every
-- canonical preservation invariant is still provable in the database.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Match the archived capture's recursively key-sorted JSON serializer. This
-- helper exists only in this connection's temporary schema, never in the app.
CREATE FUNCTION pg_temp.task168_stable_json(value JSONB) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE serialized TEXT;
BEGIN
  CASE jsonb_typeof(value)
    WHEN 'object' THEN
      SELECT '{' || COALESCE(string_agg(to_jsonb(key)::text || ':' || pg_temp.task168_stable_json(val), ',' ORDER BY key COLLATE "C"), '') || '}'
        INTO serialized FROM jsonb_each(value) AS item(key,val);
    WHEN 'array' THEN
      SELECT '[' || COALESCE(string_agg(pg_temp.task168_stable_json(val), ',' ORDER BY ordinal), '') || ']'
        INTO serialized FROM jsonb_array_elements(value) WITH ORDINALITY AS item(val,ordinal);
    WHEN 'number' THEN serialized := trim_scale((value #>> '{}')::numeric)::text;
    ELSE serialized := value::text;
  END CASE;
  RETURN serialized;
END $$;

DO $$
DECLARE
  processing_jobs BIGINT;
  legacy_game_links BIGINT;
  legacy_staff_links BIGINT;
  legacy_audit_links BIGINT;
  fixture_errors BIGINT;
  result_errors BIGINT;
  goal_errors BIGINT;
  video_errors BIGINT;
  edge_errors BIGINT;
  retired_write_seals BIGINT;
  retired_row_seals BIGINT;
  retired_link_seals BIGINT;
  retired_tables BIGINT;
  canonical_game_errors BIGINT;
  missing_tournament_details BIGINT;
  orphan_tournament_details BIGINT;
  lineage_errors BIGINT;
  advancement_errors BIGINT;
  cutover_epoch_count BIGINT;
  append_only_trigger_count BIGINT;
  lineage_append_only_trigger_count BIGINT;
  legacy_evidence_rows BIGINT;
  constraint_errors BIGINT;
BEGIN
  -- These locks cover both the evidence read and the DDL below. The worker
  -- quiescence gate is checked while its queue cannot change underneath us.
  LOCK TABLE "v1_outbox_events", "v1_games", "v1_tournament_staff_fixture_scopes",
    "v1_operation_audits", "v1_tournament_fixtures", "v1_tournament_fixture_results",
    "v1_tournament_fixture_goals", "v1_tournament_fixture_videos",
    "v1_tournament_fixture_advancement_edges", "v1_team_matches",
    "v1_tournament_match_details", "v1_tournament_match_advancement_edges",
    "v1_team_match_videos", "v1_tournament_result_lineages",
    "v1_game_cutover_epochs", "v1_game_result_revisions", "v1_game_events",
    "v1_game_official_facts", "v1_game_official_result_cache", "v1_game_sides",
    "v1_tournaments", "v1_tournament_registrations"
    IN ACCESS EXCLUSIVE MODE;

  SELECT count(*) INTO processing_jobs
    FROM "v1_outbox_events" WHERE "status"::text = 'PROCESSING';
  IF processing_jobs <> 0 THEN
    RAISE EXCEPTION 'RETIREMENT_PRECONDITION_FAILED processing_outbox=%', processing_jobs
      USING ERRCODE = '55000';
  END IF;

  SELECT count(*) INTO cutover_epoch_count
    FROM "v1_game_cutover_epochs"
   WHERE "write_mode"::text <> 'new';
  IF cutover_epoch_count <> 0 THEN
    RAISE EXCEPTION 'RETIREMENT_PRECONDITION_FAILED noncanonical_game_cutover_epochs=%', cutover_epoch_count
      USING ERRCODE = '55000';
  END IF;

  -- The full-cutover seal must exist before the physical tables disappear.
  SELECT count(*) INTO retired_tables
    FROM (VALUES
      ('v1_tournament_fixtures'), ('v1_tournament_fixture_results'),
      ('v1_tournament_fixture_goals'), ('v1_tournament_fixture_videos'),
      ('v1_tournament_fixture_advancement_edges')
    ) AS wanted(table_name)
   WHERE to_regclass(wanted.table_name) IS NOT NULL;
  IF retired_tables <> 5 THEN
    RAISE EXCEPTION 'RETIREMENT_PRECONDITION_FAILED legacy_tables=%', retired_tables
      USING ERRCODE = '55000';
  END IF;

  SELECT count(*) INTO retired_write_seals
    FROM pg_trigger t
   WHERE t.tgname = 'v1_tournament_fixture_retired_write'
     AND t.tgfoid = to_regprocedure('v1_reject_retired_tournament_fixture_write()')
     AND t.tgenabled = 'A' AND t.tgtype::int = 62 AND NOT t.tgisinternal
     AND t.tgrelid IN (
       'v1_tournament_fixtures'::regclass, 'v1_tournament_fixture_results'::regclass,
       'v1_tournament_fixture_goals'::regclass, 'v1_tournament_fixture_videos'::regclass,
       'v1_tournament_fixture_advancement_edges'::regclass
     );
  SELECT count(*) INTO retired_row_seals
    FROM pg_trigger t
   WHERE t.tgname = 'v1_tournament_fixture_retired_row_write'
     AND t.tgfoid = to_regprocedure('v1_reject_retired_tournament_fixture_write()')
     AND t.tgenabled = 'A' AND t.tgtype::int = 27 AND NOT t.tgisinternal
     AND t.tgrelid IN (
       'v1_tournament_fixtures'::regclass, 'v1_tournament_fixture_results'::regclass,
       'v1_tournament_fixture_goals'::regclass, 'v1_tournament_fixture_videos'::regclass,
       'v1_tournament_fixture_advancement_edges'::regclass
     );
  SELECT count(*) INTO retired_link_seals
    FROM pg_trigger t
   WHERE t.tgname = 'v1_000_tournament_fixture_retired_link'
     AND t.tgfoid = to_regprocedure('v1_reject_retired_tournament_fixture_link()')
     AND t.tgenabled = 'A' AND t.tgtype::int = 23 AND NOT t.tgisinternal
     AND t.tgrelid IN (
       'v1_games'::regclass, 'v1_tournament_staff_fixture_scopes'::regclass,
       'v1_operation_audits'::regclass
     );
  SELECT count(*) INTO append_only_trigger_count
    FROM pg_trigger t
   WHERE t.tgname = 'v1_operation_audits_append_only'
     AND t.tgfoid = to_regprocedure('v1_reject_operation_audit_mutation()')
     AND t.tgenabled = 'O' AND NOT t.tgisinternal
     AND t.tgrelid = 'v1_operation_audits'::regclass;
  SELECT count(*) INTO lineage_append_only_trigger_count FROM pg_trigger t
    WHERE t.tgname = 'v1_tournament_result_lineage_append_only'
      AND t.tgfoid = to_regprocedure('v1_block_tournament_result_lineage_mutation()')
      AND t.tgenabled IN ('O','A') AND t.tgtype::int = 27 AND NOT t.tgisinternal
      AND t.tgrelid = 'v1_tournament_result_lineages'::regclass;
  SELECT (SELECT count(*) FROM v1_tournament_fixtures)
       + (SELECT count(*) FROM v1_tournament_fixture_results)
       + (SELECT count(*) FROM v1_tournament_fixture_goals)
       + (SELECT count(*) FROM v1_tournament_fixture_videos)
       + (SELECT count(*) FROM v1_tournament_fixture_advancement_edges)
       + (SELECT count(*) FROM v1_games WHERE tournament_fixture_id IS NOT NULL OR source_type::text = 'TOURNAMENT_FIXTURE')
       + (SELECT count(*) FROM v1_tournament_staff_fixture_scopes WHERE fixture_id IS NOT NULL)
       + (SELECT count(*) FROM v1_operation_audits WHERE fixture_id IS NOT NULL)
       + (SELECT count(*) FROM v1_tournament_result_lineages)
    INTO legacy_evidence_rows;
  -- A fresh migration chain has no legacy data to transfer and no runtime
  -- retirement seals. Any legacy row/link/lineage makes all seals mandatory.
  IF (legacy_evidence_rows > 0 AND (retired_write_seals <> 5 OR retired_row_seals <> 5 OR retired_link_seals <> 3))
     OR append_only_trigger_count <> 1 OR lineage_append_only_trigger_count <> 1 THEN
    RAISE EXCEPTION 'RETIREMENT_PRECONDITION_FAILED seals=write:% row:% link:% audit:%',
      retired_write_seals, retired_row_seals, retired_link_seals, append_only_trigger_count
      USING ERRCODE = '55000';
  END IF;

  SELECT count(*) INTO legacy_game_links
    FROM "v1_games"
   WHERE "source_type"::text = 'TOURNAMENT_FIXTURE' OR "tournament_fixture_id" IS NOT NULL;
  SELECT count(*) INTO legacy_staff_links FROM "v1_tournament_staff_fixture_scopes" WHERE "fixture_id" IS NOT NULL;
  SELECT count(*) INTO legacy_audit_links FROM "v1_operation_audits" WHERE "fixture_id" IS NOT NULL;
  IF legacy_game_links <> 0 OR legacy_staff_links <> 0 OR legacy_audit_links <> 0 THEN
    RAISE EXCEPTION 'RETIREMENT_PRECONDITION_FAILED legacy_links games:% staff:% audits:%',
      legacy_game_links, legacy_staff_links, legacy_audit_links
      USING ERRCODE = '55000';
  END IF;

  -- Non-empty legacy tables are expected in the preservation phase. Every
  -- surviving row must have an exact canonical identity/fingerprint before
  -- the source table is physically removed.
  SELECT count(*) INTO fixture_errors
    FROM "v1_tournament_fixtures" f
    JOIN v1_tournaments tournament ON tournament.id = f.tournament_id
    LEFT JOIN v1_tournament_registrations home_registration ON home_registration.id = f.home_registration_id
    LEFT JOIN v1_tournament_registrations away_registration ON away_registration.id = f.away_registration_id
   WHERE NOT EXISTS (
     SELECT 1 FROM "v1_team_matches" tm
      WHERE tm."id" = f."id" AND tm."tournament_id" = f."tournament_id"
        AND tm.league_id IS NULL AND tm.sport_id = tournament.sport_id
        AND tm.field_id IS NOT DISTINCT FROM f.field_id
        AND tm.start_at IS NOT DISTINCT FROM f.scheduled_at
        AND tm.place_name IS NOT DISTINCT FROM f.venue
        AND tm.status::text = CASE f.status::text WHEN 'completed' THEN 'completed' WHEN 'cancelled' THEN 'cancelled' ELSE 'matched' END
        AND tm.host_team_id IS NOT DISTINCT FROM COALESCE(
          (SELECT side.team_id FROM v1_game_sides side JOIN v1_games game ON game.id=side.game_id WHERE game.team_match_id=f.id AND side.side_key::text='HOME'), home_registration.team_id)
        AND tm.approved_applicant_team_id IS NOT DISTINCT FROM COALESCE(
          (SELECT side.team_id FROM v1_game_sides side JOIN v1_games game ON game.id=side.game_id WHERE game.team_match_id=f.id AND side.side_key::text='AWAY'), away_registration.team_id)
        AND tm.competition_config_version_id = COALESCE(f.competition_config_version_id,
          (SELECT game.competition_config_version_id FROM v1_games game WHERE game.team_match_id=f.id))
   ) OR NOT EXISTS (
     SELECT 1 FROM "v1_tournament_match_details" d
      WHERE d."team_match_id" = f."id" AND d."tournament_id" = f."tournament_id"
        AND d.group_id IS NOT DISTINCT FROM f.group_id AND d.round = f.round
        AND d.fixture_number = f.fixture_number AND d.leg_number = f.leg_number
        AND d.parent_team_match_id IS NOT DISTINCT FROM f.parent_fixture_id
        AND d.home_registration_id IS NOT DISTINCT FROM f.home_registration_id
        AND d.away_registration_id IS NOT DISTINCT FROM f.away_registration_id
   ) OR NOT EXISTS (
     SELECT 1 FROM "v1_games" g
      WHERE g."team_match_id" = f."id"
        AND g."source_type"::text = 'TEAM_MATCH'
        AND g.competition_config_version_id = (SELECT tm.competition_config_version_id FROM v1_team_matches tm WHERE tm.id=f.id)
   );
  -- Existing canonical rows keep their independently established created/updated
  -- timestamps, as in the archived backfill's existing-row path. Operational and
  -- bracket metadata above must match; no canonical timestamp is rewritten here.
  SELECT count(*) INTO result_errors
    FROM "v1_tournament_fixture_results" r
    JOIN "v1_tournament_fixtures" f ON f."id" = r."fixture_id"
   WHERE NOT EXISTS (
     SELECT 1 FROM "v1_tournament_result_lineages" l
      WHERE l."original_result_id" = r."id"
        AND l."original_fixture_id" = r."fixture_id"
        AND l."team_match_id" = r."fixture_id"
        AND l."tournament_id" = f."tournament_id"
        AND l."home_score" = r."home_score" AND l."away_score" = r."away_score"
        AND l."has_penalty" = r."has_penalty"
        AND l."home_penalty_score" IS NOT DISTINCT FROM r."home_penalty_score"
        AND l."away_penalty_score" IS NOT DISTINCT FROM r."away_penalty_score"
        AND l."note" IS NOT DISTINCT FROM r."note"
        AND l."original_recorded_at" = r."recorded_at"
        AND l."original_created_at" = r."created_at"
        AND l."original_updated_at" = r."updated_at"
        AND EXISTS (
          SELECT 1 FROM "v1_game_result_revisions" rev
           WHERE rev."game_id" = l."game_id" AND rev."id" = l."official_revision_id"
             AND rev."state"::text = 'OFFICIAL'
             AND COALESCE(NULLIF(rev.score->'home','null'::jsonb),rev.score->'regulation'->'home') = l.official_score->'home'
             AND COALESCE(NULLIF(rev.score->'away','null'::jsonb),rev.score->'regulation'->'away') = l.official_score->'away'
             AND COALESCE(NULLIF(rev.score->'penalties','null'::jsonb),NULLIF(rev.score->'penalty','null'::jsonb))
                 IS NOT DISTINCT FROM NULLIF(l.official_score->'penalties','null'::jsonb)
             AND rev."events_hash" = l."official_events_hash"
        )
        AND l."recorded_by_admin_user_id" IS NOT DISTINCT FROM r."recorded_by_admin_user_id"
        AND l."original_fixture_tournament_id" = f."tournament_id"
        AND l."snapshot_hash" = encode(sha256(convert_to(pg_temp.task168_stable_json(l."snapshot"), 'UTF8')), 'hex')
        AND l."official_score_hash" = encode(sha256(convert_to(pg_temp.task168_stable_json(l."official_score"), 'UTF8')), 'hex')
        AND l."snapshot" - 'parity' = jsonb_build_object(
          'originalResultId', r."id", 'originalFixtureId', r."fixture_id",
          'originalFixtureTournamentId', f."tournament_id",
          'homeScore', r."home_score", 'awayScore', r."away_score",
          'hasPenalty', r."has_penalty", 'homePenaltyScore', r."home_penalty_score",
          'awayPenaltyScore', r."away_penalty_score", 'note', r."note",
          'recordedByAdminUserId', r."recorded_by_admin_user_id",
          'recordedAt', to_char(r."recorded_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'createdAt', to_char(r."created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'updatedAt', to_char(r."updated_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'goals', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', goal.id, 'team', goal.team::text, 'playerId', goal.player_id,
            'playerName', goal.player_name, 'minute', goal.minute,
            'createdAt', to_char(goal.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          ) ORDER BY goal.created_at, goal.id COLLATE "C") FROM v1_tournament_fixture_goals goal WHERE goal.fixture_result_id = r.id), '[]'::jsonb),
          'officialScore', l.official_score, 'officialEventsHash', l.official_events_hash,
          'canonicalGoalEvents', (SELECT rev.goal_events FROM v1_game_result_revisions rev WHERE rev.id = l.official_revision_id)
        )
        AND l.snapshot->'parity'->>'method' = 'SCORE_AND_LOSSLESS_GOAL_MULTIMAP'
        AND l.snapshot->'parity'->'matchedCandidateIds' = jsonb_build_array(l.official_revision_id)
        AND l.snapshot->'parity'->>'source' IN ('GOAL_EVENTS','FROZEN_FIXTURE_SCORE','EXPLICIT_IMPORT_ORIGIN')
   );
  SELECT count(*) INTO goal_errors
    FROM "v1_tournament_fixture_goals" g
    JOIN "v1_tournament_fixture_results" r ON r."id" = g."fixture_result_id"
   WHERE NOT EXISTS (
     SELECT 1 FROM "v1_tournament_result_lineages" l
      WHERE l."original_result_id" = r."id"
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(l.snapshot->'goals') AS item(goal)
          WHERE goal->>'id' = g.id AND goal->>'team' = g.team::text
            AND goal->>'playerId' IS NOT DISTINCT FROM g.player_id
            AND goal->>'playerName' = g.player_name
            AND (goal->>'minute')::integer IS NOT DISTINCT FROM g.minute
            AND (goal->>'createdAt')::timestamptz IS NOT DISTINCT FROM g.created_at AT TIME ZONE 'UTC')
   );
  SELECT count(*) INTO video_errors
    FROM "v1_tournament_fixture_videos" v
    JOIN "v1_tournament_fixtures" f ON f."id" = v."fixture_id"
   WHERE NOT EXISTS (
     SELECT 1 FROM "v1_team_match_videos" cv
      WHERE cv."id" = v."id" AND cv."team_match_id" = f."id"
        AND cv."title" IS NOT DISTINCT FROM v."title" AND cv."url" = v."url"
        AND cv."sort_order" = v."sort_order" AND cv."created_at" = v."created_at"
   );
  SELECT count(*) INTO edge_errors
    FROM "v1_tournament_fixture_advancement_edges" e
   WHERE NOT EXISTS (
     SELECT 1 FROM "v1_tournament_match_advancement_edges" ce
      WHERE ce."id" = e."id" AND ce."tournament_id" = e."tournament_id"
        AND ce."source_team_match_id" = e."source_fixture_id"
        AND ce."source_outcome"::text = e."source_outcome"::text
        AND ce."target_team_match_id" = e."target_fixture_id"
        AND ce."target_side"::text = e."target_side"::text
        AND ce."created_at" = e."created_at"
   );
  IF fixture_errors <> 0 OR result_errors <> 0 OR goal_errors <> 0
     OR video_errors <> 0 OR edge_errors <> 0 THEN
    RAISE EXCEPTION 'RETIREMENT_PRECONDITION_FAILED preservation fixtures:% results:% goals:% videos:% edges:%',
      fixture_errors, result_errors, goal_errors, video_errors, edge_errors
      USING ERRCODE = '55000';
  END IF;

  -- Canonical game ownership and tournament Details must be complete before
  -- the old fixture identity can disappear.
  SELECT count(*) INTO canonical_game_errors
    FROM "v1_games" g
   WHERE g."source_type"::text <> 'TEAM_MATCH' OR g."team_match_id" IS NULL;
  SELECT count(*) INTO missing_tournament_details
    FROM "v1_team_matches" tm
   WHERE tm."tournament_id" IS NOT NULL AND tm."league_id" IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM "v1_tournament_match_details" d
        WHERE d."team_match_id" = tm."id" AND d."tournament_id" = tm."tournament_id"
     );
  SELECT count(*) INTO orphan_tournament_details
    FROM "v1_tournament_match_details" d
   WHERE NOT EXISTS (
     SELECT 1 FROM "v1_team_matches" tm
      WHERE tm."id" = d."team_match_id" AND tm."tournament_id" = d."tournament_id"
   );
  IF canonical_game_errors <> 0 OR missing_tournament_details <> 0 OR orphan_tournament_details <> 0 THEN
    RAISE EXCEPTION 'RETIREMENT_PRECONDITION_FAILED canonical_games:% missing_details:% orphan_details:%',
      canonical_game_errors, missing_tournament_details, orphan_tournament_details
      USING ERRCODE = '55000';
  END IF;

  -- Result lineage, canonical videos, and advancement edges are checked by
  -- identity and ownership, not by row counts alone.
  SELECT count(*) INTO lineage_errors
    FROM "v1_tournament_result_lineages" l
   WHERE l."original_fixture_id" IS NULL OR l."original_fixture_id" <> l."team_match_id"
      OR NOT EXISTS (SELECT 1 FROM "v1_team_matches" tm WHERE tm."id" = l."team_match_id" AND tm."tournament_id" = l."tournament_id")
      OR NOT EXISTS (SELECT 1 FROM "v1_tournament_match_details" d WHERE d."team_match_id" = l."team_match_id" AND d."tournament_id" = l."tournament_id")
      OR NOT EXISTS (SELECT 1 FROM "v1_games" g WHERE g."id" = l."game_id" AND g."team_match_id" = l."team_match_id" AND g."source_type"::text = 'TEAM_MATCH')
      OR NOT EXISTS (SELECT 1 FROM "v1_game_result_revisions" r WHERE r."game_id" = l."game_id" AND r."id" = l."official_revision_id" AND r."state"::text = 'OFFICIAL');
  SELECT count(*) INTO video_errors
    FROM "v1_team_match_videos" v
   WHERE NOT EXISTS (SELECT 1 FROM "v1_team_matches" tm WHERE tm."id" = v."team_match_id");
  SELECT count(*) INTO advancement_errors
    FROM "v1_tournament_match_advancement_edges" e
   WHERE NOT EXISTS (SELECT 1 FROM "v1_tournament_match_details" d WHERE d."team_match_id" = e."source_team_match_id" AND d."tournament_id" = e."tournament_id")
      OR NOT EXISTS (SELECT 1 FROM "v1_tournament_match_details" d WHERE d."team_match_id" = e."target_team_match_id" AND d."tournament_id" = e."tournament_id");
  IF lineage_errors <> 0 OR video_errors <> 0 OR advancement_errors <> 0 THEN
    RAISE EXCEPTION 'RETIREMENT_PRECONDITION_FAILED lineage:% videos:% advancement:%',
      lineage_errors, video_errors, advancement_errors USING ERRCODE = '55000';
  END IF;

  -- Existing guards still mention the columns being retired. Make their
  -- canonical equivalents explicit before those columns are removed.
  SELECT count(*) INTO constraint_errors
    FROM pg_constraint
   WHERE conname IN (
     'v1_games_canonical_source_guard_ck', 'v1_staff_scope_canonical_source_guard_ck',
     'v1_operation_audits_canonical_source_guard_ck'
   ) AND NOT convalidated;
  IF constraint_errors <> 0 THEN
    RAISE EXCEPTION 'RETIREMENT_PRECONDITION_FAILED invalid_canonical_constraints=%', constraint_errors
      USING ERRCODE = '55000';
  END IF;
END $$;

-- Rewrite canonical guard functions before dropping the legacy columns they
-- previously inspected. Their protection remains active after retirement.
CREATE OR REPLACE FUNCTION v1_resolve_canonical_guard_game(p_game_id TEXT)
RETURNS TABLE (team_match_id TEXT, semantic_tournament_id TEXT, home_team_id TEXT, away_team_id TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  game_source TEXT;
  game_team_match_id TEXT;
  tm_tournament_id TEXT;
  tm_league_id TEXT;
  details_team_match_id TEXT;
  details_tournament_id TEXT;
  details_exist BOOLEAN;
BEGIN
  SELECT g."source_type"::text, g."team_match_id"
    INTO game_source, game_team_match_id
    FROM "v1_games" g WHERE g."id" = p_game_id FOR KEY SHARE;
  IF NOT FOUND OR game_source <> 'TEAM_MATCH' OR game_team_match_id IS NULL THEN
    RAISE EXCEPTION 'canonical game source must be TEAM_MATCH with TeamMatch ownership' USING ERRCODE = '23514';
  END IF;
  SELECT tm."tournament_id", tm."league_id", d."team_match_id", d."tournament_id"
    INTO tm_tournament_id, tm_league_id, details_team_match_id, details_tournament_id
    FROM "v1_team_matches" tm
    LEFT JOIN "v1_tournament_match_details" d
      ON d."team_match_id" = tm."id" AND d."tournament_id" = tm."tournament_id"
   WHERE tm."id" = game_team_match_id AND tm."deleted_at" IS NULL
   FOR KEY SHARE OF tm;
  IF NOT FOUND THEN RAISE EXCEPTION 'canonical game TeamMatch is missing or deleted' USING ERRCODE = '23514'; END IF;
  SELECT EXISTS (SELECT 1 FROM "v1_tournament_match_details" d WHERE d."team_match_id" = game_team_match_id) INTO details_exist;
  IF details_exist AND details_team_match_id IS NULL THEN RAISE EXCEPTION 'canonical TeamMatch has mismatched tournament details' USING ERRCODE = '23514'; END IF;
  IF tm_league_id IS NOT NULL AND details_team_match_id IS NOT NULL THEN RAISE EXCEPTION 'league TeamMatch cannot have tournament match details' USING ERRCODE = '23514'; END IF;
  IF tm_league_id IS NULL AND tm_tournament_id IS NOT NULL
     AND (details_team_match_id IS DISTINCT FROM game_team_match_id OR details_tournament_id IS DISTINCT FROM tm_tournament_id) THEN
    RAISE EXCEPTION 'tournament TeamMatch requires matching tournament details' USING ERRCODE = '23514';
  END IF;
  team_match_id := game_team_match_id;
  semantic_tournament_id := CASE WHEN tm_league_id IS NULL THEN details_tournament_id ELSE NULL END;
  SELECT s."team_id" INTO home_team_id FROM "v1_game_sides" s WHERE s."game_id" = p_game_id AND s."side_key" = 'HOME';
  SELECT s."team_id" INTO away_team_id FROM "v1_game_sides" s WHERE s."game_id" = p_game_id AND s."side_key" = 'AWAY';
  RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION v1_guard_staff_fixture_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE assignment_tournament TEXT; scope_tournament TEXT;
BEGIN
  IF NEW.team_match_id IS NULL THEN RAISE EXCEPTION 'staff scope requires a canonical TeamMatch' USING ERRCODE = '23514'; END IF;
  SELECT tournament_id INTO assignment_tournament FROM "v1_tournament_staff_assignments" WHERE id = NEW.assignment_id;
  SELECT tournament_id INTO scope_tournament FROM "v1_team_matches" WHERE id = NEW.team_match_id AND tournament_id = NEW.tournament_id AND deleted_at IS NULL;
  IF assignment_tournament IS NULL OR scope_tournament IS NULL OR NEW.tournament_id IS DISTINCT FROM assignment_tournament OR scope_tournament IS DISTINCT FROM assignment_tournament THEN
    RAISE EXCEPTION 'staff scope must stay within tournament' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION v1_block_tournament_result_lineage_game_reparent()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "v1_tournament_result_lineages" WHERE game_id = OLD.id)
     AND (NEW.source_type IS DISTINCT FROM OLD.source_type OR NEW.team_match_id IS DISTINCT FROM OLD.team_match_id) THEN
    RAISE EXCEPTION 'game ownership is immutable after tournament result lineage capture' USING ERRCODE = '55000';
  END IF;
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
  SELECT g."team_match_id", g."source_type"::text
    INTO game_team_match_id, game_source_type
    FROM "v1_games" g WHERE g."id" = NEW."game_id" FOR UPDATE;
  SELECT r."state" INTO revision_state
    FROM "v1_game_result_revisions" r
   WHERE r."game_id" = NEW."game_id" AND r."id" = NEW."official_revision_id";
  SELECT * INTO source_row FROM v1_resolve_canonical_guard_game(NEW."game_id");
  IF game_source_type IS DISTINCT FROM 'TEAM_MATCH'
     OR game_team_match_id IS DISTINCT FROM NEW."team_match_id"
     OR source_row.semantic_tournament_id IS DISTINCT FROM NEW."tournament_id"
     OR NEW."original_fixture_id" IS DISTINCT FROM NEW."team_match_id"
     OR revision_state IS DISTINCT FROM 'OFFICIAL'::"V1GameResultRevisionState"
  THEN
    RAISE EXCEPTION 'tournament result lineage requires the matching canonical TeamMatch official revision'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- The old trigger column list includes tournament_fixture_id. Remove it before
-- the column is dropped, then recreate the canonical-only trigger below.
DROP TRIGGER IF EXISTS v1_block_tournament_result_lineage_game_reparent ON "v1_games";

-- Remove retired ingress triggers from canonical tables before their legacy
-- columns disappear. Append-only audit and canonical game/result protections stay.
DROP TRIGGER IF EXISTS v1_000_tournament_fixture_retired_link ON "v1_games";
DROP TRIGGER IF EXISTS v1_000_tournament_fixture_retired_link ON "v1_tournament_staff_fixture_scopes";
DROP TRIGGER IF EXISTS v1_000_tournament_fixture_retired_link ON "v1_operation_audits";
ALTER TABLE "v1_games" DROP CONSTRAINT IF EXISTS "v1_games_canonical_source_guard_ck";
ALTER TABLE "v1_tournament_staff_fixture_scopes" DROP CONSTRAINT IF EXISTS "v1_staff_scope_canonical_source_guard_ck";
ALTER TABLE "v1_operation_audits" DROP CONSTRAINT IF EXISTS "v1_operation_audits_canonical_source_guard_ck";
ALTER TABLE "v1_games" DROP CONSTRAINT IF EXISTS "v1_games_source_expand_ck";
ALTER TABLE "v1_tournament_staff_fixture_scopes" DROP CONSTRAINT IF EXISTS "v1_staff_scope_source_ck";

ALTER TABLE "v1_games"
  DROP CONSTRAINT IF EXISTS "v1_games_tournament_fixture_id_fkey",
  DROP COLUMN IF EXISTS "tournament_fixture_id";
ALTER TABLE "v1_tournament_staff_fixture_scopes"
  DROP CONSTRAINT IF EXISTS "v1_staff_scope_fixture_fk",
  DROP COLUMN IF EXISTS "fixture_id";
ALTER TABLE "v1_operation_audits"
  DROP CONSTRAINT IF EXISTS "v1_operation_audits_fixture_fk",
  DROP COLUMN IF EXISTS "fixture_id";

DROP TABLE "v1_tournament_fixture_goals";
DROP TABLE "v1_tournament_fixture_results";
DROP TABLE "v1_tournament_fixture_videos";
DROP TABLE "v1_tournament_fixture_advancement_edges";
DROP TABLE "v1_tournament_fixtures";

CREATE TRIGGER v1_block_tournament_result_lineage_game_reparent
BEFORE UPDATE OF "source_type", "team_match_id" ON "v1_games"
FOR EACH ROW EXECUTE FUNCTION v1_block_tournament_result_lineage_game_reparent();

ALTER TABLE "v1_games"
  ADD CONSTRAINT "v1_games_canonical_source_guard_ck"
  CHECK ("source_type"::text = 'TEAM_MATCH' AND "team_match_id" IS NOT NULL);
ALTER TABLE "v1_tournament_staff_fixture_scopes"
  ADD CONSTRAINT "v1_staff_scope_canonical_source_guard_ck"
  CHECK ("team_match_id" IS NOT NULL AND "tournament_id" IS NOT NULL);

DROP FUNCTION IF EXISTS v1_reject_retired_tournament_fixture_write();
DROP FUNCTION IF EXISTS v1_reject_retired_tournament_fixture_link();
DROP TYPE "V1TournamentGoalTeam";
DROP TYPE "V1TournamentFixtureStatus";

COMMIT;

-- Outbox-handler + team-record-facts backfill task: widen
-- v1_guard_game_official_fact_insert() to accept the SECOND score shape
-- that already legitimately exists in v1_game_result_revisions.score --
-- discovered by actually trying to backfill v1_game_official_facts /
-- v1_team_record_facts for the 21 games game-result-backfill.ts's
-- createImportedGame() imported.
--
-- Two producer shapes for V1GameResultRevision.score have coexisted since
-- Task 10, unrelated until now:
--   1. Flat `{home, away, penalties?}` -- every LIVE OFFICIAL producer
--      (GamesService.deriveTournamentRevision, TournamentResultReviewService).
--      This is the only shape the original trigger (migration
--      20260802000100_v1_game_projections_escalations) knew about.
--   2. Nested `{regulation: {home, away} | null, penalty, goals, incomplete,
--      provenance}` -- game-result-backfill.ts's createImportedGame(), which
--      predates the fact tables and was never exercised against this guard
--      until this task tried to.
-- The original guard hard-required `score->'home'`/`score->'away'` to be
-- top-level numbers, so it silently made it IMPOSSIBLE to ever insert a
-- v1_game_official_facts row for any imported game -- shape 2's numbers live
-- under `score->'regulation'`, not at the top level. Rewriting the 21
-- already-persisted revision rows to the flat shape was ruled out (revisions
-- are append-only/immutable by design, and goal-event-backfill.ts already
-- depends on reading the nested `provenance`/`goals[]` fields for these same
-- rows) -- so this migration teaches the guard about shape 2 instead, via
-- COALESCE, rather than relaxing what it accepts for shape 1. Every other
-- check (byte-exact match against the persisted revision, home/away must be
-- non-negative integers, revision must be OFFICIAL) is unchanged -- a
-- genuinely malformed or partial (`regulation: null`, i.e. an incomplete
-- TEAM_MATCH_COMPLETION_ONLY import) score still fails this guard exactly as
-- before, since COALESCE only ever substitutes a value that IS present.
CREATE OR REPLACE FUNCTION v1_guard_game_official_fact_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  revision_row RECORD;
  game_source_type "V1GameSourceType";
  game_tournament_id TEXT;
  home_team_id_value TEXT;
  away_team_id_value TEXT;
  revision_home JSONB;
  revision_away JSONB;
BEGIN
  SELECT state, revision, score, events_hash, official_at
  INTO revision_row
  FROM v1_game_result_revisions
  WHERE game_id = NEW.game_id AND id = NEW.revision_id
  FOR KEY SHARE;

  IF NOT FOUND OR revision_row.state IS DISTINCT FROM 'OFFICIAL' OR revision_row.official_at IS NULL THEN
    RAISE EXCEPTION 'official fact requires an official game revision' USING ERRCODE = '23514';
  END IF;

  SELECT
    game.source_type,
    fixture.tournament_id,
    home_side.team_id,
    away_side.team_id
  INTO game_source_type, game_tournament_id, home_team_id_value, away_team_id_value
  FROM v1_games AS game
  LEFT JOIN v1_tournament_fixtures AS fixture ON fixture.id = game.tournament_fixture_id
  LEFT JOIN v1_game_sides AS home_side ON home_side.game_id = game.id AND home_side.side_key = 'HOME'
  LEFT JOIN v1_game_sides AS away_side ON away_side.game_id = game.id AND away_side.side_key = 'AWAY'
  WHERE game.id = NEW.game_id
  FOR KEY SHARE OF game;

  -- Prefer the flat top-level key (shape 1, the live path); fall back to the
  -- nested migration-import key (shape 2) only when the flat one is absent.
  revision_home := COALESCE(revision_row.score -> 'home', revision_row.score -> 'regulation' -> 'home');
  revision_away := COALESCE(revision_row.score -> 'away', revision_row.score -> 'regulation' -> 'away');

  IF NOT FOUND
    OR NEW.revision IS DISTINCT FROM revision_row.revision
    OR NEW.source_type IS DISTINCT FROM game_source_type
    OR NEW.tournament_id IS DISTINCT FROM game_tournament_id
    OR NEW.home_team_id IS DISTINCT FROM home_team_id_value
    OR NEW.away_team_id IS DISTINCT FROM away_team_id_value
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

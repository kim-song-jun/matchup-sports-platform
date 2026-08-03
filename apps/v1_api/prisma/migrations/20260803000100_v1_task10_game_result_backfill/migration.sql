-- Task 10: game result backfill / read-authority cutover boundary marker.
--
-- All tables/columns the backfill CLI (game-result-backfill.ts,
-- compare-game-result-reads.ts) reads and writes already exist as of
-- 20260802000400_v1_public_official_result_cache (v1_games,
-- v1_game_result_revisions, v1_game_sides, v1_game_operation_flags,
-- v1_game_cutover_epochs, v1_competition_config_versions,
-- v1_team_matches, v1_tournament_fixtures). No new columns or tables are
-- required to support the backfill/inventory/apply/compare code paths.
--
-- This migration adds one genuinely-missing, additive index: the backfill
-- inventory scan filters v1_tournament_fixtures by status='completed' and
-- orders by id, but that table previously carried no index covering
-- `status` at all (unlike v1_team_matches, which already has one). This
-- closes that gap for the Task 10 backfill/inventory/apply/live-cutover
-- read path without touching any existing data.
CREATE INDEX IF NOT EXISTS "v1_tournament_fixtures_status_id_backfill_idx"
  ON "v1_tournament_fixtures" ("status", "id");

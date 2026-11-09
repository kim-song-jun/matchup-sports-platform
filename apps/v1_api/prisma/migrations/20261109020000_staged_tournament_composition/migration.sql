-- Existing competitions remain on their current engine (stage_plan IS NULL).
ALTER TABLE v1_tournaments ADD COLUMN stage_plan JSONB, ADD COLUMN stage_plan_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE v1_tournament_groups ADD COLUMN stage_key TEXT, ADD COLUMN pool_key TEXT;
ALTER TABLE v1_tournament_slots ADD COLUMN entry_scope TEXT NOT NULL DEFAULT 'legacy';
DROP INDEX v1_tournament_slots_tournament_id_kind_registration_id_key;
CREATE UNIQUE INDEX v1_slots_stage_kind_registration_key
  ON v1_tournament_slots(tournament_id, entry_scope, kind, registration_id);
CREATE INDEX v1_tournament_groups_stage_pool_idx ON v1_tournament_groups(tournament_id, stage_key, pool_key);

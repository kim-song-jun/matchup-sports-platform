BEGIN;

-- Task 168 W0: preserve the complete legacy fixture result before any source
-- cutover. This table intentionally has no foreign key to legacy fixture/result
-- tables; original IDs are evidence, while all referential links are canonical.
CREATE TABLE "v1_tournament_result_lineages" (
  "id" TEXT NOT NULL,
  "original_result_id" TEXT NOT NULL,
  "original_fixture_id" TEXT NOT NULL,
  "original_fixture_tournament_id" TEXT NOT NULL,
  "tournament_id" TEXT NOT NULL,
  "team_match_id" TEXT NOT NULL,
  "game_id" TEXT NOT NULL,
  "official_revision_id" TEXT NOT NULL,
  "official_score" JSONB NOT NULL,
  "official_score_hash" TEXT NOT NULL,
  "official_events_hash" TEXT NOT NULL,
  "home_score" INTEGER NOT NULL,
  "away_score" INTEGER NOT NULL,
  "has_penalty" BOOLEAN NOT NULL,
  "home_penalty_score" INTEGER,
  "away_penalty_score" INTEGER,
  "note" TEXT,
  "recorded_by_admin_user_id" TEXT,
  "original_recorded_at" TIMESTAMP(3) NOT NULL,
  "original_created_at" TIMESTAMP(3) NOT NULL,
  "original_updated_at" TIMESTAMP(3) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "snapshot_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "v1_tournament_result_lineages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "v1_tournament_result_lineages_original_result_key" UNIQUE ("original_result_id"),
  CONSTRAINT "v1_tournament_result_lineages_fixture_match_same_id_ck"
    CHECK ("original_fixture_id" = "team_match_id"),
  CONSTRAINT "v1_tournament_result_lineages_fixture_tournament_same_id_ck"
    CHECK ("original_fixture_tournament_id" = "tournament_id"),
  CONSTRAINT "v1_tournament_result_lineages_tournament_fk"
    FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "v1_tournament_result_lineages_team_match_fk"
    FOREIGN KEY ("tournament_id", "team_match_id") REFERENCES "v1_team_matches"("tournament_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "v1_tournament_result_lineages_details_fk"
    FOREIGN KEY ("tournament_id", "team_match_id") REFERENCES "v1_tournament_match_details"("tournament_id", "team_match_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "v1_tournament_result_lineages_game_fk"
    FOREIGN KEY ("game_id") REFERENCES "v1_games"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "v1_tournament_result_lineages_revision_fk"
    FOREIGN KEY ("game_id", "official_revision_id") REFERENCES "v1_game_result_revisions"("game_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "v1_tournament_result_lineages_tournament_match_idx"
  ON "v1_tournament_result_lineages" ("tournament_id", "team_match_id");
CREATE INDEX "v1_tournament_result_lineages_game_revision_idx"
  ON "v1_tournament_result_lineages" ("game_id", "official_revision_id");

CREATE OR REPLACE FUNCTION v1_block_tournament_result_lineage_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'tournament result lineage is append-only' USING ERRCODE = '55000';
END $$;

CREATE TRIGGER v1_tournament_result_lineage_append_only
BEFORE UPDATE OR DELETE ON "v1_tournament_result_lineages"
FOR EACH ROW EXECUTE FUNCTION v1_block_tournament_result_lineage_mutation();

CREATE OR REPLACE FUNCTION v1_guard_tournament_result_lineage_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  game_team_match_id TEXT;
  game_source_type "V1GameSourceType";
  game_fixture_id TEXT;
  revision_state "V1GameResultRevisionState";
  details_tournament_id TEXT;
BEGIN
  SELECT g.team_match_id, g.source_type, g.tournament_fixture_id
    INTO game_team_match_id, game_source_type, game_fixture_id
    FROM "v1_games" g
   WHERE g.id = NEW.game_id
   FOR UPDATE;

  SELECT r.state INTO revision_state
    FROM "v1_game_result_revisions" r
   WHERE r.game_id = NEW.game_id AND r.id = NEW.official_revision_id;

  SELECT d.tournament_id INTO details_tournament_id
    FROM "v1_tournament_match_details" d
   WHERE d.tournament_id = NEW.tournament_id AND d.team_match_id = NEW.team_match_id;

  IF game_source_type IS DISTINCT FROM 'TEAM_MATCH'::"V1GameSourceType"
     OR game_team_match_id IS DISTINCT FROM NEW.team_match_id
     OR game_fixture_id IS NOT NULL
     OR game_team_match_id IS DISTINCT FROM NEW.original_fixture_id
     OR revision_state IS DISTINCT FROM 'OFFICIAL'::"V1GameResultRevisionState"
     OR details_tournament_id IS DISTINCT FROM NEW.tournament_id
  THEN
    RAISE EXCEPTION 'tournament result lineage requires the matching canonical TeamMatch official revision'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER v1_guard_tournament_result_lineage_insert
BEFORE INSERT ON "v1_tournament_result_lineages"
FOR EACH ROW EXECUTE FUNCTION v1_guard_tournament_result_lineage_insert();

CREATE OR REPLACE FUNCTION v1_block_tournament_result_lineage_game_reparent()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "v1_tournament_result_lineages" WHERE game_id = OLD.id)
     AND (
       NEW.source_type IS DISTINCT FROM OLD.source_type
       OR NEW.team_match_id IS DISTINCT FROM OLD.team_match_id
       OR NEW.tournament_fixture_id IS DISTINCT FROM OLD.tournament_fixture_id
     )
  THEN
    RAISE EXCEPTION 'game ownership is immutable after tournament result lineage capture' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER v1_block_tournament_result_lineage_game_reparent
BEFORE UPDATE OF source_type, team_match_id, tournament_fixture_id ON "v1_games"
FOR EACH ROW EXECUTE FUNCTION v1_block_tournament_result_lineage_game_reparent();

CREATE OR REPLACE FUNCTION v1_block_tournament_result_lineage_details_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "v1_tournament_result_lineages"
    WHERE tournament_id = OLD.tournament_id AND team_match_id = OLD.team_match_id
  ) THEN
    RAISE EXCEPTION 'tournament match details ownership is immutable after result lineage capture' USING ERRCODE = '55000';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER v1_block_tournament_result_lineage_details_mutation
BEFORE UPDATE OF tournament_id, team_match_id OR DELETE ON "v1_tournament_match_details"
FOR EACH ROW EXECUTE FUNCTION v1_block_tournament_result_lineage_details_mutation();

COMMIT;

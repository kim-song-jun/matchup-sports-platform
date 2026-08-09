ALTER TYPE "V1VisibilityMode" ADD VALUE 'HIDDEN';
ALTER TYPE "V1VisibilityMode" ADD VALUE 'OFFICIAL_ONLY';

CREATE TYPE "V1FixtureAdvancementOutcome" AS ENUM ('WINNER', 'LOSER');
CREATE TYPE "V1FixtureTargetSide" AS ENUM ('HOME', 'AWAY');

CREATE TABLE "v1_game_official_facts" (
  "id" TEXT NOT NULL,
  "revision_id" TEXT NOT NULL,
  "game_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "source_type" "V1GameSourceType" NOT NULL,
  "tournament_id" TEXT,
  "home_team_id" TEXT,
  "away_team_id" TEXT,
  "home_score" INTEGER NOT NULL,
  "away_score" INTEGER NOT NULL,
  "score" JSONB NOT NULL,
  "events_hash" TEXT NOT NULL,
  "official_at" TIMESTAMP(3) NOT NULL,
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "v1_game_official_facts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "v1_game_official_facts_revision_id_key" UNIQUE ("revision_id"),
  CONSTRAINT "v1_game_official_facts_game_revision_key" UNIQUE ("game_id", "revision"),
  CONSTRAINT "v1_game_official_facts_score_ck" CHECK ("home_score" >= 0 AND "away_score" >= 0),
  CONSTRAINT "v1_game_official_facts_teams_ck" CHECK ("home_team_id" IS NULL OR "away_team_id" IS NULL OR "home_team_id" <> "away_team_id"),
  CONSTRAINT "v1_game_official_facts_revision_fk" FOREIGN KEY ("revision_id") REFERENCES "v1_game_result_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "v1_game_official_facts_official_at_idx" ON "v1_game_official_facts"("official_at");
CREATE INDEX "v1_game_official_facts_tournament_official_at_idx" ON "v1_game_official_facts"("tournament_id", "official_at");
CREATE INDEX "v1_game_official_facts_home_team_official_at_idx" ON "v1_game_official_facts"("home_team_id", "official_at");
CREATE INDEX "v1_game_official_facts_away_team_official_at_idx" ON "v1_game_official_facts"("away_team_id", "official_at");

CREATE OR REPLACE FUNCTION v1_guard_game_official_fact_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  revision_row RECORD;
  game_source_type "V1GameSourceType";
  game_tournament_id TEXT;
  home_team_id_value TEXT;
  away_team_id_value TEXT;
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

  IF NOT FOUND
    OR NEW.revision IS DISTINCT FROM revision_row.revision
    OR NEW.source_type IS DISTINCT FROM game_source_type
    OR NEW.tournament_id IS DISTINCT FROM game_tournament_id
    OR NEW.home_team_id IS DISTINCT FROM home_team_id_value
    OR NEW.away_team_id IS DISTINCT FROM away_team_id_value
    OR NEW.score IS DISTINCT FROM revision_row.score
    OR NEW.events_hash IS DISTINCT FROM revision_row.events_hash
    OR NEW.official_at IS DISTINCT FROM revision_row.official_at
    OR jsonb_typeof(revision_row.score -> 'home') IS DISTINCT FROM 'number'
    OR jsonb_typeof(revision_row.score -> 'away') IS DISTINCT FROM 'number'
    OR NEW.home_score IS DISTINCT FROM (revision_row.score ->> 'home')::INTEGER
    OR NEW.away_score IS DISTINCT FROM (revision_row.score ->> 'away')::INTEGER
  THEN
    RAISE EXCEPTION 'official fact must exactly snapshot its official game revision' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER v1_guard_game_official_fact_insert
BEFORE INSERT ON "v1_game_official_facts"
FOR EACH ROW EXECUTE FUNCTION v1_guard_game_official_fact_insert();

CREATE OR REPLACE FUNCTION v1_block_game_official_fact_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'official game facts are append-only' USING ERRCODE = '55000';
END $$;

CREATE TRIGGER v1_block_game_official_fact_mutation
BEFORE UPDATE OR DELETE ON "v1_game_official_facts"
FOR EACH ROW EXECUTE FUNCTION v1_block_game_official_fact_mutation();

CREATE TABLE "v1_tournament_fixture_advancement_edges" (
  "id" TEXT NOT NULL,
  "tournament_id" TEXT NOT NULL,
  "source_fixture_id" TEXT NOT NULL,
  "source_outcome" "V1FixtureAdvancementOutcome" NOT NULL,
  "target_fixture_id" TEXT NOT NULL,
  "target_side" "V1FixtureTargetSide" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "v1_tournament_fixture_advancement_edges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "v1_fixture_advancement_source_outcome_key" UNIQUE ("source_fixture_id", "source_outcome"),
  CONSTRAINT "v1_fixture_advancement_target_side_key" UNIQUE ("target_fixture_id", "target_side"),
  CONSTRAINT "v1_fixture_advancement_distinct_fixture_ck" CHECK ("source_fixture_id" <> "target_fixture_id"),
  CONSTRAINT "v1_fixture_advancement_tournament_fk" FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "v1_fixture_advancement_source_fk" FOREIGN KEY ("tournament_id", "source_fixture_id") REFERENCES "v1_tournament_fixtures"("tournament_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "v1_fixture_advancement_target_fk" FOREIGN KEY ("tournament_id", "target_fixture_id") REFERENCES "v1_tournament_fixtures"("tournament_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "v1_fixture_advancement_source_lock_idx" ON "v1_tournament_fixture_advancement_edges"("tournament_id", "source_fixture_id");
CREATE INDEX "v1_fixture_advancement_target_lock_idx" ON "v1_tournament_fixture_advancement_edges"("tournament_id", "target_fixture_id");

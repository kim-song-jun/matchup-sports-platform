CREATE TABLE "v1_game_official_result_cache" (
  "id" TEXT NOT NULL,
  "revision_id" TEXT NOT NULL,
  "game_id" TEXT NOT NULL,
  "tournament_id" TEXT,
  "revision" INTEGER NOT NULL,
  "visibility_mode" "V1VisibilityMode" NOT NULL,
  "is_current" BOOLEAN NOT NULL DEFAULT false,
  "source_hash" TEXT NOT NULL,
  "canonical_payload" JSONB NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "cached_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "v1_game_official_result_cache_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "v1_game_official_result_cache_revision_key" UNIQUE ("revision_id"),
  CONSTRAINT "v1_game_official_result_cache_game_revision_key" UNIQUE ("game_id", "revision"),
  CONSTRAINT "v1_game_official_result_cache_payload_hash_ck"
    CHECK ("payload_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "v1_game_official_result_cache_revision_fk"
    FOREIGN KEY ("revision_id") REFERENCES "v1_game_result_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "v1_game_official_result_cache_game_fk"
    FOREIGN KEY ("game_id") REFERENCES "v1_games"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "v1_game_official_result_cache_tournament_fk"
    FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "v1_game_official_result_cache_one_current_key"
  ON "v1_game_official_result_cache"("game_id") WHERE "is_current";
CREATE INDEX "v1_game_official_result_cache_current_idx"
  ON "v1_game_official_result_cache"("game_id", "is_current");
CREATE INDEX "v1_game_official_result_cache_tournament_current_idx"
  ON "v1_game_official_result_cache"("tournament_id", "is_current");

CREATE OR REPLACE FUNCTION v1_guard_game_official_result_cache() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  revision_row RECORD;
BEGIN
  SELECT revision.game_id, revision.revision, revision.state, revision.events_hash,
         game.current_official_revision_id, fixture.tournament_id
  INTO revision_row
  FROM v1_game_result_revisions revision
  INNER JOIN v1_games game ON game.id = revision.game_id
  LEFT JOIN v1_tournament_fixtures fixture ON fixture.id = game.tournament_fixture_id
  WHERE revision.id = NEW.revision_id
  FOR KEY SHARE OF revision, game;

  IF NOT FOUND
    OR revision_row.state IS DISTINCT FROM 'OFFICIAL'
    OR NEW.game_id IS DISTINCT FROM revision_row.game_id
    OR NEW.revision IS DISTINCT FROM revision_row.revision
    OR NEW.tournament_id IS DISTINCT FROM revision_row.tournament_id
    OR NEW.source_hash IS DISTINCT FROM revision_row.events_hash
    OR (NEW.is_current AND revision_row.current_official_revision_id IS DISTINCT FROM NEW.revision_id)
  THEN
    RAISE EXCEPTION 'public result cache requires an exact official revision snapshot'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER v1_guard_game_official_result_cache
BEFORE INSERT ON "v1_game_official_result_cache"
FOR EACH ROW EXECUTE FUNCTION v1_guard_game_official_result_cache();

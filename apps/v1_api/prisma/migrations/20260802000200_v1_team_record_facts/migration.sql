CREATE TABLE "v1_team_record_facts" (
  "id" TEXT NOT NULL,
  "revision_id" TEXT NOT NULL,
  "game_id" TEXT NOT NULL,
  "team_id" TEXT NOT NULL,
  "opponent_team_id" TEXT,
  "tournament_id" TEXT,
  "result" TEXT NOT NULL,
  "goals_for" INTEGER NOT NULL,
  "goals_against" INTEGER NOT NULL,
  "source_hash" TEXT NOT NULL,
  "official_at" TIMESTAMP(3) NOT NULL,
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "v1_team_record_facts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "v1_team_record_facts_revision_team_key" UNIQUE ("revision_id", "team_id"),
  CONSTRAINT "v1_team_record_facts_result_ck" CHECK ("result" IN ('WON', 'DRAWN', 'LOST')),
  CONSTRAINT "v1_team_record_facts_goals_ck" CHECK ("goals_for" >= 0 AND "goals_against" >= 0),
  CONSTRAINT "v1_team_record_facts_distinct_team_ck" CHECK ("opponent_team_id" IS NULL OR "team_id" <> "opponent_team_id"),
  CONSTRAINT "v1_team_record_facts_revision_fk" FOREIGN KEY ("revision_id") REFERENCES "v1_game_result_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "v1_team_record_facts_team_official_at_idx" ON "v1_team_record_facts"("team_id", "official_at");
CREATE INDEX "v1_team_record_facts_team_tournament_idx" ON "v1_team_record_facts"("team_id", "tournament_id", "official_at");

CREATE OR REPLACE FUNCTION v1_block_team_record_fact_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'team record facts are append-only' USING ERRCODE = '55000';
END $$;

CREATE TRIGGER v1_block_team_record_fact_mutation
BEFORE UPDATE OR DELETE ON "v1_team_record_facts"
FOR EACH ROW EXECUTE FUNCTION v1_block_team_record_fact_mutation();

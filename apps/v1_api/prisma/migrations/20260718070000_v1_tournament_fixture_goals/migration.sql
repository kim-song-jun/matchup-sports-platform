-- Task 109 Track 5: 대진표 득점자 등록 — 경기 결과에 선수별 득점 기록 추가.
-- 멱등 가드: CREATE TYPE / CREATE TABLE / 컬럼·인덱스·FK 모두 재실행 안전.

DO $$ BEGIN
    CREATE TYPE "V1TournamentGoalTeam" AS ENUM ('home', 'away');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "v1_tournament_fixture_goals" (
    "id" TEXT NOT NULL,
    "fixture_result_id" TEXT NOT NULL,
    "team" "V1TournamentGoalTeam" NOT NULL,
    "player_id" TEXT,
    "player_name" TEXT NOT NULL,
    "minute" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v1_tournament_fixture_goals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "v1_tournament_fixture_goals_fixture_result_id_idx"
    ON "v1_tournament_fixture_goals"("fixture_result_id");

CREATE INDEX IF NOT EXISTS "v1_tournament_fixture_goals_player_id_idx"
    ON "v1_tournament_fixture_goals"("player_id");

DO $$ BEGIN
    ALTER TABLE "v1_tournament_fixture_goals"
        ADD CONSTRAINT "v1_tournament_fixture_goals_fixture_result_id_fkey"
        FOREIGN KEY ("fixture_result_id") REFERENCES "v1_tournament_fixture_results"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "v1_tournament_fixture_goals"
        ADD CONSTRAINT "v1_tournament_fixture_goals_player_id_fkey"
        FOREIGN KEY ("player_id") REFERENCES "v1_tournament_players"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

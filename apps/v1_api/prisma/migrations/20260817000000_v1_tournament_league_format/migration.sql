-- 리그전: 통합 순위 테이블 + 최소 경기 수 설정 + 페어플레이 포인트
-- additive only. 기존 행/컬럼을 변경하거나 삭제하지 않는다.

ALTER TABLE "v1_tournament_standings"
  ADD COLUMN IF NOT EXISTS "fair_play_points" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "v1_tournaments"
  ADD COLUMN IF NOT EXISTS "min_matches_per_team" INTEGER;

CREATE TABLE IF NOT EXISTS "v1_tournament_overall_standings" (
  "id" TEXT NOT NULL,
  "tournament_id" TEXT NOT NULL,
  "registration_id" TEXT NOT NULL,
  "points" INTEGER NOT NULL DEFAULT 0,
  "wins" INTEGER NOT NULL DEFAULT 0,
  "draws" INTEGER NOT NULL DEFAULT 0,
  "losses" INTEGER NOT NULL DEFAULT 0,
  "goals_for" INTEGER NOT NULL DEFAULT 0,
  "goals_against" INTEGER NOT NULL DEFAULT 0,
  "fair_play_points" INTEGER NOT NULL DEFAULT 0,
  "position" INTEGER,
  "recalculated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_tournament_overall_standings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "v1_tournament_overall_standings_tournament_id_registration_id_key"
  ON "v1_tournament_overall_standings" ("tournament_id", "registration_id");

CREATE INDEX IF NOT EXISTS "v1_tournament_overall_standings_tournament_id_position_idx"
  ON "v1_tournament_overall_standings" ("tournament_id", "position");

ALTER TABLE "v1_tournament_overall_standings"
  ADD CONSTRAINT "v1_tournament_overall_standings_tournament_id_fkey"
  FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "v1_tournament_overall_standings"
  ADD CONSTRAINT "v1_tournament_overall_standings_registration_id_fkey"
  FOREIGN KEY ("registration_id") REFERENCES "v1_tournament_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 라인업 재사용(팀 스코프) — 두 가지를 더한다.
--
-- 1) 팀 고정 등번호. 지금까지 등번호는 경기 참가자 행(v1_game_participants.jersey_number)에만
--    있어서 매 경기 다시 입력해야 했다. 팀이 한 번 정해두면 계속 따라오는 "영구 번호"를
--    팀 멤버십에 둔다. 한 팀 안에서 같은 번호를 두 사람이 가질 수 없게 부분 유니크를 건다 —
--    Postgres는 NULL을 서로 다른 값으로 취급하므로 번호를 지정하지 않은 멤버는 몇 명이든
--    공존한다.
-- 2) 팀 라인업 프리셋. 경기 스냅샷과 달리 팀이 계속 고쳐 쓰는 템플릿이라 별도 테이블이다.
--    엔트리의 user_id에는 FK를 걸지 않는다 — v1_game_participants.user_id와 같은 이유로,
--    사용자 탈퇴가 팀의 템플릿을 막아서는 안 된다.

ALTER TABLE "v1_team_memberships" ADD COLUMN IF NOT EXISTS "jersey_number" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "v1_team_memberships_team_id_jersey_number_key"
  ON "v1_team_memberships" ("team_id", "jersey_number");

CREATE TABLE IF NOT EXISTS "v1_team_lineup_presets" (
  "id" TEXT NOT NULL,
  "team_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "formation" TEXT,
  "sport_name" TEXT,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_team_lineup_presets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "v1_team_lineup_presets_team_id_name_key"
  ON "v1_team_lineup_presets" ("team_id", "name");

CREATE INDEX IF NOT EXISTS "v1_team_lineup_presets_team_id_updated_at_idx"
  ON "v1_team_lineup_presets" ("team_id", "updated_at");

CREATE TABLE IF NOT EXISTS "v1_team_lineup_preset_entries" (
  "id" TEXT NOT NULL,
  "preset_id" TEXT NOT NULL,
  "user_id" TEXT,
  "display_name" TEXT NOT NULL,
  "jersey_number" INTEGER,
  "position" TEXT,
  "position_x" DOUBLE PRECISION,
  "position_y" DOUBLE PRECISION,
  "started" BOOLEAN NOT NULL DEFAULT true,
  "goalkeeper" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL,
  CONSTRAINT "v1_team_lineup_preset_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "v1_team_lineup_preset_entries_preset_id_sort_order_idx"
  ON "v1_team_lineup_preset_entries" ("preset_id", "sort_order");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'v1_team_lineup_presets_team_id_fkey'
  ) THEN
    ALTER TABLE "v1_team_lineup_presets"
      ADD CONSTRAINT "v1_team_lineup_presets_team_id_fkey"
      FOREIGN KEY ("team_id") REFERENCES "v1_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'v1_team_lineup_preset_entries_preset_id_fkey'
  ) THEN
    ALTER TABLE "v1_team_lineup_preset_entries"
      ADD CONSTRAINT "v1_team_lineup_preset_entries_preset_id_fkey"
      FOREIGN KEY ("preset_id") REFERENCES "v1_team_lineup_presets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 대회 성별 카테고리(mixed/male/female) + 성별 쿼터(4개, mixed 전용) + 선수 성별 스냅샷.
-- 전부 nullable, DB default 없음 → 기존 row는 NULL(성별정책 없음)로 무영향.
-- 멱등: enum은 duplicate_object 가드, 컬럼은 IF NOT EXISTS 가드.

DO $$ BEGIN
  CREATE TYPE "V1TournamentGenderCategory" AS ENUM ('mixed', 'male', 'female');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "v1_tournaments"
  ADD COLUMN IF NOT EXISTS "gender_category" "V1TournamentGenderCategory",
  ADD COLUMN IF NOT EXISTS "gender_min_male" INTEGER,
  ADD COLUMN IF NOT EXISTS "gender_max_male" INTEGER,
  ADD COLUMN IF NOT EXISTS "gender_min_female" INTEGER,
  ADD COLUMN IF NOT EXISTS "gender_max_female" INTEGER;

ALTER TABLE "v1_tournament_players"
  ADD COLUMN IF NOT EXISTS "gender" TEXT;

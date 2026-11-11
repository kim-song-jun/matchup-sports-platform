-- MD-QA #192: 선출 여부 판정 근거(확인 방법·확인일·확인자)와 선수 본인 신고.
-- 전부 nullable·DB default 없음이라 기존 행은 NULL 로 남고 옛 앱의 읽기·쓰기에 영향이 없다(expand-only).
-- 컬럼·인덱스는 IF NOT EXISTS 로 다시 실행해도 안전하다. enum 생성과 FK 는 expand-contract 게이트
-- (scripts/qa/check-expand-contract-migrations.mjs)가 DO 블록을 additive 로 증명하지 못해 Prisma 표준
-- 형태로 둔다 — Prisma 가 적용 이력을 관리하므로 같은 마이그레이션이 두 번 돌지 않는다.
-- FK 는 이 마이그레이션이 방금 추가한 nullable 컬럼에만 걸리므로 기존 행을 거부할 수 없다.
-- Teameet 은 JoinKFA 에 요청을 보내지 않는다 — 이 컬럼들은 사람이 직접 확인한 수단을 기록할 뿐이다.

CREATE TYPE "V1TournamentPlayerEligibilityMethod" AS ENUM ('joinkfa', 'certificate', 'self_presented', 'self_declared', 'other');

ALTER TABLE "v1_tournament_players"
  ADD COLUMN IF NOT EXISTS "eligibility_verification_method" "V1TournamentPlayerEligibilityMethod",
  ADD COLUMN IF NOT EXISTS "eligibility_verified_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "eligibility_verified_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "self_declared_status" "V1TournamentPlayerEligibility",
  ADD COLUMN IF NOT EXISTS "self_declared_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "v1_tournament_players_user_id_eligibility_verified_at_idx"
  ON "v1_tournament_players"("user_id", "eligibility_verified_at");

CREATE INDEX IF NOT EXISTS "v1_tournament_players_eligibility_verified_by_user_id_idx"
  ON "v1_tournament_players"("eligibility_verified_by_user_id");

ALTER TABLE "v1_tournament_players"
  ADD CONSTRAINT "v1_tournament_players_eligibility_verified_by_user_id_fkey"
  FOREIGN KEY ("eligibility_verified_by_user_id") REFERENCES "v1_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

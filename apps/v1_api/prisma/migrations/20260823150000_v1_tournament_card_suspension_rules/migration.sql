-- 경고 누적·퇴장 출전정지 규정값(대회 단위).
-- 1차 대회 회고 "옐로카드 누적, 레드카드 퇴장등 필요해보임".
--
-- 두 컬럼 모두 nullable 이고 기본값을 두지 않는다 — 값이 있으면 배포 즉시 이미
-- 진행된 대회들에 소급 적용돼 다수 선수가 갑자기 출전정지로 뜬다. NULL = 미적용이
-- 기존 모든 대회의 올바른 상태이며, 운영자가 대회별로 켜는 순간부터 적용된다
-- (2026-08-23 사용자 결정 Q4-A: 대회 생성 시 관리자가 규정값 직접 설정).
--
-- 순수 additive. 백필 UPDATE 없음.
ALTER TABLE "v1_tournaments"
  ADD COLUMN IF NOT EXISTS "yellow_accumulation_limit" INTEGER,
  ADD COLUMN IF NOT EXISTS "red_card_suspension_matches" INTEGER;

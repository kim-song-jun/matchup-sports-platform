-- 명단 검인(체크인): 라인업 참가자가 실제로 도착했는지 기록한다.
-- 1차 대회 회고 "명단 검인 과정에서 오지 않거나, 하지 않은 사람들에 대한 확인이 어려움".
--
-- 순수 additive(nullable 컬럼 1개) — 기존 행 백필 없음. NULL 은 "아직 확인 안 함"이고,
-- 그것이 배포 직후 모든 기존 참가자의 올바른 상태다(과거 경기를 소급 검인할 수는 없다).
-- IF NOT EXISTS 가드로 반복 실행에 안전하게 둔다(이 저장소의 마이그레이션 규율).
ALTER TABLE "v1_game_participants"
  ADD COLUMN IF NOT EXISTS "arrived_at" TIMESTAMP(3);

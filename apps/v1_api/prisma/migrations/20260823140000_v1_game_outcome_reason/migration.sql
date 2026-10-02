-- 몰수·중단 종결 사유: 정상 종료와 구분해 "왜 그 점수인지"를 기록에 남긴다.
-- 1차 대회 회고 "몰수·중단 등 특수 상황 처리" — 지금까지는 운영자가 임의 점수를
-- 수기 입력하는 것뿐이라 정상 종료와 구분되지 않았다.
--
-- 순수 additive. 기존 리비전은 전부 DEFAULT 'NORMAL' 이 되며 그것이 올바른 값이다
-- (과거 경기를 소급해 몰수로 재분류할 수는 없다) — 별도 백필 UPDATE 없음.
-- 이 저장소의 enum 생성 관례를 그대로 따른다(예: 20260710000000_v1_chat_room_polish).
-- DO $$ ... $$ 가드로 감싸면 expand-contract 게이트가 그 블록을 통째로 non-additive
-- 문장으로 읽어 거부한다 — 게이트는 CREATE TYPE 자체는 additive 로 허용한다.
-- Prisma 는 마이그레이션을 _prisma_migrations 로 한 번만 적용하므로 가드도 불필요하다.
CREATE TYPE "V1GameOutcomeReason" AS ENUM ('NORMAL', 'FORFEIT', 'ABANDONED');

ALTER TABLE "v1_game_result_revisions"
  ADD COLUMN IF NOT EXISTS "outcome_reason" "V1GameOutcomeReason" NOT NULL DEFAULT 'NORMAL';

-- 사유 본문은 기존 reason 컬럼을 재사용하지 않고 별도로 둔다. reason 은 정정·시스템
-- 동기화 사유가 쓰는 칸이라 후속 리비전이 덮어쓴다(syncAssistsIntoSubmittedRevision).
-- 사유를 남기는 것이 이 기능의 전부라 그 소실은 기능 무력화다.
ALTER TABLE "v1_game_result_revisions"
  ADD COLUMN IF NOT EXISTS "outcome_note" TEXT;

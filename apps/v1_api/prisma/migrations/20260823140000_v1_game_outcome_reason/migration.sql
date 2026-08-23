-- 몰수·중단 종결 사유: 정상 종료와 구분해 "왜 그 점수인지"를 기록에 남긴다.
-- 1차 대회 회고 "몰수·중단 등 특수 상황 처리" — 지금까지는 운영자가 임의 점수를
-- 수기 입력하는 것뿐이라 정상 종료와 구분되지 않았다.
--
-- 순수 additive. 기존 리비전은 전부 DEFAULT 'NORMAL' 이 되며 그것이 올바른 값이다
-- (과거 경기를 소급해 몰수로 재분류할 수는 없다) — 별도 백필 UPDATE 없음.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'V1GameOutcomeReason') THEN
    CREATE TYPE "V1GameOutcomeReason" AS ENUM ('NORMAL', 'FORFEIT', 'ABANDONED');
  END IF;
END
$$;

ALTER TABLE "v1_game_result_revisions"
  ADD COLUMN IF NOT EXISTS "outcome_reason" "V1GameOutcomeReason" NOT NULL DEFAULT 'NORMAL';

-- MD-QA #187: 경기 사건(골·카드·파울·교체)의 기록 시각 정정.
-- 원본 사건 행은 고치지 않는다(append-only). 정정은 새 TIME_CORRECTION 행으로 남고
-- corrects_event_id 가 원본을 가리킨다. 한 사건을 여러 번 정정할 수 있어 unique 가 아니다.
-- 전부 additive·idempotent 다(enum 값 추가 · nullable 컬럼 · 인덱스 · 가드 트리거).
-- 선례: 20261106180000_v1_verification_purpose_email_change (enum 값 추가),
--       20260729000100_v1_game_operations 의 v1_guard_game_event_reversal (같은 경기 가드).
ALTER TYPE "V1GameEventType" ADD VALUE IF NOT EXISTS 'TIME_CORRECTION';

ALTER TABLE "v1_game_events" ADD COLUMN IF NOT EXISTS "corrects_event_id" TEXT;

CREATE INDEX IF NOT EXISTS "v1_game_events_game_id_corrects_event_id_idx"
  ON "v1_game_events"("game_id", "corrects_event_id");

-- 함수 본문은 실행 시점에 해석되므로 같은 마이그레이션에서 추가한 enum 값을 문자열로
-- 비교해도 안전하다(값 자체를 이 트랜잭션에서 쓰지 않는다).
CREATE OR REPLACE FUNCTION v1_guard_game_event_time_correction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_type text;
BEGIN
  IF NEW.type::text = 'TIME_CORRECTION' AND NEW.corrects_event_id IS NULL THEN
    RAISE EXCEPTION 'time correction must point to the corrected event' USING ERRCODE = '23514';
  END IF;
  IF NEW.corrects_event_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.type::text <> 'TIME_CORRECTION' OR NEW.reverses_event_id IS NOT NULL OR NEW.corrects_event_id = NEW.id THEN
    RAISE EXCEPTION 'only a time correction row may point to a corrected event' USING ERRCODE = '23514';
  END IF;
  SELECT e.type::text INTO target_type FROM v1_game_events e
    WHERE e.id = NEW.corrects_event_id AND e.game_id = NEW.game_id;
  IF target_type IS NULL OR target_type NOT IN ('GOAL', 'OWN_GOAL', 'CARD', 'FOUL', 'SUBSTITUTION') THEN
    RAISE EXCEPTION 'time correction must target a timed event in the same game' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- CREATE OR REPLACE 라 다시 실행해도 같은 트리거 하나다(제약 트리거는 OR REPLACE 를 못 써
-- 일반 BEFORE 트리거로 둔다 — 원본 행은 정정 행보다 항상 먼저 커밋돼 있어 지연 검사가 필요 없다).
-- 기존 코드는 corrects_event_id 를 쓰지 않고 TIME_CORRECTION 도 만들지 않으므로 롤링 배포 중 옛 앱의
-- 쓰기는 이 트리거에 걸리지 않는다(scripts/qa/check-expand-contract-migrations.mjs 검토 항목).
CREATE OR REPLACE TRIGGER v1_game_event_time_correction_guard BEFORE INSERT OR UPDATE ON v1_game_events FOR EACH ROW EXECUTE FUNCTION v1_guard_game_event_time_correction();

-- Task 166 contract — 반려·보완 요청 상태를 데이터와 스키마에서 없앤다.
--
-- expand 단계(PR #997)가 이미 **쓰기 경로를 끊었다**: 코드는 더 이상 이 두 상태로 전이하지
-- 않는다. 남은 것은 그 전에 저장된 행과 enum 값뿐이고, 이 마이그레이션이 그것을 정리한다.
--
-- ## 왜 CHANGE_REQUESTED 로 옮기나
-- 세 상태 모두 "확정되지 않았고 다시 써야 한다" 는 뜻이었고, 공개 단계 매핑도 이미 셋을
-- `change_requested` 하나로 묶어 보여주고 있었다(`league-result-stage.ts`). 옮겨도
-- 관전자·운영자가 보는 값은 달라지지 않는다.
--
-- **다만 "CHANGE_REQUESTED 니까 계속 고칠 수 있다" 는 대회 픽스처엔 해당하지 않는다.**
-- 그 상태가 재작성 허용인 것은 팀 매치 레인뿐이고, 대회 레인에서는 아래 표대로 terminal
-- 이라 모든 재작성 경로가 막힌다. 그래서 이 마이그레이션은 목적지를 둘로 나눈다.
--
-- ## 되돌릴 수 없다
-- 어느 행이 원래 REJECTED 였고 어느 행이 SUPPLEMENT_REQUESTED 였는지는 이 UPDATE 뒤
-- 복원할 수 없다. 그래서 UPDATE **전에** 행 수를 NOTICE 로 남긴다 — 승인 요청과 사후
-- 대조가 이 숫자에 걸려 있다.
--
-- **목적지가 둘이다.** 처음에는 전부 CHANGE_REQUESTED 로 옮기려 했는데, 그렇게 하면
-- 대회 픽스처의 그 경기들이 **영영 고쳐지지 않는다**:
--   · CHANGE_REQUESTED 는 terminal(불변) 이고,
--   · 대회 레인의 재작성 경로 두 개가 모두 막힌다 —
--     `supersedeAndSubmit` 은 contract 이후 base 가 SUBMITTED 뿐이고,
--     `createResultCorrection` 은 base 가 그 경기의 **현재 공식 리비전**이어야 한다.
--     (팀 매치 레인의 `createResultRevision` 은 CHANGE_REQUESTED 를 받지만 대회
--      픽스처를 앞에서 거부한다.)
-- 반대로 전부 SUBMITTED 로 옮기면 이번엔 **확정된 결과를 덮어쓸 수 있다**:
-- `officializeResultRevision` 의 STANDARD 흐름은 "더 새 리비전이 이 행을 승계했는가"
-- 만 보고 "이 경기에 이미 공식 결과가 있는가" 는 보지 않는다. 승계되지 않은 옛 반려
-- 행이 SUBMITTED 가 되면 그대로 확정돼 `current_official_revision_id` 를 빼앗는다.
--
-- 그래서 **고쳐야 할 행만** SUBMITTED("어드민 확인 대기" — 정본 §4 의 한 단계) 로,
-- 나머지는 CHANGE_REQUESTED(terminal, 무해) 로 옮긴다. 판정 조건 셋:
--   ① 그 경기에 현재 공식 리비전이 없다   (있으면 덮어쓸 위험)
--   ② 이 행을 승계한 더 새 리비전이 없다   (있으면 어차피 확정이 막힌다)
--   ③ 이 행이 그 경기의 마지막 리비전이다  (아니면 되살릴 대상이 아니다)
CREATE TEMP TABLE task166_contract_targets AS
SELECT
  r.id,
  r.state::text AS old_state,   -- 위와 같은 이유로 text 로 담는다(재실행 시 enum 라벨 없음)
  (
    g.current_official_revision_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM v1_game_result_revisions s WHERE s.supersedes_id = r.id)
    AND r.revision = (SELECT MAX(x.revision) FROM v1_game_result_revisions x WHERE x.game_id = r.game_id)
  ) AS revivable
FROM v1_game_result_revisions r
JOIN v1_games g ON g.id = r.game_id
-- `state::text` 로 비교한다 — 아래에서 enum 라벨을 지우고 나면 `state = 'REJECTED'`
-- 는 "invalid input value for enum" 으로 터져서, 이 파일을 두 번째로 돌릴 수
-- 없게 된다(0행으로 조용히 지나가야 한다).
WHERE r.state::text IN ('REJECTED', 'SUPPLEMENT_REQUESTED');

DO $$
DECLARE
  rejected_count integer;
  supplement_count integer;
  revivable_count integer;
  frozen_count integer;
BEGIN
  SELECT
    count(*) FILTER (WHERE old_state = 'REJECTED'),
    count(*) FILTER (WHERE old_state = 'SUPPLEMENT_REQUESTED'),
    count(*) FILTER (WHERE revivable),
    count(*) FILTER (WHERE NOT revivable)
  INTO rejected_count, supplement_count, revivable_count, frozen_count
  FROM task166_contract_targets;
  RAISE NOTICE 'task166-contract: REJECTED=% SUPPLEMENT_REQUESTED=% | -> SUBMITTED=% -> CHANGE_REQUESTED=%',
    rejected_count, supplement_count, revivable_count, frozen_count;
END $$;

-- `v1_block_terminal_revision_mutation` 트리거는 REJECTED·SUPPLEMENT_REQUESTED 를 포함해
-- "terminal 리비전은 불변" 을 강제하므로, 그대로 두면 아래 UPDATE 를 스스로 막는다.
ALTER TABLE v1_game_result_revisions DISABLE TRIGGER v1_block_terminal_revision_mutation;

UPDATE v1_game_result_revisions r
SET state = CASE WHEN t.revivable THEN 'SUBMITTED'::"V1GameResultRevisionState"
                 ELSE 'CHANGE_REQUESTED'::"V1GameResultRevisionState" END
FROM task166_contract_targets t
WHERE t.id = r.id;

ALTER TABLE v1_game_result_revisions ENABLE TRIGGER v1_block_terminal_revision_mutation;

DROP TABLE task166_contract_targets;

-- Postgres 는 enum 값을 지울 수 없다 — 타입을 다시 만들어 갈아끼운다.
-- 라벨이 아직 남아 있을 때만 돈다(재실행 시 통째로 건너뛴다).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'V1GameResultRevisionState' AND e.enumlabel = 'REJECTED'
  ) THEN
    RAISE NOTICE 'task166-contract: enum 이 이미 5값이라 타입 교체를 건너뛴다';
    RETURN;
  END IF;
  EXECUTE 'ALTER TYPE "V1GameResultRevisionState" RENAME TO "V1GameResultRevisionState_old"';
  EXECUTE 'CREATE TYPE "V1GameResultRevisionState" AS ENUM (''DRAFT'', ''SUBMITTED'', ''CHANGE_REQUESTED'', ''OFFICIAL'', ''VOID'')';
  -- 기본값(`'DRAFT'::V1GameResultRevisionState`)을 **먼저 떼야 한다** — 붙어 있으면 Postgres 가
  -- "default for column state cannot be cast automatically" 로 거부한다. 값은 바뀌지 않고
  -- 아래에서 새 타입으로 다시 붙인다.
  EXECUTE 'ALTER TABLE v1_game_result_revisions ALTER COLUMN state DROP DEFAULT';
  EXECUTE 'ALTER TABLE v1_game_result_revisions ALTER COLUMN state TYPE "V1GameResultRevisionState" USING state::text::"V1GameResultRevisionState"';
  EXECUTE 'ALTER TABLE v1_game_result_revisions ALTER COLUMN state SET DEFAULT ''DRAFT''::"V1GameResultRevisionState"';
  EXECUTE 'DROP TYPE "V1GameResultRevisionState_old"';
END $$;

-- 트리거 함수도 새 어휘로 다시 만든다. 위 DISABLE/ENABLE 은 실행만 멈췄을 뿐 함수 본문의
-- 죽은 값 참조는 그대로 남아 있어서, 이걸 안 고치면 **다음 UPDATE 때 그 함수가 터진다.**
CREATE OR REPLACE FUNCTION v1_block_terminal_revision_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.state IN ('CHANGE_REQUESTED','OFFICIAL','VOID') THEN RAISE EXCEPTION 'terminal result revisions are immutable' USING ERRCODE = '55000'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.state IN ('CHANGE_REQUESTED','OFFICIAL','VOID') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'terminal result revisions are immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.state <> 'DRAFT' AND (NEW.game_id IS DISTINCT FROM OLD.game_id OR NEW.revision IS DISTINCT FROM OLD.revision OR NEW.score IS DISTINCT FROM OLD.score OR NEW.events_hash IS DISTINCT FROM OLD.events_hash OR NEW.missing_scorer IS DISTINCT FROM OLD.missing_scorer OR NEW.mvp_participant_id IS DISTINCT FROM OLD.mvp_participant_id OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.created_by_actor_type IS DISTINCT FROM OLD.created_by_actor_type OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id OR NEW.created_by_system_actor IS DISTINCT FROM OLD.created_by_system_actor OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'submitted result content is frozen' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;

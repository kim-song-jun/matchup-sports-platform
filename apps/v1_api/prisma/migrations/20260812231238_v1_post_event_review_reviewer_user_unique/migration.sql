-- 팀 대상 후기의 중복 방지 단위를 "팀"에서 "사람"으로 옮긴다.
--
-- 배경: 팀 후기는 지금까지 참가팀의 owner/manager만 쓸 수 있었고, 그래서 unique 키도
-- reviewerTeamId 기준이었다. 후기 작성 권한을 참가팀 active 멤버 전원에게 여는 정책 변경에서
-- 이 두 제약을 반드시 함께 드롭해야 한다 — 남겨두면 같은 팀의 두 번째 멤버가 제출할 때
-- unique 위반으로 막혀서, 권한만 열리고 실제로는 여전히 팀당 1명만 쓸 수 있는 상태가 된다.
-- 중복 스코프 자체(team_match=매치당 source_id / tournament_fixture=대회당 source_group_id)는
-- 그대로 두고 주체 컬럼만 reviewer_team_id -> reviewer_user_id 로 교체한다.
--
-- 개인 대상 후기의 (reviewer_user_id, target_user_id, source_type, source_id) 제약은 건드리지
-- 않는다. 팀 후기 행은 target_user_id 가 NULL 이고 Postgres unique 는 NULL 을 서로 다른 값으로
-- 보므로 두 제약은 서로 충돌하지 않는다.
--
-- 안전성: 새 제약은 기존 제약보다 좁다. 한 사람이 서로 다른 두 팀 소속으로 같은 상대를 평가한
-- 행이 있으면(기존엔 reviewer_team_id 가 달라 허용됐다) 인덱스 생성이 실패한다. 그 상황을
-- 인덱스 생성 에러로 흘리지 않고 아래 사전 검사가 먼저 잡아 건수와 함께 실패시킨다.
-- 어느 후기를 남길지는 사람이 판단해야 하므로 자동으로 행을 지우지 않는다.
DO $$
DECLARE
  source_conflicts bigint;
  group_conflicts bigint;
BEGIN
  SELECT count(*) INTO source_conflicts
  FROM (
    SELECT 1
    FROM "v1_post_event_reviews"
    WHERE "target_team_id" IS NOT NULL
    GROUP BY "reviewer_user_id", "target_team_id", "source_type", "source_id"
    HAVING count(*) > 1
  ) AS duplicated_by_source;

  SELECT count(*) INTO group_conflicts
  FROM (
    SELECT 1
    FROM "v1_post_event_reviews"
    WHERE "target_team_id" IS NOT NULL
      AND "source_group_id" IS NOT NULL
    GROUP BY "reviewer_user_id", "target_team_id", "source_type", "source_group_id"
    HAVING count(*) > 1
  ) AS duplicated_by_group;

  IF source_conflicts > 0 OR group_conflicts > 0 THEN
    RAISE EXCEPTION
      '팀 후기 unique 제약을 사람 기준으로 바꿀 수 없어요. (reviewer_user_id, target_team_id, source_type, source_id) 충돌 %건, (reviewer_user_id, target_team_id, source_type, source_group_id) 충돌 %건. 한 사람이 서로 다른 두 팀 소속으로 같은 상대를 평가한 후기입니다. 어느 후기를 남길지 자동으로 정하지 않으니, 수동으로 정리한 뒤 마이그레이션을 다시 실행하세요.',
      source_conflicts, group_conflicts
      USING ERRCODE = '23505';
  END IF;

  DROP INDEX IF EXISTS "v1_post_event_reviews_reviewer_team_id_target_team_id_sourc_key";
  DROP INDEX IF EXISTS "v1_post_event_reviews_team_source_group_key";

  CREATE UNIQUE INDEX IF NOT EXISTS "v1_post_event_reviews_user_team_source_key"
    ON "v1_post_event_reviews"("reviewer_user_id", "target_team_id", "source_type", "source_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "v1_post_event_reviews_user_team_source_group_key"
    ON "v1_post_event_reviews"("reviewer_user_id", "target_team_id", "source_type", "source_group_id");
END $$;

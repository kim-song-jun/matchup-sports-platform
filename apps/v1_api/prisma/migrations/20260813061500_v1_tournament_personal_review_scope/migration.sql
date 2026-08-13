-- 대회 개인 후기(sourceType=tournament_fixture · targetType=user) 도입에 필요한 두 가지를 함께 넣는다.
--
-- 1) 평판 집계 컬럼 분리 (v1_user_reputation_summaries)
--    개인 매치(match) 후기가 쌓아온 manner_score/review_count/trust_state에 대회 후기를 그대로 합산하면,
--    대회 한 번(상대팀 로스터 전원 × 여러 경기)에 며칠 만에 수십 건이 들어와 기존 평점이 통째로 덮인다.
--    v1_team_trust_scores의 tournament_* 분리(20260719020000)와 같은 선례를 그대로 따른다 —
--    두 recalculate 경로가 서로 다른 모집단을 계산하면서 같은 컬럼을 last-write-wins로 덮어쓰는 문제도 함께 막힌다.
--
-- 2) 대회 단위 중복 방지 인덱스 (v1_post_event_reviews)
--    개인 대상 후기의 기존 제약은 (reviewer_user_id, target_user_id, source_type, source_id)인데
--    대회 후기의 source_id는 "픽스처"라서, 같은 상대를 예선·8강·결승에서 세 번 평가할 수 있다.
--    팀 대상 후기가 이미 쓰고 있는 source_group_id(=대회) 스코프를 개인 대상에도 똑같이 적용한다.
--    match 후기는 source_group_id가 NULL이고 Postgres unique는 NULL을 서로 다른 값으로 보므로 영향이 없다.
--
--    안전성: 새 인덱스는 기존 제약보다 좁다. 한 사람이 같은 대회에서 같은 상대를 두 번 이상 평가한 행이
--    이미 있으면 인덱스 생성이 실패한다. 그 상황을 인덱스 생성 에러로 흘리지 않고 아래 사전 검사가 먼저
--    건수와 함께 실패시킨다 — 어느 후기를 남길지는 사람이 판단해야 하므로 자동으로 행을 지우지 않는다.
--    (이 기능 출시 전에는 targetType=user + tournament_fixture 조합 자체를 서버가 400으로 거부했으므로
--     실제 데이터에서 이 검사가 걸릴 일은 없다. 그래도 조용한 실패보다 시끄러운 실패를 택한다.)
ALTER TABLE "v1_user_reputation_summaries" ADD COLUMN IF NOT EXISTS "tournament_trust_state" "V1TrustState" NOT NULL DEFAULT 'sample';

ALTER TABLE "v1_user_reputation_summaries" ADD COLUMN IF NOT EXISTS "tournament_manner_score" DECIMAL(4,2);

ALTER TABLE "v1_user_reputation_summaries" ADD COLUMN IF NOT EXISTS "tournament_review_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "v1_user_reputation_summaries" ADD COLUMN IF NOT EXISTS "tournament_source_label" TEXT;

DO $$
DECLARE
  group_conflicts bigint;
BEGIN
  SELECT count(*) INTO group_conflicts
  FROM (
    SELECT 1
    FROM "v1_post_event_reviews"
    WHERE "target_user_id" IS NOT NULL
      AND "source_group_id" IS NOT NULL
    GROUP BY "reviewer_user_id", "target_user_id", "source_type", "source_group_id"
    HAVING count(*) > 1
  ) AS duplicated_by_group;

  IF group_conflicts > 0 THEN
    RAISE EXCEPTION
      '개인 후기에 대회 단위 중복 방지 제약을 걸 수 없어요. (reviewer_user_id, target_user_id, source_type, source_group_id) 충돌 %건. 한 사람이 같은 대회에서 같은 상대를 두 번 이상 평가한 후기입니다. 어느 후기를 남길지 자동으로 정하지 않으니, 수동으로 정리한 뒤 마이그레이션을 다시 실행하세요.',
      group_conflicts
      USING ERRCODE = '23505';
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS "v1_post_event_reviews_user_user_source_group_key"
    ON "v1_post_event_reviews"("reviewer_user_id", "target_user_id", "source_type", "source_group_id");
END $$;

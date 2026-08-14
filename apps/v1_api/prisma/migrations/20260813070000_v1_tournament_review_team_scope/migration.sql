-- 트랙 B: 대회 후기 작성 권한을 "신청자 본인" → "참가 확정 팀의 팀장·운영진(manager+)"으로
-- 확장하기 위해 v1_tournament_reviews 에 team_id 를 추가하고, 과거 "신청자 본인" 기준으로
-- 쌓인 리뷰를 registration.team_id 로 백필한다.
--
-- 데이터 삭제 없음 · 전 구문 idempotent(빈 DB 재생 포함, CI "V1 migration replay + drift gate").

-- ── 1) 컬럼 추가 (nullable) ─────────────────────────────────────────────────
-- team_id 를 nullable 로 두는 이유: 아래 3)에서 같은 (tournament_id, team_id) 조합으로
-- 2건 이상 매핑되는 이상(異常) 데이터가 있으면 가장 이른 1건만 채우고 나머지는 NULL 로
-- 남기기 때문(레거시 개인 리뷰로 보존 — 삭제하지 않는다).
ALTER TABLE "v1_tournament_reviews" ADD COLUMN IF NOT EXISTS "team_id" TEXT;

-- ── 2) 백필: author_user_id 가 실제로 신청한(applied_by_user_id) 등록의 team_id 를 채운다.
--
--    v1_tournament_registrations 는 (tournament_id, team_id) 유일 제약만 있고
--    (tournament_id, applied_by_user_id) 는 유일하지 않다 — 한 사용자가 여러 팀의
--    owner/manager 를 겸하며 같은 대회에 그 팀들을 각각 등록(신청)할 수 있기 때문이다
--    (바로 이 마이그레이션이 지원하는 "팀장·운영진 겸임" 시나리오). 이 경우 tournament_id +
--    applied_by_user_id 로만 조인하면 리뷰 1건이 팀 개수만큼 fan-out 되고, 그 fan-out 행들을
--    단순 ROW_NUMBER 로 뽑아 UPDATE ... FROM 에 넘기면 여러 FROM 행이 같은 대상 행(r.id)에
--    동시에 매치되어 Postgres 가 "어느 행이 쓰일지 unspecified" 로 처리한다 — 즉 에러 없이
--    review.team_name 스냅샷과 다른 team_id 가 조용히 배정될 수 있다.
--
--    그래서 후보를 다음 두 조건으로 좁힌 뒤, 그 결과가 review 당 정확히 1건일 때만 채운다:
--      (a) registration.status = 'confirmed' — 레거시 submitReview() 가 리뷰 작성 가능
--          조건으로 요구했던 것과 동일한 필터(draft/cancelled 등록은 애초에 후보가 아니었다).
--      (b) review.team_name 스냅샷이 있으면 team.name 과 일치하는 등록만 후보로 남긴다 —
--          레거시 리뷰가 실제로 어느 팀 소속으로 작성됐는지의 유일한 단서다.
--    두 조건을 다 적용해도 candidate_count <> 1 (0건 또는 여전히 2건 이상 모호)이면 team_id 는
--    NULL 로 남긴다 — 컬럼을 nullable 로 설계한 이유(주석 참조)가 바로 이 케이스다. 추측으로
--    임의 배정하지 않는다.
UPDATE "v1_tournament_reviews" r
SET "team_id" = candidate.team_id
FROM (
  SELECT matched.review_id, matched.team_id
  FROM (
    SELECT
      rv.id AS review_id,
      reg.team_id AS team_id,
      COUNT(*) OVER (PARTITION BY rv.id) AS candidate_count
    FROM "v1_tournament_reviews" rv
    JOIN "v1_tournament_registrations" reg
      ON reg.tournament_id = rv.tournament_id
     AND reg.applied_by_user_id = rv.author_user_id
     AND reg.status = 'confirmed'
    JOIN "v1_teams" t ON t.id = reg.team_id
    WHERE rv.team_id IS NULL
      AND (rv.team_name IS NULL OR t.name = rv.team_name)
  ) AS matched
  WHERE matched.candidate_count = 1
) AS candidate
WHERE r.id = candidate.review_id;

-- ── 3) 팀당 대회 1건 유일 제약 ───────────────────────────────────────────────
-- WHERE 절이 있는 partial index 가 아니라 평범한 composite unique 를 쓴다. Postgres 표준
-- NULL-distinct 시맨틱상 team_id 가 NULL 인 행끼리는 서로 유일성 위반이 아니므로(레거시
-- 미연결 리뷰가 여러 건 있어도 안전) partial index 가 애초에 필요 없다. 오히려 Prisma
-- schema DSL 은 WHERE 절을 가진 partial index 를 표현할 방법이 없어, 그걸 쓰면
-- `prisma migrate diff --to-schema-datamodel` 드리프트 게이트가 영구적으로 실패한다.
--
-- 생성 전, 백필이 의도대로 동작했는지(비-NULL team_id 에 중복 없음) 방어적으로 재검증한다 —
-- 조용한 실패보다 시끄러운 실패 (v1_post_event_reviews_user_user_source_group_key 선례와
-- 동일 패턴).
DO $$
DECLARE
  duplicate_count bigint;
BEGIN
  SELECT count(*) INTO duplicate_count
  FROM (
    SELECT 1
    FROM "v1_tournament_reviews"
    WHERE "team_id" IS NOT NULL
    GROUP BY "tournament_id", "team_id"
    HAVING count(*) > 1
  ) AS duplicated;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      '대회 후기에 팀당 1건 제약을 걸 수 없어요. (tournament_id, team_id) 충돌 %건. 백필 로직이 예상과 다르게 동작했습니다 — 수동으로 정리한 뒤 마이그레이션을 다시 실행하세요.',
      duplicate_count
      USING ERRCODE = '23505';
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS "v1_tournament_reviews_tournament_id_team_id_key"
    ON "v1_tournament_reviews"("tournament_id", "team_id");
END $$;

-- ── 4) FK: team_id → v1_teams(id), ON DELETE RESTRICT ──────────────────────
-- V1Team 은 이 코드베이스에서 물리적으로 delete 되지 않는다(항상 deletedAt soft delete) —
-- 같은 테이블(v1_tournament_registrations.team)의 FK 도 동일하게 RESTRICT 를 쓴다. 리뷰가
-- 팀 삭제로 사라지는 경로 자체를 DB 레벨에서 막는 것이 SetNull 보다 강한 보장이다.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_reviews_team_id_fkey'
  ) THEN
    ALTER TABLE "v1_tournament_reviews"
      ADD CONSTRAINT "v1_tournament_reviews_team_id_fkey"
      FOREIGN KEY ("team_id") REFERENCES "v1_teams"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

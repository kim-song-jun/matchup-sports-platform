-- 정규 리그 신청을 대회와 같은 상태 기준으로 옮긴다(2026-10-27 사용자 확정).
-- 예전 리그는 마감 시각만 보고 신청을 받았고, 이제는 status = 'open'(접수 중)이고 마감 전일 때만 받는다.
-- 배포 순간 신청 가능 여부가 바뀌지 않도록 시작 전 리그만 옮긴다. 진행 중 리그는 새 규칙대로 신청이 닫힌다.
-- registration_deadline_at·updated_at 은 UTC 값을 담은 timestamp(시간대 없음)라 now() 를 UTC 로 바꿔 비교·저장한다 — 세션 TimeZone 에 따라 어긋나지 않게.

-- 1) 시작 전(초안·마감)인데 마감이 남아 신청을 받던 리그 → 접수 중.
UPDATE "v1_tournaments"
SET "status" = 'open', "updated_at" = (now() AT TIME ZONE 'UTC')
WHERE "kind" = 'regular_league'
  AND "deleted_at" IS NULL
  AND "status" IN ('draft', 'closed')
  AND "registration_deadline_at" >= (now() AT TIME ZONE 'UTC');

-- 2) 예전 '접수 중'인데 마감이 없던 리그는 신청을 받지 않았다 → 마감. 새 규칙에서는 마감 없는 접수 중이 계속 받기 때문이다.
UPDATE "v1_tournaments"
SET "status" = 'closed', "updated_at" = (now() AT TIME ZONE 'UTC')
WHERE "kind" = 'regular_league'
  AND "deleted_at" IS NULL
  AND "status" = 'open'
  AND "registration_deadline_at" IS NULL;

-- 3) 보류 중인 리그는 보류를 풀 때 돌아갈 상태를 같은 규칙으로 옮긴다.
UPDATE "v1_tournaments"
SET "held_from_status" = 'open', "updated_at" = (now() AT TIME ZONE 'UTC')
WHERE "kind" = 'regular_league'
  AND "deleted_at" IS NULL
  AND "status" = 'on_hold'
  AND "held_from_status" IN ('draft', 'closed')
  AND "registration_deadline_at" >= (now() AT TIME ZONE 'UTC');

UPDATE "v1_tournaments"
SET "held_from_status" = 'closed', "updated_at" = (now() AT TIME ZONE 'UTC')
WHERE "kind" = 'regular_league'
  AND "deleted_at" IS NULL
  AND "status" = 'on_hold'
  AND "held_from_status" = 'open'
  AND "registration_deadline_at" IS NULL;

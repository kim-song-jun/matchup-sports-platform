-- 드리프트 클로저: db push로만 dev에 반영됐던 잔여 변경을 마이그레이션 체인에 편입한다.
-- (마이그레이션 재생 CI 게이트 도입 시점의 스냅샷 — 이후 변경은 반드시 migration으로)
-- 전부 idempotent: 이미 반영된 환경(dev)에서는 no-op.

-- 알림 대상 타입에 tournament 추가
ALTER TYPE "V1NotificationTargetType" ADD VALUE IF NOT EXISTS 'tournament';

-- 공지 카테고리
ALTER TABLE "v1_notices" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT '안내';
CREATE INDEX IF NOT EXISTS "v1_notices_category_status_published_at_idx"
    ON "v1_notices"("category", "status", "published_at");

-- 알림 선호도 카테고리 토글 5종
ALTER TABLE "v1_notification_preferences"
    ADD COLUMN IF NOT EXISTS "chat_enabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "match_enabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "notice_enabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "team_enabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "team_match_enabled" BOOLEAN NOT NULL DEFAULT true;

-- post_event_reviews 인덱스명 정렬 (63자 절단 시점 차이로 이름이 갈림)
-- 구명이 있으면 새 이름으로 rename, 없으면(이미 새 이름) no-op
ALTER INDEX IF EXISTS "v1_post_event_reviews_reviewer_team_id_source_type_submit_idx"
    RENAME TO "v1_post_event_reviews_reviewer_team_id_source_type_submitte_idx";
ALTER INDEX IF EXISTS "v1_post_event_reviews_reviewer_team_id_target_team_id_s_key"
    RENAME TO "v1_post_event_reviews_reviewer_team_id_target_team_id_sourc_key";
ALTER INDEX IF EXISTS "v1_post_event_reviews_reviewer_user_id_source_type_submit_idx"
    RENAME TO "v1_post_event_reviews_reviewer_user_id_source_type_submitte_idx";
ALTER INDEX IF EXISTS "v1_post_event_reviews_reviewer_user_id_target_user_id_s_key"
    RENAME TO "v1_post_event_reviews_reviewer_user_id_target_user_id_sourc_key";

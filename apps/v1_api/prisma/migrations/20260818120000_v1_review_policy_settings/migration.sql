-- 리뷰 작성 가능 기간 정책을 어드민이 편집할 수 있게 하는 싱글턴 설정 테이블.
-- 기본값 168시간(7일) — 이전 하드코딩 값은 48시간이었다.
--
-- 행을 미리 시드하지 않는다. expand-contract 게이트가 INSERT 를 범주로 거부하는데
-- (additive 임을 증명할 수 없어서), 시드는 실제로 필요하지도 않다 —
-- ReviewPolicySettingsService 가 행이 없으면 기본값 168로 동작하고, 어드민이 처음
-- 저장할 때 upsert 로 행이 생긴다.
CREATE TABLE IF NOT EXISTS "v1_review_policy_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "review_window_hours" INTEGER NOT NULL DEFAULT 168,
    "updated_by_admin_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "v1_review_policy_settings_pkey" PRIMARY KEY ("id")
);

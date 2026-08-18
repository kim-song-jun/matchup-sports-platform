-- 리뷰 작성 가능 기간 정책을 어드민이 편집할 수 있게 하는 싱글턴 설정 테이블.
-- 기본값 168시간(7일) — 이전 하드코딩 값은 48시간이었다.
CREATE TABLE IF NOT EXISTS "v1_review_policy_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "review_window_hours" INTEGER NOT NULL DEFAULT 168,
    "updated_by_admin_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "v1_review_policy_settings_pkey" PRIMARY KEY ("id")
);

-- 싱글턴 행을 미리 만들어 둔다. 행이 없으면 서비스가 기본값으로 동작하지만,
-- 어드민 화면이 "마지막 수정 시각"을 바로 보여줄 수 있도록 시드한다.
INSERT INTO "v1_review_policy_settings" ("id", "review_window_hours", "updated_at")
VALUES ('singleton', 168, NOW())
ON CONFLICT ("id") DO NOTHING;

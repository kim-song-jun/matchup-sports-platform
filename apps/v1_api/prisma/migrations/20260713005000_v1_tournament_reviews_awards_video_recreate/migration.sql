-- 대회 후기/시상/영상 기능(PR #31) 재생성 마이그레이션.
--
-- 배경: prod DB 를 로컬 dev DB로 재동기화(pg_restore)하는 과정에서, main 브랜치의
-- 20260713000000_revert_v1_tournament_reviews_awards_video 마이그레이션(이 브랜치에는
-- 없음)이 prod에 적용되어 v1_tournament_reviews / v1_tournament_awards /
-- v1_tournament_fixture_videos 테이블과 v1_tournaments.cover_image_url 컬럼이 물리적으로
-- DROP된 채로 복원되었다. 반면 이 브랜치(feat/v1-reviews-notify-ux)는 revert를 받지
-- 않았고 기능을 계속 개발 중이므로, _prisma_migrations 북키핑 상으로는 원본 CREATE
-- 마이그레이션(20260711090000/20260711170000/20260711180000/20260711200000)이 이미
-- "적용됨"으로 기록돼 있어 재실행되지 않는다. 그 결과 이후 마이그레이션
-- (20260713010000_v1_tournament_review_moderation)이 존재하지 않는 테이블에
-- ALTER TABLE 을 시도하며 42P01로 실패한다.
--
-- 이 마이그레이션은 그 갭을 메우기 위해 원본 DDL을 전부 idempotent 가드(IF NOT EXISTS /
-- DO $$ 예외 처리)로 재작성한 것이다. 테이블/컬럼/인덱스가 이미 존재하는 환경(예: 이
-- revert를 겪지 않은 다른 dev/staging DB)에서는 완전히 no-op으로 동작한다.

-- cover_image_url 컬럼 (원본: 20260711090000_v1_tournament_cover_image)
ALTER TABLE "v1_tournaments"
ADD COLUMN IF NOT EXISTS "cover_image_url" TEXT;

-- v1_tournament_reviews + v1_tournament_awards (원본: 20260711170000_v1_tournament_reviews_and_awards)
CREATE TABLE IF NOT EXISTS "v1_tournament_reviews" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "team_name" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_tournament_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "v1_tournament_awards" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "award_type" TEXT NOT NULL,
    "award_label" TEXT NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "team_name" TEXT,
    "note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_tournament_awards_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "v1_tournament_reviews_tournament_id_created_at_idx" ON "v1_tournament_reviews"("tournament_id", "created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "v1_tournament_reviews_tournament_id_author_user_id_key" ON "v1_tournament_reviews"("tournament_id", "author_user_id");

CREATE INDEX IF NOT EXISTS "v1_tournament_awards_tournament_id_sort_order_idx" ON "v1_tournament_awards"("tournament_id", "sort_order");

CREATE UNIQUE INDEX IF NOT EXISTS "v1_tournament_awards_tournament_id_award_type_key" ON "v1_tournament_awards"("tournament_id", "award_type");

DO $$ BEGIN
  ALTER TABLE "v1_tournament_reviews" ADD CONSTRAINT "v1_tournament_reviews_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "v1_tournament_reviews" ADD CONSTRAINT "v1_tournament_reviews_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "v1_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "v1_tournament_awards" ADD CONSTRAINT "v1_tournament_awards_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- photo_urls 컬럼 (원본: 20260711180000_v1_tournament_review_photos)
ALTER TABLE "v1_tournament_reviews"
ADD COLUMN IF NOT EXISTS "photo_urls" TEXT[] NOT NULL DEFAULT '{}';

-- v1_tournament_fixture_videos (원본: 20260711200000_v1_fixture_videos)
CREATE TABLE IF NOT EXISTS "v1_tournament_fixture_videos" (
    "id" TEXT NOT NULL,
    "fixture_id" TEXT NOT NULL,
    "title" TEXT,
    "url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v1_tournament_fixture_videos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "v1_tournament_fixture_videos_fixture_id_sort_order_idx" ON "v1_tournament_fixture_videos"("fixture_id", "sort_order");

DO $$ BEGIN
  ALTER TABLE "v1_tournament_fixture_videos" ADD CONSTRAINT "v1_tournament_fixture_videos_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "v1_tournament_fixtures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

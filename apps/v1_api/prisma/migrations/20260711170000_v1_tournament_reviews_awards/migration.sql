-- v1 대회 리뷰·개인 시상 테이블 생성 (hotfix)
-- 기능 커밋 당시 마이그레이션이 누락되어 dev에는 수동 SQL로만 존재했고,
-- prod migrate deploy가 20260711180000(photo_urls ALTER)에서 42P01로 실패했다.
-- IF NOT EXISTS: 테이블이 이미 있는 환경(dev)에서도 안전하게 no-op.

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
-- photo_urls 컬럼은 다음 마이그레이션(20260711180000_v1_tournament_review_photos)이 추가한다.

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

CREATE UNIQUE INDEX IF NOT EXISTS "v1_tournament_reviews_tournament_id_author_user_id_key"
    ON "v1_tournament_reviews"("tournament_id", "author_user_id");
CREATE INDEX IF NOT EXISTS "v1_tournament_reviews_tournament_id_created_at_idx"
    ON "v1_tournament_reviews"("tournament_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "v1_tournament_awards_tournament_id_award_type_key"
    ON "v1_tournament_awards"("tournament_id", "award_type");
CREATE INDEX IF NOT EXISTS "v1_tournament_awards_tournament_id_sort_order_idx"
    ON "v1_tournament_awards"("tournament_id", "sort_order");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_reviews_tournament_id_fkey') THEN
    ALTER TABLE "v1_tournament_reviews"
      ADD CONSTRAINT "v1_tournament_reviews_tournament_id_fkey"
      FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_reviews_author_user_id_fkey') THEN
    ALTER TABLE "v1_tournament_reviews"
      ADD CONSTRAINT "v1_tournament_reviews_author_user_id_fkey"
      FOREIGN KEY ("author_user_id") REFERENCES "v1_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_awards_tournament_id_fkey') THEN
    ALTER TABLE "v1_tournament_awards"
      ADD CONSTRAINT "v1_tournament_awards_tournament_id_fkey"
      FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

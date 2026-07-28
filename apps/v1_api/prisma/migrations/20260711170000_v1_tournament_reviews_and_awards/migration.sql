-- 대회 참가팀 후기(v1_tournament_reviews) + 개인 어워드(v1_tournament_awards)
-- PR #31 (3167cb27)에서 schema.prisma 모델만 추가되고 마이그레이션 파일이 누락되어
-- 프로덕션 배포 실패(P3018)를 일으킨 것을 사후 보정하는 마이그레이션.
CREATE TABLE "v1_tournament_reviews" (
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

CREATE TABLE "v1_tournament_awards" (
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

CREATE INDEX "v1_tournament_reviews_tournament_id_created_at_idx" ON "v1_tournament_reviews"("tournament_id", "created_at");

CREATE UNIQUE INDEX "v1_tournament_reviews_tournament_id_author_user_id_key" ON "v1_tournament_reviews"("tournament_id", "author_user_id");

CREATE INDEX "v1_tournament_awards_tournament_id_sort_order_idx" ON "v1_tournament_awards"("tournament_id", "sort_order");

CREATE UNIQUE INDEX "v1_tournament_awards_tournament_id_award_type_key" ON "v1_tournament_awards"("tournament_id", "award_type");

ALTER TABLE "v1_tournament_reviews" ADD CONSTRAINT "v1_tournament_reviews_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "v1_tournament_reviews" ADD CONSTRAINT "v1_tournament_reviews_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "v1_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "v1_tournament_awards" ADD CONSTRAINT "v1_tournament_awards_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

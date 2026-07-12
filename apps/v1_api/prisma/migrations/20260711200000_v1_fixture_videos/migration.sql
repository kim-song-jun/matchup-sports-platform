-- 경기 하이라이트/중계 영상 — 경기당 여러 개 (유튜브 링크 또는 업로드 파일 URL)
CREATE TABLE "v1_tournament_fixture_videos" (
    "id" TEXT NOT NULL,
    "fixture_id" TEXT NOT NULL,
    "title" TEXT,
    "url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v1_tournament_fixture_videos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "v1_tournament_fixture_videos_fixture_id_sort_order_idx" ON "v1_tournament_fixture_videos"("fixture_id", "sort_order");

ALTER TABLE "v1_tournament_fixture_videos" ADD CONSTRAINT "v1_tournament_fixture_videos_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "v1_tournament_fixtures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

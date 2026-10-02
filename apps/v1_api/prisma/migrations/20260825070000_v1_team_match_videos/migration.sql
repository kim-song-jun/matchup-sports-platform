-- 리그 대진(팀매치) 하이라이트/중계 영상 — 경기당 여러 개 (유튜브 링크 또는 업로드 파일 URL).
-- v1_tournament_fixture_videos(20260711200000_v1_fixture_videos)의 팀매치 판.
CREATE TABLE "v1_team_match_videos" (
    "id" TEXT NOT NULL,
    "team_match_id" TEXT NOT NULL,
    "title" TEXT,
    "url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v1_team_match_videos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "v1_team_match_videos_team_match_id_sort_order_idx" ON "v1_team_match_videos"("team_match_id", "sort_order");

ALTER TABLE "v1_team_match_videos" ADD CONSTRAINT "v1_team_match_videos_team_match_id_fkey" FOREIGN KEY ("team_match_id") REFERENCES "v1_team_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

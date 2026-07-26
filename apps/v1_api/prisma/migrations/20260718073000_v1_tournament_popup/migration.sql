-- 대회 상세 페이지 전용 공지/홍보 팝업(V1TournamentPopup). 기존 v1_popups(홈 전역 팝업)와는 별개 테이블.
-- V1NoticeStatus enum(draft/published/archived)을 재사용한다 — 신규 enum 없음.
-- idempotent: 수동으로 이미 적용된 dev DB에 재실행해도 안전.

CREATE TABLE IF NOT EXISTS "v1_tournament_popups" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "image_url" TEXT,
    "status" "V1NoticeStatus" NOT NULL DEFAULT 'draft',
    "display_start_at" TIMESTAMP(3),
    "display_end_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_tournament_popups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "v1_tournament_popups_active_window_idx"
ON "v1_tournament_popups"("tournament_id", "status", "display_start_at", "display_end_at");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_popups_tournament_id_fkey'
  ) THEN
    ALTER TABLE "v1_tournament_popups"
    ADD CONSTRAINT "v1_tournament_popups_tournament_id_fkey"
    FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

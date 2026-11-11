-- MD-QA #186: 조별리그 단계별 동점 순서와 6강 결승 직행 비교 순서. 새 표·nullable 열만 더하는 expand 변경이라
-- 기존 대회는 행이 없거나 null 이어서 지금 순서를 그대로 따른다.
ALTER TABLE "v1_tournaments" ADD COLUMN IF NOT EXISTS "six_team_direct_final_order" JSONB;

CREATE TABLE IF NOT EXISTS "v1_tournament_stage_tie_break_settings" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "stage_key" TEXT NOT NULL,
    "order" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_tournament_stage_tie_break_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "v1_tournament_stage_tie_break_settings_tournament_stage_key"
ON "v1_tournament_stage_tie_break_settings"("tournament_id", "stage_key");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_stage_tie_break_settings_tournament_fk') THEN
    ALTER TABLE "v1_tournament_stage_tie_break_settings"
    ADD CONSTRAINT "v1_tournament_stage_tie_break_settings_tournament_fk"
    FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

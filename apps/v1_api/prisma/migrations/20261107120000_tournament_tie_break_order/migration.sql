-- 대회별 동점 순서. null 은 기본 순서(승점 → 맞대결 → 득실차 → 다득점 → 페어플레이 → 추첨)라 기존 행은 바뀌지 않는다.
ALTER TABLE "v1_tournaments" ADD COLUMN IF NOT EXISTS "tie_break_order" JSONB;

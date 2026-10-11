-- 장소 검색으로 고른 장소의 스냅샷 칸. 추가만 하는 expand 단계라 기존 행은 전부 null(직접 입력 장소)로 남는다.
ALTER TABLE "v1_matches" ADD COLUMN IF NOT EXISTS "place_latitude" DOUBLE PRECISION;
ALTER TABLE "v1_matches" ADD COLUMN IF NOT EXISTS "place_longitude" DOUBLE PRECISION;
ALTER TABLE "v1_matches" ADD COLUMN IF NOT EXISTS "place_provider" TEXT;
ALTER TABLE "v1_matches" ADD COLUMN IF NOT EXISTS "place_provider_id" TEXT;

ALTER TABLE "v1_team_matches" ADD COLUMN IF NOT EXISTS "place_latitude" DOUBLE PRECISION;
ALTER TABLE "v1_team_matches" ADD COLUMN IF NOT EXISTS "place_longitude" DOUBLE PRECISION;
ALTER TABLE "v1_team_matches" ADD COLUMN IF NOT EXISTS "place_provider" TEXT;
ALTER TABLE "v1_team_matches" ADD COLUMN IF NOT EXISTS "place_provider_id" TEXT;

ALTER TABLE "v1_tournaments" ADD COLUMN IF NOT EXISTS "venue_address" TEXT;
ALTER TABLE "v1_tournaments" ADD COLUMN IF NOT EXISTS "venue_provider" TEXT;
ALTER TABLE "v1_tournaments" ADD COLUMN IF NOT EXISTS "venue_provider_id" TEXT;

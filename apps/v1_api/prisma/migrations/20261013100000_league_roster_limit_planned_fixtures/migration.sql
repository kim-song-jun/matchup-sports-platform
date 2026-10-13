-- 리그 팀 명단 정원 "제한 없음"(null)과 리그 총 경기 수 계획.
ALTER TABLE "v1_tournaments" ALTER COLUMN "max_players" DROP NOT NULL;
ALTER TABLE "v1_tournaments" ADD COLUMN "planned_fixture_count" INTEGER;

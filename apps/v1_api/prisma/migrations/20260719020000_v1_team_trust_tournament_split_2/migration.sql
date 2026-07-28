-- 팀신뢰점수 소스 분리(Task 6, Critical #2 후속): tournament_manner_score/tournament_review_count와 동일한 이유로
-- trustState/matchCount/sourceLabel(team_match 전용)과 tournament_fixture 전용 상태가 같은 컬럼을 공유하지 않도록 분리한다.
-- recalculateTeamTrust(team_match)와 recalculateTournamentFixtureTeamTrust(tournament_fixture)가 서로 다른
-- 모집단을 집계하게 되면서, 공유 컬럼을 그대로 두면 나중에 실행된 쪽이 먼저 실행된 쪽 값을 덮어써 버리는 문제가 있었다.
ALTER TABLE "v1_team_trust_scores" ADD COLUMN IF NOT EXISTS "tournament_trust_state" "V1TrustState" NOT NULL DEFAULT 'sample';

ALTER TABLE "v1_team_trust_scores" ADD COLUMN IF NOT EXISTS "tournament_match_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "v1_team_trust_scores" ADD COLUMN IF NOT EXISTS "tournament_source_label" TEXT;

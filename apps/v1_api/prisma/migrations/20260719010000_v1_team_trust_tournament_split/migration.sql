-- 팀신뢰점수 소스 분리(Task 6, Step 4a): team_match 전용 mannerScore와
-- tournament_fixture 전용 평점이 같은 컬럼을 놓고 경쟁하지 않도록 별도 컬럼을 둔다.
ALTER TABLE "v1_team_trust_scores" ADD COLUMN IF NOT EXISTS "tournament_manner_score" DECIMAL(4,2);

ALTER TABLE "v1_team_trust_scores" ADD COLUMN IF NOT EXISTS "tournament_review_count" INTEGER NOT NULL DEFAULT 0;

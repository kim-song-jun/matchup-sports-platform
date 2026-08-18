-- 경기 후기 4항목 채점 재설계 (스펙 docs/superpowers/specs/2026-08-17-match-review-redesign-design.md §4).
--
-- additive only: 기존 컬럼/행을 변경하거나 삭제하지 않는다. 기존 후기는 scoring_version 기본값
-- 'legacy_single_rating' 을 그대로 갖고, 새 컬럼은 전부 nullable 이거나 DEFAULT 가 있다.
--
-- Postgres 제약: ALTER TYPE ... ADD VALUE 로 추가한 enum 값은 **같은 트랜잭션 안에서 사용할 수 없다**.
-- 그래서 이 파일에는 'flagged'/'archived' 를 참조하는 DML 을 한 줄도 넣지 않는다. 그 값을 쓰는 코드는
-- 다음 배포(별도 트랜잭션)부터 실행되므로 문제되지 않는다.

ALTER TYPE "V1PostEventReviewStatus" ADD VALUE IF NOT EXISTS 'flagged';
ALTER TYPE "V1PostEventReviewStatus" ADD VALUE IF NOT EXISTS 'archived';

CREATE TYPE "V1PostEventReviewMetric" AS ENUM ('SKILL', 'MANNER', 'PUNCTUALITY', 'SAFETY');
CREATE TYPE "V1PostEventReviewScoringVersion" AS ENUM ('legacy_single_rating', 'four_metric');
CREATE TYPE "V1PostEventReviewRiskRule" AS ENUM ('EXTREME_LOW_OUTLIER', 'UNIFORM_TEAM_EXTREME', 'REPEATED_LOW_PAIR');
CREATE TYPE "V1PostEventReviewRiskFlagStatus" AS ENUM ('pending', 'resolved_active', 'resolved_excluded');

ALTER TABLE "v1_post_event_reviews"
  ADD COLUMN IF NOT EXISTS "scoring_version" "V1PostEventReviewScoringVersion" NOT NULL DEFAULT 'legacy_single_rating';

-- metric_* 는 4항목 개별 평균, tournament_metric_* 는 대회 후기 전용 분리다.
-- 기존 manner_score(종합 rating 평균)와 metric_manner_score(MANNER 항목 단독 평균)는 다른 컬럼이다.
ALTER TABLE "v1_team_trust_scores"
  ADD COLUMN IF NOT EXISTS "metric_skill_score" DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS "metric_punctuality_score" DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS "metric_safety_score" DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS "metric_manner_score" DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS "metric_review_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tournament_metric_skill_score" DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS "tournament_metric_punctuality_score" DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS "tournament_metric_safety_score" DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS "tournament_metric_manner_score" DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS "tournament_metric_review_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "v1_user_reputation_summaries"
  ADD COLUMN IF NOT EXISTS "metric_skill_score" DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS "metric_punctuality_score" DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS "metric_safety_score" DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS "metric_manner_score" DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS "metric_review_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tournament_metric_skill_score" DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS "tournament_metric_punctuality_score" DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS "tournament_metric_safety_score" DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS "tournament_metric_manner_score" DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS "tournament_metric_review_count" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "v1_post_event_review_metric_scores" (
  "id" TEXT NOT NULL,
  "review_id" TEXT NOT NULL,
  "metric" "V1PostEventReviewMetric" NOT NULL,
  "score" INTEGER NOT NULL,
  CONSTRAINT "v1_post_event_review_metric_scores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "v1_post_event_review_metric_scores_review_id_metric_key"
  ON "v1_post_event_review_metric_scores" ("review_id", "metric");

ALTER TABLE "v1_post_event_review_metric_scores"
  ADD CONSTRAINT "v1_post_event_review_metric_scores_review_id_fkey"
  FOREIGN KEY ("review_id") REFERENCES "v1_post_event_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma 스키마는 CHECK 제약을 표현하지 못한다. 이 저장소는 그런 제약을 raw SQL 로 두는 선례가 있다
-- (20260630000000_v1_chat_room_team_target_constraint, 20260716010000_v1_tournament_gender_quota).
-- 점수 범위는 DTO(class-validator)에서도 막지만, DB 레벨에서 한 번 더 잠가 백필/수동 SQL 로 범위를
-- 벗어난 값이 들어오는 경로까지 닫는다.
ALTER TABLE "v1_post_event_review_metric_scores"
  ADD CONSTRAINT "v1_post_event_review_metric_scores_score_range"
  CHECK ("score" BETWEEN 1 AND 5);

CREATE TABLE IF NOT EXISTS "v1_post_event_review_risk_flags" (
  "id" TEXT NOT NULL,
  "group_key" TEXT NOT NULL,
  "review_id" TEXT NOT NULL,
  "rule_code" "V1PostEventReviewRiskRule" NOT NULL,
  "risk_score" INTEGER NOT NULL,
  "signal" JSONB NOT NULL,
  "status" "V1PostEventReviewRiskFlagStatus" NOT NULL DEFAULT 'pending',
  "resolved_by_user_id" TEXT,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "v1_post_event_review_risk_flags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "v1_post_event_review_risk_flags_review_id_rule_code_key"
  ON "v1_post_event_review_risk_flags" ("review_id", "rule_code");
CREATE INDEX IF NOT EXISTS "v1_post_event_review_risk_flags_status_created_at_idx"
  ON "v1_post_event_review_risk_flags" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "v1_post_event_review_risk_flags_group_key_idx"
  ON "v1_post_event_review_risk_flags" ("group_key");

ALTER TABLE "v1_post_event_review_risk_flags"
  ADD CONSTRAINT "v1_post_event_review_risk_flags_review_id_fkey"
  FOREIGN KEY ("review_id") REFERENCES "v1_post_event_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

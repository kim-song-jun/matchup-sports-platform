# 경기 후기(Post-Event Review) 4항목 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대회·팀매치·개인매치 경기 후기(`V1PostEventReview`)를 문서01의 SKILL/MANNER/PUNCTUALITY/SAFETY 4항목 개별 채점으로 재설계하고, 대회 개인 평가에 실출전 게이트를 걸고, `team_match`/`tournament_fixture`에 48시간 평가창을 강제하며, 이상 평가 탐지 3종 규칙 → FLAGGED → 운영 검토 큐를 신설한다. 기존 리뷰 데이터는 파괴하지 않는다.

**Architecture:** `rating`(종합점수) 컬럼은 유지하고(D-4) 4항목 세부 점수는 신규 테이블 `V1PostEventReviewMetricScore`에 완전히 새로 쌓는다(레거시 백필 없음, D-7). 신뢰점수 집계(`V1TeamTrustScore`/`V1UserReputationSummary`)는 기존 `mannerScore`/`tournamentMannerScore` 컬럼을 그대로 두고 `metric*` 컬럼 8개씩을 새로 추가해 항목별 평균을 같은 트랜잭션에서 함께 갱신한다(D-5). 이상 탐지는 신규 cron이 아니라 기존 outbox+worker 패턴(`v1-game-operations-worker.service.ts`)에 핸들러를 등록하는 방식으로 재사용한다(D-8). 마감 시각은 저장하지 않고 매 요청 시점에 `anchor + 48h`로 계산한다(D-6) — 정정 승인 시 앵커가 갱신되면 마감도 부작용으로 함께 연장된다.

**Tech Stack:** NestJS 11 + Prisma 6 + PostgreSQL 16 (apps/v1_api), Next.js 16 App Router (apps/v1_web), Jest 30 (unit/integration), Vitest (web)

**Spec:** `docs/superpowers/specs/2026-08-17-match-review-redesign-design.md`

**Worktree:** `.claude/worktrees/league-format`, 브랜치 `spec/v1-review-redesign-refresh`, base `origin/dev@204eb246`

> 이 계획은 리그전 스펙(`docs/superpowers/specs/2026-08-17-tournament-league-format-design.md`, 계획 `docs/superpowers/plans/2026-08-17-tournament-league-format.md`)과 **병행 진행 가능**하다 — 스펙 §1.3이 두 작업 모두 `apps/v1_api/src/reviews/` 대 `apps/v1_api/src/tournaments/`·`competition-standings.ts` 등으로 파일 충돌이 없음을 확인했다. 다만 `fix/v1-goal-event-backfill-idempotency` 브랜치가 이 계획의 Task 4(48h 앵커)가 의존하는 `resolveTournamentFixtureOfficialTimestamp()`를 대폭 수정 중이므로, Task 4 착수 전 그 브랜치의 머지 여부를 재확인한다(스펙 §1.3·§13).

## Global Constraints

- **활성 스택은 `apps/v1_api` / `apps/v1_web`다.** `apps/api` / `apps/web`(구 스택)은 이 계획에서 절대 건드리지 않는다.
- **schema.prisma를 고치면 CI `V1 migration replay + drift gate`가 `SOURCE_SNAPSHOT_DRIFT`로 실패한다.** `apps/v1_api/test/fixtures/game-schema.fixture.ts`의 `gameSchemaSourceManifest.schema`를 `shasum -a 256 prisma/schema.prisma` 결과로 재핀하고 **재핀 근거 주석을 덧붙여야 한다**(Task 1). 스키마 변경은 **마이그레이션 1개**로 묶어 재핀도 1회로 끝낸다(D-4/D-5/D-9/§4.6/§12가 모두 같은 마이그레이션에 들어간다).
- **인덱스/제약 이름은 63자 한도.** PostgreSQL이 넘는 이름을 조용히 잘라 Prisma가 기대하는 이름과 어긋나면 `prisma migrate diff`가 drift로 잡는다 — 이 저장소에서 실제로 겪은 사고다. `map: "..."`로 명시적 이름을 준 모든 신규 제약·인덱스는 작성 직후 문자수를 센다(Task 1 Step 7에 체크리스트 포함).
- **worktree에는 node_modules가 없고 `pnpm`도 PATH에 없다.** `./node_modules/.bin/jest`, `./node_modules/.bin/tsc`를 직접 호출한다:
  ```bash
  cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns <패턴>
  cd apps/v1_api && ./node_modules/.bin/tsc --noEmit
  ```
- **이 환경에는 Teameet v1 PostgreSQL이 없다.** DB가 필요한 스텝(마이그레이션 재생, 통합 테스트 실행)은 **작성까지만 하고 실행하지 않는다** — CI가 실제로 검증한다. 대신 `schema.prisma`와 `migration.sql`을 한 줄씩 눈으로 대조한다.
- **공유 Prisma client가 stale하다. `prisma generate` 금지.** 신규 모델(`V1PostEventReviewMetricScore`, `V1PostEventReviewRiskFlag`) 타입이 유닛 테스트 컴파일에서 안 잡히면, 그 테스트는 diagnostics를 끈 임시 `tsconfig`/`ts-jest` 설정으로 돌리되 **"이 우회가 타입 오류를 가릴 수 있다"는 경고를 커밋 메시지·PR 설명에 남긴다.** Prisma `Json` 컬럼(`V1PostEventReviewRiskFlag.signal`) 픽스처는 `Prisma.JsonValue`로 타입을 맞춘다.
- **FK onDelete를 확인하고 삭제 경로를 설계한다.** `V1PostEventReviewMetricScore.reviewId`/`V1PostEventReviewRiskFlag.reviewId`는 `onDelete: Cascade`로 설계한다(리뷰 삭제 시 항께 정리) — `Restrict`로 잘못 설정하면 기존 리뷰 hard-delete 경로가 있을 경우 500이 난다(리그전 작업에서 실제로 겪은 클래스의 사고). 이 도메인엔 hard-delete 리뷰 경로가 없음을 확인했다(`grep -n "v1PostEventReview.delete"` → 0건, 2026-08-18 재확인) — Cascade가 안전하다.
- **에러는 해요체 / DOMAIN_CODE.** 신규 코드: `NOT_ACTUAL_PARTICIPANT`(403), `REVIEW_WINDOW_CLOSED`(410) — 스펙 §9.2 그대로.
- **숫자 기본값은 `??`를 쓴다.**
- **커밋은 pathspec으로 내 파일만** + 직후 `git show --stat HEAD` 검증.
- **base는 `dev`. dev 머지 = alpha 즉시 실배포.** UI 검증은 로컬 next 서버가 아니라 alpha 배포 후 스크린샷(390/768/1440)으로 한다.
- **레거시 클라이언트 호환 창(스펙 §12.5·§14)은 미결이다** — Task 5에서 구체적으로 다시 다룬다. 이 계획은 배포 순서(백엔드 직후 프론트 배포)를 전제로 "즉시 breaking" 경로를 기본으로 작성하되, 사용자가 이중 지원 기간을 선택하면 Task 5 Step 3의 대안 분기를 따른다.
- **이상 탐지 자동화 수준(관찰 모드 vs 자동 FLAGGED 전이, 스펙 §14)도 미결이다** — Task 10에서 `DISABLE_REVIEW_RISK_SWEEP` 환경변수(레포 기존 `DISABLE_MARKETPLACE_CRON`/`DISABLE_OPS_ALERT_CRON` 선례와 동일 패턴)로 배포는 가능하게 하되, "판정만 기록하고 status는 안 바꾸는 관찰 모드"는 사용자 결정 후 별도 플래그로 추가한다(Task 10에 정확한 분기 지점 명시).

---

## File Structure

### PR 1 — 스키마 + 실출전 게이트 + 48시간 평가창

| 파일 | 책임 |
|---|---|
| `apps/v1_api/prisma/schema.prisma` (수정) | enum 6종 + 컬럼 21개 + 모델 2개 추가 |
| `apps/v1_api/prisma/migrations/20260817010000_v1_post_event_review_scoring_redesign/migration.sql` (신규) | additive 마이그레이션 |
| `apps/v1_api/test/fixtures/game-schema.fixture.ts` (수정) | drift gate 해시 재핀 |
| `apps/v1_api/src/reviews/tournament-fixture-appearance.ts` (신규) | 실출전(appeared participant) 판정 헬퍼 |
| `apps/v1_api/src/reviews/tournament-fixture-appearance.spec.ts` (신규) | 헬퍼 단위 테스트 |
| `apps/v1_api/src/reviews/tournament-fixture-review-mappers.ts` (수정) | `tournamentFixtureSelect()`에 `game.id`/`currentOfficialRevision.id` 추가 |
| `apps/v1_api/src/reviews/tournament-fixture-reviews.service.ts` (수정) | 실출전 게이트 적용, 48h 마감 체크 |
| `apps/v1_api/src/reviews/review-deadline.ts` (신규) | 48h 마감 공유 순수함수 |
| `apps/v1_api/src/reviews/review-deadline.spec.ts` (신규) | 마감 헬퍼 단위 테스트 |
| `apps/v1_api/src/reviews/reviews.service.ts` (수정) | 48h 체크(team_match), scores 저장, metric 신뢰점수 갱신, advisory lock |
| `apps/v1_api/src/reviews/dto/submit-review.dto.ts` (수정) | `rating`+`tagCodes` → `scores` 4항목 (breaking) |
| `apps/v1_api/src/reviews/dto/review-score.dto.ts` (신규) | nested scores DTO |
| `apps/v1_api/src/reviews/tournament-fixture-review-reputation.ts` (수정) | metric 컬럼 갱신 + advisory lock |
| `apps/v1_api/src/reviews/tournament-fixture-review-trust.ts` (수정) | metric 컬럼 갱신 + advisory lock |
| `apps/v1_api/src/reviews/reviews.service.spec.ts`, `tournament-fixture-reviews.service.spec.ts`, `tournament-fixture-review-reputation.spec.ts`, `tournament-fixture-review-trust.spec.ts` (수정) | 회귀 + 신규 케이스 |

### PR 2 — 이상 탐지 + FLAGGED 운영 큐

| 파일 | 책임 |
|---|---|
| `apps/v1_api/src/reviews/review-risk-rules.ts` (신규) | 이상 탐지 3규칙 순수함수 |
| `apps/v1_api/src/reviews/review-risk-rules.spec.ts` (신규) | 규칙별 positive/negative 테스트 |
| `apps/v1_api/src/games/games.service.ts` (수정) | `GamesOutboxEventType`에 `REVIEW_RISK_SWEEP_DUE` 추가 + team_match officialize 훅 |
| `apps/v1_api/src/tournament-operations/results/tournament-result-review.service.ts` (수정) | tournament_fixture officialize 훅 + VOID→archived 훅 |
| `apps/v1_api/src/reviews/review-risk-sweep.service.ts` (신규) | outbox 핸들러 — 판정 + flagged 전이 |
| `apps/v1_api/src/reviews/review-risk-sweep.service.spec.ts` (신규) | 통합형 유닛 테스트(트랜잭션 mock) |
| `apps/v1_api/src/jobs/v1-game-operations-worker.service.ts` (수정) | `registerHandler('REVIEW_RISK_SWEEP_DUE', ...)` 등록 |
| `apps/v1_api/src/reviews/admin/review-flags.controller.ts` (신규) | `GET/POST /admin/reviews/flags*` |
| `apps/v1_api/src/reviews/admin/review-flags-admin.service.ts` (신규) | groupKey 단위 resolve |
| `apps/v1_api/src/reviews/dto/resolve-review-flags.dto.ts` (신규) | resolve 요청 DTO |
| `apps/v1_api/src/reviews/reviews.module.ts` (수정) | 신규 provider/controller 등록 |

### PR 3 — 데이터 이관 리포트 + 프론트

| 파일 | 책임 |
|---|---|
| `apps/v1_api/scripts/review-legacy-migration-report.ts` (신규) | 읽기 전용 건수 리포트(스펙 §8) |
| `apps/v1_web/src/components/reviews/reviews-api-clients.tsx` (수정) | 제출 폼을 4항목 슬라이더로 전환 |
| `apps/v1_web/src/components/reviews/reviews.types.ts` (수정) | `ReviewTargetDraft` → `scores` |
| `apps/v1_web/src/components/reviews/reviews-summary-dashboard.tsx` (수정) | 항목별 막대 + legacy 배지 |
| `apps/v1_web/src/types/api.ts` (수정) | `scores`/`compositeScore`/`scoringVersion` 응답 타입 |
| `apps/v1_web/src/app/admin/reviews/flags/page.tsx` (신규) | 운영 FLAGGED 큐 화면 |
| `apps/v1_web/src/components/admin/review-flags-table.tsx` (신규) | groupKey 단위 resolve UI |

---

# PR 1 — 스키마 + 실출전 게이트 + 48시간 평가창

## Task 1: Prisma 스키마 + 마이그레이션 + drift gate 재핀

**Files:**
- Modify: `apps/v1_api/prisma/schema.prisma`
- Create: `apps/v1_api/prisma/migrations/20260817010000_v1_post_event_review_scoring_redesign/migration.sql`
- Modify: `apps/v1_api/test/fixtures/game-schema.fixture.ts`

**Interfaces:**
- Produces: enum `V1PostEventReviewMetric`/`V1PostEventReviewScoringVersion`/`V1PostEventReviewRiskRule`/`V1PostEventReviewRiskFlagStatus`, `V1PostEventReviewStatus`에 `flagged`/`archived` 추가, 모델 `V1PostEventReviewMetricScore`/`V1PostEventReviewRiskFlag`, `V1PostEventReview.scoringVersion`, `V1TeamTrustScore`/`V1UserReputationSummary`에 `metric*` 컬럼 10개씩

> 근거: 스펙 §4 전체(schema.prisma:195-210, 1030-1057, 1352-1439 — 이번 조사에서 실측 확인). Postgres 제약(`ALTER TYPE ... ADD VALUE`는 같은 트랜잭션 내 즉시 사용 불가)은 마이그레이션이 자동으로 단일 트랜잭션이 아니게 여러 statement로 쪼개져 있어도 **DML을 이 파일에 넣지 않는 것**으로 우회한다 — 신규 enum 값을 쓰는 코드는 다음 배포(별도 트랜잭션)부터 실행되므로 문제 없다.

- [ ] **Step 1: `V1PostEventReviewStatus`에 값 2개를 추가한다**

`schema.prisma:206-210` 근처:

```prisma
enum V1PostEventReviewStatus {
  submitted
  hidden
  removed
  flagged   // NEW — 이상 탐지 판정
  archived  // NEW — 경기 무효(VOID) 시
}
```

- [ ] **Step 2: 신규 enum 4개를 추가한다**

`V1PostEventReviewTargetType` 블록 뒤, `V1PostEventReviewStatus` 앞에 삽입:

```prisma
enum V1PostEventReviewMetric {
  SKILL
  MANNER
  PUNCTUALITY
  SAFETY
}

enum V1PostEventReviewScoringVersion {
  legacy_single_rating
  four_metric
}

enum V1PostEventReviewRiskRule {
  EXTREME_LOW_OUTLIER
  UNIFORM_TEAM_EXTREME
  REPEATED_LOW_PAIR
}

enum V1PostEventReviewRiskFlagStatus {
  pending
  resolved_active
  resolved_excluded
}
```

- [ ] **Step 3: `V1PostEventReview`에 `scoringVersion` + relation 2개를 추가한다**

`model V1PostEventReview`(`schema.prisma:1378`)의 `updatedAt` 필드 다음 줄:

```prisma
  scoringVersion V1PostEventReviewScoringVersion @default(legacy_single_rating) @map("scoring_version")
```

`tags` relation 다음 줄:

```prisma
  metricScores V1PostEventReviewMetricScore[]
  riskFlags    V1PostEventReviewRiskFlag[]
```

- [ ] **Step 4: `V1PostEventReviewMetricScore` 모델을 추가한다**

`model V1PostEventReviewTag`(`schema.prisma:1427`) 블록 바로 다음:

```prisma
model V1PostEventReviewMetricScore {
  id       String                  @id @default(uuid())
  reviewId String                  @map("review_id")
  metric   V1PostEventReviewMetric
  score    Int

  review V1PostEventReview @relation(fields: [reviewId], references: [id], onDelete: Cascade)

  @@unique([reviewId, metric])
  @@map("v1_post_event_review_metric_scores")
}
```

- [ ] **Step 5: `V1TeamTrustScore`/`V1UserReputationSummary`에 `metric*` 컬럼을 추가한다**

`model V1UserReputationSummary`(`schema.prisma:1030`)의 `updatedAt` 필드 앞:

```prisma
  metricSkillScore       Decimal? @map("metric_skill_score") @db.Decimal(4, 2)
  metricPunctualityScore Decimal? @map("metric_punctuality_score") @db.Decimal(4, 2)
  metricSafetyScore      Decimal? @map("metric_safety_score") @db.Decimal(4, 2)
  metricMannerScore      Decimal? @map("metric_manner_score") @db.Decimal(4, 2)
  metricReviewCount      Int      @default(0) @map("metric_review_count")
  tournamentMetricSkillScore       Decimal? @map("tournament_metric_skill_score") @db.Decimal(4, 2)
  tournamentMetricPunctualityScore Decimal? @map("tournament_metric_punctuality_score") @db.Decimal(4, 2)
  tournamentMetricSafetyScore      Decimal? @map("tournament_metric_safety_score") @db.Decimal(4, 2)
  tournamentMetricMannerScore      Decimal? @map("tournament_metric_manner_score") @db.Decimal(4, 2)
  tournamentMetricReviewCount      Int      @default(0) @map("tournament_metric_review_count")
```

`model V1TeamTrustScore`(`schema.prisma:1352`)의 `updatedAt` 필드 앞에 **같은 10줄**을 추가한다(컬럼명·`@map` 동일 — 두 모델이 항상 같은 패턴을 공유해 온 선례를 따른다).

> `metricMannerScore`(신규, MANNER 항목 단독 평균)와 기존 `mannerScore`(종합점수, `rating` 기반)는 이름이 비슷하지만 **다른 컬럼**이다 — 절대 하나로 합치지 않는다(스펙 §4.5).

- [ ] **Step 6: `V1PostEventReviewRiskFlag` 모델을 추가한다**

`model V1PostEventReviewMetricScore` 블록 다음:

```prisma
model V1PostEventReviewRiskFlag {
  id               String                         @id @default(uuid())
  groupKey         String                         @map("group_key")
  reviewId         String                         @map("review_id")
  ruleCode         V1PostEventReviewRiskRule       @map("rule_code")
  riskScore        Int                            @map("risk_score")
  signal           Json
  status           V1PostEventReviewRiskFlagStatus @default(pending)
  resolvedByUserId String?                         @map("resolved_by_user_id")
  resolvedAt       DateTime?                       @map("resolved_at")
  createdAt        DateTime                        @default(now()) @map("created_at")

  review V1PostEventReview @relation(fields: [reviewId], references: [id], onDelete: Cascade)

  @@unique([reviewId, ruleCode])
  @@index([status, createdAt])
  @@index([groupKey])
  @@map("v1_post_event_review_risk_flags")
}
```

- [ ] **Step 7: 제약·인덱스 이름 63자 한도를 확인한다**

Global Constraints의 63자 규칙에 따라 이번에 추가한 이름 전부를 센다:
- `v1_post_event_review_metric_scores` (35자, 테이블명 — OK)
- `v1_post_event_review_risk_flags` (32자 — OK)
- 암묵적 unique/index 이름(Prisma가 `<table>_<cols>_key`/`_idx`로 자동 생성)은 위 두 테이블명이 짧아 63자를 넘길 조합이 없다 — `reviewId_ruleCode` unique의 자동 이름 `v1_post_event_review_risk_flags_review_id_rule_code_key`는 **56자**로 안전.
- `V1TeamTrustScore`/`V1UserReputationSummary`의 신규 컬럼은 인덱스·제약을 새로 만들지 않으므로(단순 컬럼 추가) 해당 없음.

- [ ] **Step 8: 마이그레이션 SQL을 작성한다**

`apps/v1_api/prisma/migrations/20260817010000_v1_post_event_review_scoring_redesign/migration.sql`:

```sql
-- 경기 후기 4항목 채점 재설계: additive only. 기존 행/컬럼을 변경하거나 삭제하지 않는다.
-- ALTER TYPE ... ADD VALUE 는 이 트랜잭션 밖에서만 사용 가능하므로, 이 파일 안에서는
-- 신규 enum 값을 참조하는 DML을 절대 넣지 않는다(Postgres 제약).

ALTER TYPE "V1PostEventReviewStatus" ADD VALUE IF NOT EXISTS 'flagged';
ALTER TYPE "V1PostEventReviewStatus" ADD VALUE IF NOT EXISTS 'archived';

CREATE TYPE "V1PostEventReviewMetric" AS ENUM ('SKILL', 'MANNER', 'PUNCTUALITY', 'SAFETY');
CREATE TYPE "V1PostEventReviewScoringVersion" AS ENUM ('legacy_single_rating', 'four_metric');
CREATE TYPE "V1PostEventReviewRiskRule" AS ENUM ('EXTREME_LOW_OUTLIER', 'UNIFORM_TEAM_EXTREME', 'REPEATED_LOW_PAIR');
CREATE TYPE "V1PostEventReviewRiskFlagStatus" AS ENUM ('pending', 'resolved_active', 'resolved_excluded');

ALTER TABLE "v1_post_event_reviews"
  ADD COLUMN IF NOT EXISTS "scoring_version" "V1PostEventReviewScoringVersion" NOT NULL DEFAULT 'legacy_single_rating';

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
```

- [ ] **Step 9: 마이그레이션 재생 확인 — ⚠️ 이 환경에서는 실행 보류**

> Teameet v1 PostgreSQL이 이 환경에 없다. **아래 명령을 실행하지 말고**, `schema.prisma`와 `migration.sql`을 컬럼·타입·NOT NULL·DEFAULT·unique·FK 단위로 한 줄씩 대조해 일치하는지 확인하고 넘어간다. 실제 재생 검증은 CI가 수행한다.

```bash
cd apps/v1_api && npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$SHADOW_DATABASE_URL" \
  --exit-code
```

- [ ] **Step 10: drift gate 해시를 재핀한다**

Run: `cd apps/v1_api && shasum -a 256 prisma/schema.prisma`

`apps/v1_api/test/fixtures/game-schema.fixture.ts`의 `gameSchemaSourceManifest.schema` 값을 결과로 교체하고 바로 위에 근거 주석을 덧붙인다:

```ts
// 2026-08-17 재핀: 경기 후기 4항목 채점 재설계 — V1PostEventReviewMetricScore/
// V1PostEventReviewRiskFlag 신규 테이블, V1PostEventReview.scoringVersion,
// V1TeamTrustScore/V1UserReputationSummary metric_* 컬럼 10개씩 추가.
// 게임 도메인(V1Game*) 모델은 건드리지 않았고 전부 additive다.
// 뒷받침 마이그레이션: 20260817010000_v1_post_event_review_scoring_redesign.
```

`migration` 핀 값은 바꾸지 않는다.

- [ ] **Step 11: drift gate가 통과하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns game-schema`
Expected: PASS — `SOURCE_SNAPSHOT_DRIFT` 없음

- [ ] **Step 12: 커밋한다**

```bash
git add apps/v1_api/prisma/schema.prisma \
        apps/v1_api/prisma/migrations/20260817010000_v1_post_event_review_scoring_redesign/migration.sql \
        apps/v1_api/test/fixtures/game-schema.fixture.ts
git commit -m "feat(db): 경기 후기 4항목 채점 스키마 추가"
git show --stat HEAD
```

---

## Task 2: 실출전(appeared participant) 판정 헬퍼 + select 확장

**Files:**
- Create: `apps/v1_api/src/reviews/tournament-fixture-appearance.ts`
- Create: `apps/v1_api/src/reviews/tournament-fixture-appearance.spec.ts`
- Modify: `apps/v1_api/src/reviews/tournament-fixture-review-mappers.ts:28-51`

**Interfaces:**
- Consumes: `V1GameResultParticipant`(`resultRevisionId`, `participantId`, `sideId`), `V1GameParticipant`(`id`, `userId`, `sideId`), `V1GameSide`(`sideKey`: `HOME`|`AWAY`) — 전부 기존 모델, 스키마 변경 없음
- Produces: `appearedUserIdsBySide(prisma, fixture): Promise<{ home: Set<string>; away: Set<string> } | null>`

> 근거: 스펙 §5.1·§5.2. `tournamentFixtureSelect()`(`tournament-fixture-review-mappers.ts:28-51`, 실측 확인)의 현재 `game` select는 `currentOfficialRevision: { select: { state: true, officialAt: true } }`만 골라 `game.id`/`currentOfficialRevision.id`가 빠져 있다 — 이 스텝이 그 select를 확장하는 선행 작업이다.

- [ ] **Step 1: `tournamentFixtureSelect()`의 `game` select를 확장한다**

`tournament-fixture-review-mappers.ts:37` 근처(주석 "R3 §4-3단계: 신규 경로..." 다음 줄):

```diff
-    game: { select: { currentOfficialRevision: { select: { state: true, officialAt: true } } } },
+    // §5.1(실출전 게이트)이 V1GameResultParticipant를 조회하려면 game.id와
+    // currentOfficialRevision.id가 필요하다 — 이 두 필드는 이 select 확장 전까지
+    // 골라지지 않았다(appearedUserIdsBySide()가 null 폴백하는 이유였다).
+    game: {
+      select: {
+        id: true,
+        currentOfficialRevision: { select: { id: true, state: true, officialAt: true } },
+      },
+    },
```

`TournamentFixture` 타입은 `Prisma.V1TournamentFixtureGetPayload<{ select: ReturnType<typeof tournamentFixtureSelect> }>`로 자동 파생되므로 별도 타입 수정이 필요 없다.

- [ ] **Step 2: 실패하는 테스트를 작성한다**

`apps/v1_api/src/reviews/tournament-fixture-appearance.spec.ts`:

```ts
import { appearedUserIdsBySide, type AppearanceGamePrismaLike } from './tournament-fixture-appearance';

function fixtureWith(game: { id: string; currentOfficialRevision: { id: string; state: string } | null } | null) {
  return { game };
}

describe('appearedUserIdsBySide', () => {
  it('OFFICIAL 리비전이 있으면 홈/원정 실출전 userId 집합을 반환한다', async () => {
    const prisma: AppearanceGamePrismaLike = {
      v1GameResultParticipant: {
        findMany: jest.fn().mockResolvedValue([
          { participantId: 'p1' },
          { participantId: 'p2' },
        ]),
      },
      v1GameParticipant: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'p1', userId: 'u1', sideId: 's-home' },
          { id: 'p2', userId: 'u2', sideId: 's-away' },
        ]),
      },
      v1GameSide: {
        findMany: jest.fn().mockResolvedValue([
          { id: 's-home', sideKey: 'HOME' },
          { id: 's-away', sideKey: 'AWAY' },
        ]),
      },
    } as unknown as AppearanceGamePrismaLike;

    const result = await appearedUserIdsBySide(
      prisma,
      fixtureWith({ id: 'g1', currentOfficialRevision: { id: 'rev1', state: 'OFFICIAL' } }),
    );
    expect(result).toEqual({ home: new Set(['u1']), away: new Set(['u2']) });
  });

  it('userId가 null인 참가자는 집합에서 제외한다', async () => {
    const prisma = {
      v1GameResultParticipant: { findMany: jest.fn().mockResolvedValue([{ participantId: 'p1' }]) },
      v1GameParticipant: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', userId: null, sideId: 's-home' }]) },
      v1GameSide: { findMany: jest.fn().mockResolvedValue([{ id: 's-home', sideKey: 'HOME' }]) },
    } as unknown as AppearanceGamePrismaLike;

    const result = await appearedUserIdsBySide(
      prisma,
      fixtureWith({ id: 'g1', currentOfficialRevision: { id: 'rev1', state: 'OFFICIAL' } }),
    );
    expect(result).toEqual({ home: new Set(), away: new Set() });
  });

  it('game이 없으면(Game 미연결) null을 반환한다(폴백 신호)', async () => {
    const prisma = {} as AppearanceGamePrismaLike;
    const result = await appearedUserIdsBySide(prisma, fixtureWith(null));
    expect(result).toBeNull();
  });

  it('currentOfficialRevision이 없으면 null을 반환한다', async () => {
    const prisma = {} as AppearanceGamePrismaLike;
    const result = await appearedUserIdsBySide(prisma, fixtureWith({ id: 'g1', currentOfficialRevision: null }));
    expect(result).toBeNull();
  });

  it('리비전 state가 OFFICIAL이 아니면 null을 반환한다(예: VOID)', async () => {
    const prisma = {} as AppearanceGamePrismaLike;
    const result = await appearedUserIdsBySide(
      prisma,
      fixtureWith({ id: 'g1', currentOfficialRevision: { id: 'rev1', state: 'VOID' } }),
    );
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns tournament-fixture-appearance`
Expected: FAIL — 모듈 없음

- [ ] **Step 4: 헬퍼를 구현한다**

`apps/v1_api/src/reviews/tournament-fixture-appearance.ts`:

```ts
import type { PrismaService } from '../prisma/prisma.service';

export type AppearanceGamePrismaLike = Pick<
  PrismaService,
  'v1GameResultParticipant' | 'v1GameParticipant' | 'v1GameSide'
>;

type AppearanceFixture = {
  game: { id: string; currentOfficialRevision: { id: string; state: string } | null } | null;
};

/**
 * 대회 경기의 실제 출전(appeared) 사용자 집합을 홈/원정으로 나눠 반환한다.
 *
 * 판정 순서: game.currentOfficialRevision.state === 'OFFICIAL' 일 때만 진행한다 —
 * 스펙 §5.1. Game 미연결이거나 OFFICIAL 리비전이 없으면(VOID로 넘어간 경우 포함) null을
 * 반환해 호출자가 §5.2의 폴백(등록 로스터 전체)으로 넘어가게 한다.
 *
 * V1GameParticipant.userId가 null인 행(신원 미연결 라인업, 예: 게스트)은 판정에서 제외한다.
 */
export async function appearedUserIdsBySide(
  prisma: AppearanceGamePrismaLike,
  fixture: AppearanceFixture,
): Promise<{ home: Set<string>; away: Set<string> } | null> {
  const revision = fixture.game?.currentOfficialRevision;
  if (!fixture.game || !revision || revision.state !== 'OFFICIAL') return null;

  const resultParticipants = await prisma.v1GameResultParticipant.findMany({
    where: { resultRevisionId: revision.id },
    select: { participantId: true },
  });
  if (resultParticipants.length === 0) return { home: new Set(), away: new Set() };

  const participantIds = resultParticipants.map((row) => row.participantId);
  const participants = await prisma.v1GameParticipant.findMany({
    where: { id: { in: participantIds } },
    select: { id: true, userId: true, sideId: true },
  });
  const sideIds = [...new Set(participants.map((row) => row.sideId))];
  const sides = await prisma.v1GameSide.findMany({
    where: { id: { in: sideIds } },
    select: { id: true, sideKey: true },
  });
  const sideKeyById = new Map(sides.map((side) => [side.id, side.sideKey]));

  const home = new Set<string>();
  const away = new Set<string>();
  for (const participant of participants) {
    if (!participant.userId) continue;
    const sideKey = sideKeyById.get(participant.sideId);
    if (sideKey === 'HOME') home.add(participant.userId);
    else if (sideKey === 'AWAY') away.add(participant.userId);
  }
  return { home, away };
}
```

> **미확인**: `V1GameSide` 조회를 별도 `findMany`로 추가했다 — 스펙 §5.1의 서명은 `V1GameSide.sideKey`를 언급하지만 별도 쿼리인지, `V1GameParticipant`에 조인해서 가져올지는 스펙이 명시하지 않았다. `V1GameParticipant`에는 `side` relation이 없고 `sideId`만 있음을 스키마에서 확인했으므로(`schema.prisma:2656-2686`) 별도 쿼리가 맞다 — 3-쿼리 구성(`v1GameResultParticipant` → `v1GameParticipant` → `v1GameSide`)으로 구현했다. N+1은 아니다(fixture 1건당 정확히 3쿼리, 배치화 불필요 — 이 헬퍼는 리뷰 작성/조회 시 fixture 1건 단위로만 호출된다).

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns tournament-fixture-appearance`
Expected: PASS (5 tests)

- [ ] **Step 6: 타입 체크**

Run: `cd apps/v1_api && ./node_modules/.bin/tsc --noEmit`
Expected: 에러 0건(`v1GameSide`가 `PrismaService`에 이미 존재하는 모델인지 여기서 확인된다 — 없다면 Step 4에서 실제 모델 프로퍼티명을 재확인한다)

- [ ] **Step 7: 커밋한다**

```bash
git add apps/v1_api/src/reviews/tournament-fixture-appearance.ts \
        apps/v1_api/src/reviews/tournament-fixture-appearance.spec.ts \
        apps/v1_api/src/reviews/tournament-fixture-review-mappers.ts
git commit -m "feat(reviews): 대회 경기 실출전 판정 헬퍼 추가"
git show --stat HEAD
```

---

## Task 3: `tournament_fixture` 개인 평가에 실출전 게이트 적용

**Files:**
- Modify: `apps/v1_api/src/reviews/tournament-fixture-reviews.service.ts:268-316` (`reviewContexts`), `:222-256`(`submitPlayerReview`)
- Modify: `apps/v1_api/src/reviews/tournament-fixture-reviews.service.spec.ts`

**Interfaces:**
- Consumes: `appearedUserIdsBySide`(Task 2)
- Produces: `NOT_ACTUAL_PARTICIPANT`(403, 신규)

> 근거: 스펙 §5.4. `reviewContexts()`(실측: `tournament-fixture-reviews.service.ts:268-316`)가 `this.opponentRoster(targetTeam.registrationId, userId)`로 로스터를 가져오고, `submitPlayerReview()`(`:222-256`)가 `context.roster.some(...)`로 대상 검증한다.

- [ ] **Step 1: 회귀 게이트 — 기존 테스트가 통과하는지 먼저 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns tournament-fixture-reviews.service`
Expected: PASS(기준선)

- [ ] **Step 2: 실패하는 테스트를 추가한다**

`tournament-fixture-reviews.service.spec.ts`에 추가(기존 파일의 fixture/mock 헬퍼 이름은 파일을 열어 확인 후 맞춘다):

```ts
it('실출전 데이터가 있으면(OFFICIAL 리비전) 로스터를 실출전 userId로 좁힌다', async () => {
  // arrange: fixture.game.currentOfficialRevision.state = 'OFFICIAL',
  // opponentRoster()가 [userA, userB]를 반환하지만 appearedUserIdsBySide()는 { away: Set(['userA']) }만 반환
  // act: submitPlayerReview(targetUserId: userB)
  // assert: NOT_ACTUAL_PARTICIPANT(403) — userB는 로스터엔 있지만 실출전이 아니다
});

it('작성자 본인도 자기 사이드의 실출전 집합에 없으면 NOT_ACTUAL_PARTICIPANT를 던진다', async () => {
  // arrange: 작성자가 홈팀 멤버지만 appearedUserIdsBySide().home에 작성자 userId가 없음
  // act: submitPlayerReview(작성자, targetUserId: 상대 실출전 선수)
  // assert: 403 NOT_ACTUAL_PARTICIPANT
});

it('appearedUserIdsBySide가 null이면(Game 백필 전) 현행대로 등록 로스터 전체를 대상으로 유지한다', async () => {
  // arrange: fixture.game이 null 또는 currentOfficialRevision.state !== 'OFFICIAL'
  // act: reviewContexts() 호출
  // assert: context.roster === opponentRoster() 원본(필터링 안 됨) — 회귀 없음
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns tournament-fixture-reviews.service`
Expected: 신규 3건 FAIL, 기존 케이스는 여전히 PASS

- [ ] **Step 4: `reviewContexts()`에 실출전 필터를 적용한다**

`tournament-fixture-reviews.service.ts` 상단 import에 추가:

```ts
import { appearedUserIdsBySide } from './tournament-fixture-appearance';
```

`reviewContexts()`(`:268-316`) 안, `roster`를 얻는 지점을 아래처럼 바꾼다(현재는 `this.opponentRoster(targetTeam.registrationId, userId)`를 그대로 `roster`로 쓴다):

```ts
const appeared = await appearedUserIdsBySide(this.prisma, fixture);
const appearedSideIds = appeared
  ? reviewerTeam.teamId === teams.home.teamId
    ? appeared.away  // 내가 홈이면 상대는 원정
    : appeared.home
  : null;
const roster = appearedSideIds
  ? fullRoster.filter((player) => appearedSideIds.has(player.userId))
  : fullRoster; // 폴백: appeared가 null이면 현행(등록 로스터 전체) 유지 — §5.2
```

> `fullRoster`는 기존 `this.opponentRoster(...)` 반환값을 그대로 받는 변수명으로, 실제 변수명은 파일을 열어 확인해 맞춘다. **홈/원정 반전 주의**: 내가 홈팀이면 내가 평가할 상대는 원정팀이므로 `appeared.away`를 써야 한다(반대가 아니다) — Step 2의 테스트가 이 방향을 검증한다.

- [ ] **Step 5: 작성자 본인의 실출전 여부도 확인한다**

`submitPlayerReview()`(`:222-256`) 안, `context.roster.some(...)` 검증 다음(또는 그 앞)에 추가:

```ts
if (context.appearedReviewerSide && !context.appearedReviewerSide.has(user.id)) {
  throw forbidden('NOT_ACTUAL_PARTICIPANT', '실제로 출전한 선수만 상대 선수를 평가할 수 있어요.');
}
```

`context.appearedReviewerSide`는 Step 4에서 `reviewContexts()`가 반환하는 `ReviewContext` 객체에 새 필드로 실어 보낸다 — 작성자 자신의 사이드(홈이면 `appeared.home`, 원정이면 `appeared.away`) 집합을 그대로 담는다. `appeared`가 null(폴백)이면 이 필드도 null로 두어 검증을 건너뛴다.

- [ ] **Step 6: `forbidden` import를 확인한다**

`tournament-fixture-reviews.service.ts`가 이미 `forbidden`을 쓰고 있는지(`throw forbidden('TARGET_NOT_REVIEWABLE', ...)` 기존 사용례가 있음) 확인 — 없으면 `tournament-fixture-review-mappers.ts`에서 import한다(기존 파일의 다른 `forbidden` 호출부와 같은 import 경로를 그대로 따른다).

- [ ] **Step 7: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns tournament-fixture-reviews.service`
Expected: PASS — 신규 3건 + 기존 전부(회귀 0건)

- [ ] **Step 8: 타입 체크**

Run: `cd apps/v1_api && ./node_modules/.bin/tsc --noEmit`

- [ ] **Step 9: 커밋한다**

```bash
git add apps/v1_api/src/reviews/tournament-fixture-reviews.service.ts \
        apps/v1_api/src/reviews/tournament-fixture-reviews.service.spec.ts
git commit -m "feat(reviews): 대회 개인 후기에 실출전 게이트 적용"
git show --stat HEAD
```

---

## Task 4: 48시간 평가창 공유 헬퍼 + `team_match`/`tournament_fixture` 적용

**Files:**
- Create: `apps/v1_api/src/reviews/review-deadline.ts`
- Create: `apps/v1_api/src/reviews/review-deadline.spec.ts`
- Modify: `apps/v1_api/src/reviews/reviews.service.ts:569-586`(`teamMatchSourceContext`)
- Modify: `apps/v1_api/src/reviews/tournament-fixture-reviews.service.ts:268-280`(`reviewContexts`)

**Interfaces:**
- Produces: `reviewWindowClosed(anchor: Date | null, now: Date): boolean`
- Consumes: `V1TeamMatch.completedAt`(team_match 앵커), `officialResultTimestamp(fixture)`(tournament_fixture 앵커, `tournament-fixture-review-mappers.ts` 기존 함수)

> 근거: 스펙 §6. **착수 전 확인**: `fix/v1-goal-event-backfill-idempotency` 브랜치가 `resolveTournamentFixtureOfficialTimestamp()`(`tournament-fixture-official-result.ts`)를 수정 중이었다(스펙 §1.3, 2026-08-17 조사 시점) — 이 Task 착수 전 `git log origin/dev -- apps/v1_api/src/tournaments/tournament-fixture-official-result.ts`로 그 변경이 이미 dev에 흡수됐는지 재확인하고, 흡수됐다면 `officialResultTimestamp()` 시그니처가 그대로인지 diff를 본다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`apps/v1_api/src/reviews/review-deadline.spec.ts`:

```ts
import { reviewWindowClosed } from './review-deadline';

describe('reviewWindowClosed', () => {
  const anchor = new Date('2026-08-01T00:00:00.000Z');

  it('앵커가 없으면(null) 마감을 판정할 수 없으므로 false를 반환한다(마감 없음)', () => {
    expect(reviewWindowClosed(null, new Date('2099-01-01T00:00:00.000Z'))).toBe(false);
  });

  it('47시간 59분 경과는 아직 마감 전이다', () => {
    const now = new Date(anchor.getTime() + (47 * 60 + 59) * 60 * 1000);
    expect(reviewWindowClosed(anchor, now)).toBe(false);
  });

  it('정확히 48시간 경과는 아직 마감 전이다(경계값, 초과부터 마감)', () => {
    const now = new Date(anchor.getTime() + 48 * 60 * 60 * 1000);
    expect(reviewWindowClosed(anchor, now)).toBe(false);
  });

  it('48시간을 1분이라도 초과하면 마감이다', () => {
    const now = new Date(anchor.getTime() + 48 * 60 * 60 * 1000 + 60 * 1000);
    expect(reviewWindowClosed(anchor, now)).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns review-deadline`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 헬퍼를 구현한다**

`apps/v1_api/src/reviews/review-deadline.ts`:

```ts
export const REVIEW_WINDOW_HOURS = 48;

/**
 * team_match/tournament_fixture 리뷰의 48시간 마감 판정 — 저장하지 않고 매 요청 시점에
 * 계산한다(D-6). anchor가 null이면(예: match — 완료 시각 배관 자체가 없음, 스펙 §1.2.2)
 * 마감을 판정할 근거가 없으므로 항상 false(무기한) — 이 헬퍼를 match 소스에는 호출하지 않는다.
 */
export function reviewWindowClosed(anchor: Date | null, now: Date): boolean {
  if (!anchor) return false;
  const elapsedMs = now.getTime() - anchor.getTime();
  return elapsedMs > REVIEW_WINDOW_HOURS * 60 * 60 * 1000;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns review-deadline`
Expected: PASS (4 tests)

- [ ] **Step 5: `team_match`에 적용한다**

`reviews.service.ts` 상단 import에 `reviewWindowClosed` 추가. `teamMatchSourceContext()`(`:569-586`)의 `if (!isCompleted(teamMatch)) throw conflict(...)` 다음 줄:

```ts
if (reviewWindowClosed(teamMatch.completedAt, new Date())) {
  throw new GoneException({ code: 'REVIEW_WINDOW_CLOSED', message: '평가 가능 기간(48시간)이 지났어요.' });
}
```

`GoneException`은 `@nestjs/common`에서 import(410) — 파일 상단 기존 import 목록(`BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException`)에 추가한다.

- [ ] **Step 6: `tournament_fixture`에 적용한다**

`tournament-fixture-reviews.service.ts`의 `reviewContexts()`(`:268-280`), 기존 `if (fixture.status !== 'completed' || !officialResultTimestamp(fixture)) throw conflict(...)` 다음:

```ts
if (reviewWindowClosed(officialResultTimestamp(fixture), new Date())) {
  throw new GoneException({ code: 'REVIEW_WINDOW_CLOSED', message: '평가 가능 기간(48시간)이 지났어요.' });
}
```

- [ ] **Step 7: `match`에는 적용하지 않는다는 회귀 테스트를 추가한다**

`reviews.service.spec.ts`에 추가:

```ts
it('match 소스는 48h 마감 없이 무기한 제출 가능하다(D-12, 완료 플로우 부재)', async () => {
  // arrange: match.completedAt = 100일 전
  // act: submit(sourceType: 'match', ...)
  // assert: 성공(REVIEW_WINDOW_CLOSED 아님)
});
```

- [ ] **Step 8: 테스트를 돌린다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns "reviews.service|tournament-fixture-reviews.service|review-deadline"`
Expected: PASS

- [ ] **Step 9: 타입 체크**

Run: `cd apps/v1_api && ./node_modules/.bin/tsc --noEmit`

- [ ] **Step 10: 커밋한다**

```bash
git add apps/v1_api/src/reviews/review-deadline.ts \
        apps/v1_api/src/reviews/review-deadline.spec.ts \
        apps/v1_api/src/reviews/reviews.service.ts \
        apps/v1_api/src/reviews/reviews.service.spec.ts \
        apps/v1_api/src/reviews/tournament-fixture-reviews.service.ts \
        apps/v1_api/src/reviews/tournament-fixture-reviews.service.spec.ts
git commit -m "feat(reviews): team_match/tournament_fixture 48시간 평가창 적용"
git show --stat HEAD
```

> **§14 미결 — 사용자 결정 대기(D-3):** 이 Task는 공개(reveal) 게이트를 건드리지 않는다. 스펙 §3.1이 제시한 "3건 게이트로 승격" 옵션은 이 계획 어디에서도 구현하지 않았다 — 현행 상호제출 OR 72h 유지가 기본값이며, 사용자가 D-3을 결정하면 별도 태스크로 `review-visibility.ts`/`isReviewRevealed()`를 수정한다.

---

## Task 5: `SubmitReviewDto`를 4항목 `scores`로 전환 (breaking, D-1·D-7·D-11)

> **⚠️ 배포 순서 관련 사용자 결정 대기 (스펙 §12.5·§14):** 이 Task는 `POST /reviews`의 요청 바디를 `rating`+`tagCodes`에서 `scores` 4항목 필수로 바꾼다 — **breaking change**다. 아래 Step 3은 "즉시 breaking"(백엔드 배포 직후 프론트 배포, 그 사이 창에서는 구형 프론트 요청이 400) 경로를 기본으로 작성했다. 사용자가 "짧은 이중 지원 기간"을 선택하면 Step 3-대안을 대신 적용한다 — **아래 두 경로 중 하나를 착수 전에 확정한다.**

**Files:**
- Modify: `apps/v1_api/src/reviews/dto/submit-review.dto.ts`
- Create: `apps/v1_api/src/reviews/dto/review-score.dto.ts`
- Modify: `apps/v1_api/src/reviews/reviews.service.ts`(`assertSubmitShape`, 있다면), `tournament-fixture-reviews.service.ts`(`submit` 진입점)

**Interfaces:**
- Produces: `SubmitReviewDto.scores: { skill, manner, punctuality, safety }` (4개 모두 `@IsInt() @Min(1) @Max(5)`), `tagCodes` 제거
- Consumes: 없음(DTO 계층)

> 근거: 스펙 §9.1, D-1(3개 sourceType 전체 적용)·D-7(태그 폐기, 레거시는 보존)·D-11(`rating`→`compositeScore` API 리네이밍은 Task 6에서 응답 계층에 적용).

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`apps/v1_api/src/reviews/dto/submit-review.dto.spec.ts`(신규):

```ts
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SubmitReviewDto } from './submit-review.dto';

describe('SubmitReviewDto', () => {
  const base = {
    sourceType: 'team_match',
    sourceId: '11111111-1111-1111-1111-111111111111',
    targetType: 'user',
    targetUserId: '22222222-2222-2222-2222-222222222222',
  };

  it('scores 4항목이 모두 있으면 통과한다', async () => {
    const dto = plainToInstance(SubmitReviewDto, { ...base, scores: { skill: 4, manner: 5, punctuality: 4, safety: 5 } });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('scores 중 하나라도 빠지면 거부한다(부분 채점 불허)', async () => {
    const dto = plainToInstance(SubmitReviewDto, { ...base, scores: { skill: 4, manner: 5, punctuality: 4 } });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('scores 항목이 1~5 범위를 벗어나면 거부한다', async () => {
    const dto = plainToInstance(SubmitReviewDto, { ...base, scores: { skill: 6, manner: 5, punctuality: 4, safety: 5 } });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('tagCodes/rating 필드는 더 이상 DTO에 존재하지 않는다', () => {
    const dto = new SubmitReviewDto();
    expect('tagCodes' in dto).toBe(false);
    expect('rating' in dto).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns submit-review.dto`
Expected: FAIL(현재 DTO는 `rating`/`tagCodes`를 요구)

- [ ] **Step 3: DTO를 교체한다 (기본 경로 — 즉시 breaking)**

`apps/v1_api/src/reviews/dto/review-score.dto.ts`(신규):

```ts
import { Type } from 'class-transformer';
import { IsInt, Max, Min, ValidateNested } from 'class-validator';

export class ReviewScoreDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  skill!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  manner!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  punctuality!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  safety!: number;
}
```

`apps/v1_api/src/reviews/dto/submit-review.dto.ts` 전체 교체:

```ts
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { ReviewScoreDto } from './review-score.dto';

export class SubmitReviewDto {
  @IsIn(['match', 'team_match', 'tournament_fixture'])
  sourceType!: 'match' | 'team_match' | 'tournament_fixture';

  @IsUUID()
  sourceId!: string;

  @IsIn(['user', 'team'])
  targetType!: 'user' | 'team';

  @IsOptional()
  @IsUUID()
  targetUserId?: string;

  @IsOptional()
  @IsUUID()
  targetTeamId?: string;

  @ValidateNested()
  @Type(() => ReviewScoreDto)
  scores!: ReviewScoreDto;
}
```

- [ ] **Step 3-대안 (사용자가 이중 지원 기간을 선택한 경우에만 적용):**

`scores`를 optional로 두고 `rating`+`tagCodes`도 함께 받는 과도기 shape을 만든다:

```ts
  @IsOptional()
  @ValidateNested()
  @Type(() => ReviewScoreDto)
  scores?: ReviewScoreDto;

  // 과도기 호환 — scores 없이 rating만 오면 legacy 경로로 처리(scoringVersion=legacy_single_rating).
  // 이 필드는 프론트 전환이 끝나는 즉시 제거해야 기술부채로 남지 않는다 — 제거 커밋은
  // 이 계획 밖(별도 후속 작업)이며, 여기 남겨 두는 목적으로 "제거 예정"을 방치하지 않는다.
  @IsOptional()
  @IsInt() @Min(1) @Max(5)
  rating?: number;
```

서비스 계층(`submit()`)에서 `dto.scores`가 있으면 4항목 경로, 없고 `dto.rating`만 있으면 legacy 단일점수 경로로 분기 — 이 분기는 Task 6의 저장 로직에 그대로 이어진다.

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns submit-review.dto`
Expected: PASS (4 tests)

- [ ] **Step 5: 컨트롤러·서비스 호출부 타입 에러를 걷어낸다**

Run: `cd apps/v1_api && ./node_modules/.bin/tsc --noEmit`

이 시점에서 `reviews.service.ts`/`tournament-fixture-reviews.service.ts`의 `dto.rating`/`dto.tagCodes` 참조가 전부 컴파일 에러로 드러난다 — Task 6에서 이 참조들을 `dto.scores` 기반으로 교체한다(Task 5는 DTO 계약만 바꾸고, 저장 로직 전환은 Task 6으로 분리해 커밋 단위를 좁힌다). **이 Task 커밋 시점에는 tsc 에러가 남아 있는 게 정상**이다 — Task 6과 합쳐 하나의 PR로 머지하기 전에만 tsc 0건을 만족하면 된다(Global Constraints의 tsc 게이트는 PR 단위).

- [ ] **Step 6: 커밋한다**

```bash
git add apps/v1_api/src/reviews/dto/submit-review.dto.ts \
        apps/v1_api/src/reviews/dto/review-score.dto.ts \
        apps/v1_api/src/reviews/dto/submit-review.dto.spec.ts
git commit -m "feat(reviews): SubmitReviewDto를 4항목 scores로 전환 (breaking)"
git show --stat HEAD
```

---

## Task 6: `scores` 저장 + `rating` 파생 + `metric*` 신뢰점수 갱신 (D-4·D-5)

**Files:**
- Modify: `apps/v1_api/src/reviews/reviews.service.ts` (`submitPersonalReview:725`, `submitTeamReview:801`, `submitTeamMatchPlayerReview`, `recalculateUserReputation:1010`, `recalculateTeamTrust:1038`)
- Modify: `apps/v1_api/src/reviews/tournament-fixture-reviews.service.ts` (`submitPlayerReview:222`, `submitTeamReview:171`)
- Modify: `apps/v1_api/src/reviews/tournament-fixture-review-reputation.ts`, `tournament-fixture-review-trust.ts`

**Interfaces:**
- Produces: `compositeScoreFromMetrics(scores): number`(순수함수, `round(avg(4항목))`), `V1PostEventReview.rating` 자동 파생, `V1PostEventReviewMetricScore` 4행 nested create, 신뢰점수 4개 재계산 함수에 `metric*` 컬럼 갱신 추가

> 근거: D-4(rating 유지, `round(avg(4항목))`), D-5(`metric*` 컬럼 확장), §4.5(레거시 리뷰는 `metricScores` 없음 → `scoringVersion` 필터로 자동 분리), 재계산 함수 실측 코드(`reviews.service.ts:1010-1130`, `tournament-fixture-review-reputation.ts:19-60`, `tournament-fixture-review-trust.ts:4-56`).

- [ ] **Step 1: 합성점수 파생 순수함수를 작성한다**

`apps/v1_api/src/reviews/review-score.dto.ts`에 추가(같은 파일 — 타입과 로직이 밀접):

```ts
/** D-4: rating = round(avg(4항목)). Math.round는 반올림(4.5 → 5)이며, 이 저장소 다른 라운딩과
 * 동일 컨벤션(스펙이 별도 반올림 규칙을 지정하지 않아 표준 반올림을 채택). */
export function compositeScoreFromMetrics(scores: { skill: number; manner: number; punctuality: number; safety: number }): number {
  return Math.round((scores.skill + scores.manner + scores.punctuality + scores.safety) / 4);
}
```

- [ ] **Step 2: 실패하는 테스트를 작성한다**

`review-score.dto.spec.ts`(Task 5에서 만든 파일에 추가):

```ts
import { compositeScoreFromMetrics } from './review-score.dto';

describe('compositeScoreFromMetrics', () => {
  it('4항목 평균을 반올림한다', () => {
    expect(compositeScoreFromMetrics({ skill: 4, manner: 5, punctuality: 4, safety: 5 })).toBe(5); // avg 4.5 → 5
    expect(compositeScoreFromMetrics({ skill: 1, manner: 1, punctuality: 1, safety: 1 })).toBe(1);
    expect(compositeScoreFromMetrics({ skill: 5, manner: 5, punctuality: 5, safety: 5 })).toBe(5);
    expect(compositeScoreFromMetrics({ skill: 3, manner: 3, punctuality: 3, safety: 4 })).toBe(3); // avg 3.25 → 3
  });
});
```

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns review-score.dto`
Expected: PASS(순수함수라 바로 통과 — TDD의 "실패 확인" 단계는 Step 1을 스텁으로 먼저 커밋하지 않는 한 생략 가능. 이 스텝은 회귀 확인 목적)

- [ ] **Step 3: 리뷰 생성 호출부에서 `scores`를 저장하도록 바꾼다**

`reviews.service.ts`의 `submitPersonalReview`(`:725`)/`submitTeamReview`(`:801`)/`submitTeamMatchPlayerReview`, `tournament-fixture-reviews.service.ts`의 `submitPlayerReview`(`:222`)/`submitTeamReview`(`:171`) — 총 5개 `tx.v1PostEventReview.create({...})` 호출부 전부에서:

```diff
       data: {
         reviewerUserId: user.id,
         ...
-        rating: dto.rating,
-        tags: { create: tagCodes.map((tagCode) => ({ tagCode, labelSnapshot: REVIEW_TAGS[tagCode] })) },
+        rating: compositeScoreFromMetrics(dto.scores),
+        scoringVersion: 'four_metric',
+        metricScores: {
+          create: [
+            { metric: 'SKILL', score: dto.scores.skill },
+            { metric: 'MANNER', score: dto.scores.manner },
+            { metric: 'PUNCTUALITY', score: dto.scores.punctuality },
+            { metric: 'SAFETY', score: dto.scores.safety },
+          ],
+        },
       },
```

`tagCodes`/`REVIEW_TAGS` 참조는 이 5곳에서 전부 제거한다(D-7 — 신규 리뷰는 태그를 쓰지 않는다. `REVIEW_TAGS` 상수 자체와 `V1PostEventReviewTag` 모델은 레거시 조회 표시용으로 남기고 삭제하지 않는다 — 스펙 §8.1 (b) 채택 근거).

각 호출부의 함수 시그니처에서 `tagCodes: ReviewTagCode[]`/`tagCodes: TournamentFixtureReviewTagCode[]` 파라미터도 함께 제거하고, 그 파라미터를 넘기던 `submit()` 진입점(`:327-340`, `tournament-fixture-reviews.service.ts`의 `submit()`)의 `uniqueTagCodes(dto.tagCodes)` 호출도 제거한다.

> Step 3-대안(Task 5에서 이중 지원 기간을 택한 경우): `dto.scores`가 있으면 위 4-metric 경로, 없고 `dto.rating`만 있으면 기존 `rating: dto.rating, scoringVersion: 'legacy_single_rating', tags: {...}` 경로를 그대로 유지하는 조건 분기를 추가한다.

- [ ] **Step 4: `recalculateUserReputation`에 `metric*` 컬럼 갱신을 추가한다**

`reviews.service.ts:1010-1030`, 기존 `candidates` 쿼리의 `select`에 리뷰의 metricScores를 함께 읽도록 확장:

```diff
     const candidates = await tx.v1PostEventReview.findMany({
       where: { targetUserId, targetType: 'user', status: 'submitted', sourceType: { in: PERSONAL_REPUTATION_SOURCES } },
-      select: { sourceId: true, reviewerUserId: true, targetUserId: true, rating: true, submittedAt: true },
+      select: {
+        sourceId: true, reviewerUserId: true, targetUserId: true, rating: true, submittedAt: true,
+        scoringVersion: true,
+        metricScores: { select: { metric: true, score: true } },
+      },
     });
```

`revealed` 필터링(기존 `isReviewRevealed` 로직 불변) 다음, `V1UserReputationSummary.upsert` 호출 앞에 metric 평균 계산을 추가:

```ts
const metricAverages = averageMetricsFromReviews(
  revealed.filter((review) => review.scoringVersion === 'four_metric'),
);
```

`averageMetricsFromReviews`는 신규 공유 헬퍼(다음 스텝)로 뺀다 — 4개 재계산 함수가 동일한 "리뷰 목록 → metric별 평균" 로직을 반복하므로 중복 방지.

`reputationData(...)` 호출을 확장(기존 함수 시그니처에 metric 인자 추가) — `upsert`의 `update`/`create` data에 아래를 병합:

```ts
metricSkillScore: decimalScore(metricAverages.SKILL),
metricPunctualityScore: decimalScore(metricAverages.PUNCTUALITY),
metricSafetyScore: decimalScore(metricAverages.SAFETY),
metricMannerScore: decimalScore(metricAverages.MANNER),
metricReviewCount: metricAverages.count,
```

`decimalScore`는 이 파일에 이미 정의돼 있다(`reviews.service.ts:1300` 근처, 실측 확인) — 그대로 재사용한다.

- [ ] **Step 5: `averageMetricsFromReviews` 공유 헬퍼를 만든다**

`apps/v1_api/src/reviews/review-score.dto.ts`에 추가(또는 순환 의존 방지를 위해 신규 `apps/v1_api/src/reviews/review-metric-aggregation.ts` — DTO 파일에 집계 로직을 두는 게 어색하면 이쪽을 신규로 만든다):

```ts
export type MetricAverages = {
  SKILL: number | null;
  MANNER: number | null;
  PUNCTUALITY: number | null;
  SAFETY: number | null;
  count: number;
};

/**
 * four_metric 리뷰 목록에서 항목별 평균을 낸다. legacy_single_rating 리뷰는 metricScores가
 * 비어 있으므로(D-7, 백필 없음) 호출 전 scoringVersion === 'four_metric' 으로 걸러야 한다 —
 * 걸러지지 않은 legacy 리뷰가 섞여 들어와도 이 함수 자체는 빈 metricScores를 0건으로
 * 취급해 평균을 왜곡하지 않지만(합·건수 모두 0 기여), count는 "4항목을 채점한 리뷰 수"라는
 * 의미를 지키기 위해 반드시 필터 후 호출한다.
 */
export function averageMetricsFromReviews(
  reviews: ReadonlyArray<{ metricScores: ReadonlyArray<{ metric: 'SKILL' | 'MANNER' | 'PUNCTUALITY' | 'SAFETY'; score: number }> }>,
): MetricAverages {
  const sums: Record<'SKILL' | 'MANNER' | 'PUNCTUALITY' | 'SAFETY', number> = { SKILL: 0, MANNER: 0, PUNCTUALITY: 0, SAFETY: 0 };
  let count = 0;
  for (const review of reviews) {
    if (review.metricScores.length === 0) continue; // legacy 안전망 — 필터 누락돼도 스킵
    count += 1;
    for (const entry of review.metricScores) sums[entry.metric] += entry.score;
  }
  if (count === 0) return { SKILL: null, MANNER: null, PUNCTUALITY: null, SAFETY: null, count: 0 };
  return {
    SKILL: sums.SKILL / count,
    MANNER: sums.MANNER / count,
    PUNCTUALITY: sums.PUNCTUALITY / count,
    SAFETY: sums.SAFETY / count,
    count,
  };
}
```

단위 테스트(`review-metric-aggregation.spec.ts` 또는 기존 spec 파일에 추가):
```ts
it('four_metric 리뷰만 평균을 낸다', () => {
  const result = averageMetricsFromReviews([
    { metricScores: [{ metric: 'SKILL', score: 4 }, { metric: 'MANNER', score: 5 }, { metric: 'PUNCTUALITY', score: 4 }, { metric: 'SAFETY', score: 5 }] },
    { metricScores: [] }, // legacy — 스킵되어야 함
  ]);
  expect(result).toEqual({ SKILL: 4, MANNER: 5, PUNCTUALITY: 4, SAFETY: 5, count: 1 });
});
it('전부 legacy면 전부 null이다', () => {
  expect(averageMetricsFromReviews([{ metricScores: [] }])).toEqual({ SKILL: null, MANNER: null, PUNCTUALITY: null, SAFETY: null, count: 0 });
});
```

- [ ] **Step 6: `recalculateTeamTrust`(team_match)에 같은 패턴을 적용한다**

`reviews.service.ts:1038-1130`도 Step 4와 동일하게 `candidates` select에 `scoringVersion`/`metricScores` 추가, `revealedGroupKeys` 필터링 후(기존 팀 단위 reveal 판정 로직 불변) `metric*` 컬럼을 upsert data에 병합한다. **주의**: 이 함수는 "팀 평균 1표"로 접는 구조(리뷰 단위가 아니라 `reviewerTeamId` 그룹 단위)라, `averageMetricsFromReviews`를 그대로 쓰면 "팀당 1표"가 아니라 "리뷰 건수 기준"이 되어 원시 평균과 같은 문제가 재발한다 — **개인 리뷰가 아니라 팀별 metric 평균을 먼저 낸 뒤 그 평균들의 평균**을 내야 한다(기존 `rating` 집계가 `reviewerTeamAverages`로 그룹핑하는 것과 동일 구조, `tournament-fixture-review-trust.ts:12-19`의 `groupBy(['reviewerTeamId'])` 패턴 참고). 이 그룹핑을 반영한 별도 헬퍼(`averageMetricsByGroup`)가 필요할 수 있다 — 정확한 구현은 기존 `revealGroups`/`revealedGroupKeys` 순회 구조를 읽고 그 위에 얹는다(파일을 열어 정확한 변수명 확인).

- [ ] **Step 7: `recalculateTournamentUserReputation`/`recalculateTournamentFixtureTeamTrust`에도 동일 적용**

`tournament-fixture-review-reputation.ts`(19-60행대)와 `tournament-fixture-review-trust.ts`(4-56행대) — 두 함수 모두 이미 "대회 × 평가한 팀 1표"로 접는 구조(`groupBy`/그룹 평균)이므로 Step 6과 동일한 그룹 단위 metric 집계가 필요하다. `teamTrustData()`/`reputationData()`류 헬퍼 함수(각 파일에 이미 존재, `tournament-fixture-review-mappers.ts` 소재 확인 필요)의 시그니처에 metric 인자를 추가한다.

- [ ] **Step 8: 회귀 + 신규 테스트를 돌린다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns "reviews.service|tournament-fixture-review-reputation|tournament-fixture-review-trust|tournament-fixture-reviews.service"`
Expected: PASS — 기존 `rating`/`mannerScore` 집계 회귀 없음(legacy 리뷰가 여전히 `mannerScore`엔 반영되고 `metricMannerScore`엔 반영 안 됨을 검증하는 케이스 추가)

```ts
it('legacy_single_rating 리뷰는 mannerScore(종합)엔 반영되지만 metricMannerScore(항목별)엔 반영되지 않는다', async () => {
  // arrange: legacy 리뷰 1건(rating=4, metricScores 없음)
  // act: recalculateUserReputation(tx, targetUserId)
  // assert: mannerScore === 4, metricMannerScore === null, metricReviewCount === 0
});
```

- [ ] **Step 9: 타입 체크**

Run: `cd apps/v1_api && ./node_modules/.bin/tsc --noEmit`
Expected: 에러 0건 — Task 5에서 남겨둔 `dto.rating`/`dto.tagCodes` 참조 에러가 전부 해소돼야 한다.

- [ ] **Step 10: 커밋한다**

```bash
git add apps/v1_api/src/reviews/reviews.service.ts \
        apps/v1_api/src/reviews/reviews.service.spec.ts \
        apps/v1_api/src/reviews/tournament-fixture-reviews.service.ts \
        apps/v1_api/src/reviews/tournament-fixture-review-reputation.ts \
        apps/v1_api/src/reviews/tournament-fixture-review-reputation.spec.ts \
        apps/v1_api/src/reviews/tournament-fixture-review-trust.ts \
        apps/v1_api/src/reviews/tournament-fixture-review-trust.spec.ts \
        apps/v1_api/src/reviews/dto/review-score.dto.ts \
        apps/v1_api/src/reviews/dto/review-score.dto.spec.ts
git commit -m "feat(reviews): scores 저장 + rating 파생 + metric 신뢰점수 갱신"
git show --stat HEAD
```

---

## Task 7: 재계산 동시성 — advisory lock 4곳 (§10 major)

**Files:**
- Modify: `apps/v1_api/src/reviews/reviews.service.ts` (`recalculateUserReputation:1010`, `recalculateTeamTrust:1038`)
- Modify: `apps/v1_api/src/reviews/tournament-fixture-review-reputation.ts`, `tournament-fixture-review-trust.ts`

**Interfaces:**
- Consumes: 없음(`tx.$executeRaw`)

> 근거: 스펙 §10. 4개 재계산 함수 모두 `findMany` 읽기 → `upsert` 쓰기의 read-then-write이며 행 잠금이 없다(코드 확인) — Task 10(risk-sweep)이 같은 재계산 함수를 별도 트랜잭션에서 다시 호출하게 되므로, 이 Task에서 미리 lock을 걸어야 Task 10에서 lost update가 재현되지 않는다. 선례: `team-schedules/attendance.service.ts:351`, `tournament-operations/fields/tournament-operations-fields.service.ts:618`(둘 다 실측 확인 — `pg_advisory_xact_lock(hashtextextended(scope, 0))` 패턴).

- [ ] **Step 1: `recalculateUserReputation`에 lock을 건다**

`reviews.service.ts:1010`, 함수 진입 직후(`const now = new Date();` 앞 또는 뒤):

```ts
await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`review-recalc:user-reputation:${targetUserId}`}, 0))`;
```

- [ ] **Step 2: `recalculateTeamTrust`에 lock을 건다**

`reviews.service.ts:1038`:

```ts
await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`review-recalc:team-trust:${targetTeamId}`}, 0))`;
```

- [ ] **Step 3: `recalculateTournamentFixtureTeamTrust`에 lock을 건다**

`tournament-fixture-review-trust.ts:4`:

```ts
await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`review-recalc:tournament-team-trust:${targetTeamId}`}, 0))`;
```

- [ ] **Step 4: `recalculateTournamentUserReputation`에 lock을 건다**

`tournament-fixture-review-reputation.ts:19`:

```ts
await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`review-recalc:tournament-user-reputation:${targetUserId}`}, 0))`;
```

- [ ] **Step 5: 동시성 통합 테스트를 작성한다 — ⚠️ 이 환경에서는 실행 보류(DB 없음)**

`apps/v1_api/test/integration/`에 신규 시나리오 추가(파일명은 기존 컨벤션 확인 후 결정, 예: `review-recalc-concurrency.e2e-spec.ts`):
- 같은 `targetTeamId`에 대해 두 트랜잭션(제출 경로 1개 + risk-sweep 재계산 1개 흉내)을 동시에 실행
- lock 없이 재현되던 lost update(먼저 반영된 flagged 제외가 되돌아가는 현상)가 lock 적용 후 사라지는지 확인
- 파일 작성만 하고 실행은 CI(DB 있는 환경)에 맡긴다. tsc 통과로 이 스텝을 완료로 본다.

Run: `cd apps/v1_api && ./node_modules/.bin/tsc --noEmit` (통합 테스트 파일 포함)
Expected: 0건 — **integration 테스트 파일이 `tsconfig`의 `include`에 걸리는지 반드시 확인한다**(Global Constraints 경고: 과거 include 누락으로 CI에서 TS2339가 난 전례).

- [ ] **Step 6: 유닛 테스트를 돌린다(lock 자체는 mock으로)**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns "reviews.service|tournament-fixture-review-reputation|tournament-fixture-review-trust"`
Expected: PASS — `tx.$executeRaw`가 mock Prisma tx에서 no-op으로 처리되는지 기존 mock 헬퍼 구조 확인(각 spec 파일이 `tx`를 어떻게 mock하는지 파일을 열어 맞춘다 — `$executeRaw`가 이미 mock되어 있지 않다면 `jest.fn().mockResolvedValue(undefined)`로 추가).

- [ ] **Step 7: 커밋한다**

```bash
git add apps/v1_api/src/reviews/reviews.service.ts \
        apps/v1_api/src/reviews/tournament-fixture-review-reputation.ts \
        apps/v1_api/src/reviews/tournament-fixture-review-trust.ts \
        apps/v1_api/test/integration/
git commit -m "fix(reviews): 신뢰점수 재계산 4곳에 advisory lock 적용 (lost update 방지)"
git show --stat HEAD
```

> **PR 1 종료 지점.** 여기서 PR을 열고 base가 `dev`인지 `gh pr view <N> --json baseRefName`으로 확인한다. 머지 전 `./node_modules/.bin/tsc --noEmit` 0건 + 유닛 테스트 전부 PASS를 실배포 게이트로 취급한다(dev 머지 = alpha 즉시 배포).

---

# PR 2 — 이상 탐지 + FLAGGED 운영 큐

## Task 8: 이상 탐지 규칙 3종 순수함수 (§7.2)

**Files:**
- Create: `apps/v1_api/src/reviews/review-risk-rules.ts`
- Create: `apps/v1_api/src/reviews/review-risk-rules.spec.ts`

**Interfaces:**
- Produces:
  - `type RiskCandidateReview = { reviewId: string; reviewerUserId: string; reviewerTeamId: string | null; targetUserId: string | null; targetTeamId: string | null; sourceGroupId: string | null; compositeScore: number }`
  - `function detectExtremeLowOutlier(byReviewer: Map<string, RiskCandidateReview[]>, cohortAverage: number, cohortStdDev: number): RiskFinding[]`
  - `function detectUniformTeamExtreme(bySourceAndReviewerTeam: Map<string, RiskCandidateReview[]>): RiskFinding[]`
  - `function detectRepeatedLowPair(byPair: Map<string, RiskCandidateReview[]>): RiskFinding[]`
  - `type RiskFinding = { groupKey: string; ruleCode: 'EXTREME_LOW_OUTLIER' | 'UNIFORM_TEAM_EXTREME' | 'REPEATED_LOW_PAIR'; reviewIds: string[]; riskScore: number; signal: Record<string, unknown> }`

> 근거: 스펙 §7.2 표(3규칙, 각각 판정에 쓰인 구체적 리뷰 id 집합). 이 Task는 **순수함수만** 만든다 — DB 조회·outbox·트랜잭션은 Task 10에서 이 함수들을 호출하는 쪽이 담당한다(관심사 분리, 유닛 테스트가 DB 없이 돈다).

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`apps/v1_api/src/reviews/review-risk-rules.spec.ts`:

```ts
import { detectExtremeLowOutlier, detectRepeatedLowPair, detectUniformTeamExtreme } from './review-risk-rules';

function review(overrides: Partial<Parameters<typeof detectExtremeLowOutlier>[0] extends Map<string, infer T> ? T : never>) {
  return {
    reviewId: 'r1', reviewerUserId: 'u1', reviewerTeamId: null,
    targetUserId: 'target1', targetTeamId: null, sourceGroupId: null, compositeScore: 3,
    ...overrides,
  };
}

describe('detectExtremeLowOutlier', () => {
  it('작성자 최근 리뷰 평균이 코호트 평균 대비 2표준편차 이상 낮으면 그 작성자의 리뷰 전부를 판정한다', () => {
    const byReviewer = new Map([
      ['u1', [review({ reviewId: 'r1', compositeScore: 1 }), review({ reviewId: 'r2', compositeScore: 1 })]],
    ]);
    const findings = detectExtremeLowOutlier(byReviewer, /* cohortAverage */ 4, /* cohortStdDev */ 0.5);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleCode).toBe('EXTREME_LOW_OUTLIER');
    expect(findings[0].reviewIds.sort()).toEqual(['r1', 'r2']);
  });

  it('정상 분포(2표준편차 이내)는 판정하지 않는다', () => {
    const byReviewer = new Map([['u1', [review({ compositeScore: 4 })]]]);
    expect(detectExtremeLowOutlier(byReviewer, 4, 0.5)).toHaveLength(0);
  });
});

describe('detectUniformTeamExtreme', () => {
  it('같은 소스에서 한 팀 작성자 전원이 모든 대상에게 동일 극단(1점)을 주면 그 M건을 판정한다', () => {
    const grouped = new Map([
      ['source1:teamA', [
        review({ reviewId: 'r1', reviewerTeamId: 'teamA', targetUserId: 't1', compositeScore: 1 }),
        review({ reviewId: 'r2', reviewerTeamId: 'teamA', targetUserId: 't2', compositeScore: 1 }),
      ]],
    ]);
    const findings = detectUniformTeamExtreme(grouped);
    expect(findings).toHaveLength(1);
    expect(findings[0].reviewIds.sort()).toEqual(['r1', 'r2']);
  });

  it('극단값이 섞여 있으면(1점과 3점 혼재) 판정하지 않는다', () => {
    const grouped = new Map([
      ['source1:teamA', [
        review({ reviewId: 'r1', compositeScore: 1 }),
        review({ reviewId: 'r2', compositeScore: 3 }),
      ]],
    ]);
    expect(detectUniformTeamExtreme(grouped)).toHaveLength(0);
  });

  it('5점 만점 극단도 동일하게 판정한다', () => {
    const grouped = new Map([
      ['source1:teamA', [review({ reviewId: 'r1', compositeScore: 5 }), review({ reviewId: 'r2', compositeScore: 5 })]],
    ]);
    expect(detectUniformTeamExtreme(grouped)).toHaveLength(1);
  });
});

describe('detectRepeatedLowPair', () => {
  it('동일 두 팀 조합이 최근 3개 대회 이상 반복 저평가면(각 대회 평균 <= 2) 판정한다', () => {
    const byPair = new Map([
      ['teamA:teamB', [
        review({ reviewId: 'r1', reviewerTeamId: 'teamA', targetTeamId: 'teamB', sourceGroupId: 'tour1', compositeScore: 1 }),
        review({ reviewId: 'r2', reviewerTeamId: 'teamA', targetTeamId: 'teamB', sourceGroupId: 'tour2', compositeScore: 2 }),
        review({ reviewId: 'r3', reviewerTeamId: 'teamA', targetTeamId: 'teamB', sourceGroupId: 'tour3', compositeScore: 1 }),
      ]],
    ]);
    const findings = detectRepeatedLowPair(byPair);
    expect(findings).toHaveLength(1);
    expect(findings[0].reviewIds.sort()).toEqual(['r1', 'r2', 'r3']);
  });

  it('대회가 2개뿐이면(K<3) 판정하지 않는다', () => {
    const byPair = new Map([
      ['teamA:teamB', [
        review({ reviewId: 'r1', sourceGroupId: 'tour1', compositeScore: 1 }),
        review({ reviewId: 'r2', sourceGroupId: 'tour2', compositeScore: 1 }),
      ]],
    ]);
    expect(detectRepeatedLowPair(byPair)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns review-risk-rules`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현한다**

`apps/v1_api/src/reviews/review-risk-rules.ts`:

```ts
export type RiskCandidateReview = {
  reviewId: string;
  reviewerUserId: string;
  reviewerTeamId: string | null;
  targetUserId: string | null;
  targetTeamId: string | null;
  sourceGroupId: string | null;
  compositeScore: number;
};

export type RiskFinding = {
  groupKey: string;
  ruleCode: 'EXTREME_LOW_OUTLIER' | 'UNIFORM_TEAM_EXTREME' | 'REPEATED_LOW_PAIR';
  reviewIds: string[];
  riskScore: number;
  signal: Record<string, unknown>;
};

const EXTREME_LOW_STDDEV_MULTIPLIER = 2;
const REPEATED_LOW_MIN_TOURNAMENTS = 3;
const REPEATED_LOW_THRESHOLD = 2; // 대회당 평균 compositeScore가 이 값 이하면 "저평가"

function makeGroupKey(ruleCode: string, scope: string): string {
  return `${ruleCode}:${scope}`;
}

/**
 * 규칙 1 — 특정 작성자의 최근 N건 평균이 전체 평균 대비 2표준편차 이상 낮음.
 * byReviewer: reviewerUserId → 그 작성자가 최근 쓴 리뷰 N건(호출자가 이미 "최근"으로 좁혀 넘긴다).
 */
export function detectExtremeLowOutlier(
  byReviewer: ReadonlyMap<string, readonly RiskCandidateReview[]>,
  cohortAverage: number,
  cohortStdDev: number,
): RiskFinding[] {
  const threshold = cohortAverage - EXTREME_LOW_STDDEV_MULTIPLIER * cohortStdDev;
  const findings: RiskFinding[] = [];
  for (const [reviewerUserId, reviews] of byReviewer) {
    if (reviews.length === 0) continue;
    const reviewerAverage = reviews.reduce((sum, r) => sum + r.compositeScore, 0) / reviews.length;
    if (reviewerAverage > threshold) continue;
    findings.push({
      groupKey: makeGroupKey('EXTREME_LOW_OUTLIER', reviewerUserId),
      ruleCode: 'EXTREME_LOW_OUTLIER',
      reviewIds: reviews.map((r) => r.reviewId),
      riskScore: Math.round((threshold - reviewerAverage) * 10),
      signal: { reviewerAverage, cohortAverage, cohortStdDev, threshold },
    });
  }
  return findings;
}

/**
 * 규칙 2 — 같은 소스(픽스처/매치) 1건에 대해 같은 상대팀 작성자들이 쓴 모든 대상별 리뷰
 * 전원이 동일한 극단(1점 또는 5점).
 * bySourceAndReviewerTeam: `${sourceId}:${reviewerTeamId}` → 그 소스·팀 조합의 리뷰들.
 */
export function detectUniformTeamExtreme(
  bySourceAndReviewerTeam: ReadonlyMap<string, readonly RiskCandidateReview[]>,
): RiskFinding[] {
  const findings: RiskFinding[] = [];
  for (const [scope, reviews] of bySourceAndReviewerTeam) {
    if (reviews.length < 2) continue; // 최소 2건은 있어야 "패턴"이라 부를 수 있다
    const first = reviews[0].compositeScore;
    if (first !== 1 && first !== 5) continue;
    const allUniform = reviews.every((r) => r.compositeScore === first);
    if (!allUniform) continue;
    findings.push({
      groupKey: makeGroupKey('UNIFORM_TEAM_EXTREME', scope),
      ruleCode: 'UNIFORM_TEAM_EXTREME',
      reviewIds: reviews.map((r) => r.reviewId),
      riskScore: first === 1 ? 100 : 60, // 만점 몰아주기(5)보다 최저점 몰아주기(1)가 더 위험
      signal: { extremeScore: first, reviewCount: reviews.length },
    });
  }
  return findings;
}

/**
 * 규칙 3 — 동일 두 팀/사용자 조합에서 최근 3개 이상 대회에 걸쳐 반복 저평가.
 * byPair: `${reviewerScopeId}:${targetScopeId}` → 그 조합의 전체 리뷰(여러 대회에 걸침).
 * "대회 단위 평균"으로 저평가를 판정한다 — 대회 하나에서 여러 건을 몰아 써도 그 대회는 1표.
 */
export function detectRepeatedLowPair(
  byPair: ReadonlyMap<string, readonly RiskCandidateReview[]>,
): RiskFinding[] {
  const findings: RiskFinding[] = [];
  for (const [scope, reviews] of byPair) {
    const byTournament = new Map<string, RiskCandidateReview[]>();
    for (const review of reviews) {
      if (!review.sourceGroupId) continue; // 대회 스코프가 없으면 이 규칙 대상 아님(team_match/match)
      const bucket = byTournament.get(review.sourceGroupId) ?? [];
      bucket.push(review);
      byTournament.set(review.sourceGroupId, bucket);
    }
    const lowTournaments = [...byTournament.entries()].filter(([, group]) => {
      const avg = group.reduce((sum, r) => sum + r.compositeScore, 0) / group.length;
      return avg <= REPEATED_LOW_THRESHOLD;
    });
    if (lowTournaments.length < REPEATED_LOW_MIN_TOURNAMENTS) continue;
    findings.push({
      groupKey: makeGroupKey('REPEATED_LOW_PAIR', scope),
      ruleCode: 'REPEATED_LOW_PAIR',
      reviewIds: lowTournaments.flatMap(([, group]) => group.map((r) => r.reviewId)),
      riskScore: Math.min(100, lowTournaments.length * 20),
      signal: { tournamentCount: lowTournaments.length, tournamentIds: lowTournaments.map(([id]) => id) },
    });
  }
  return findings;
}
```

> **미확인 — 임계값은 추정치다(스펙 §13 리스크 그대로 인용):** `EXTREME_LOW_STDDEV_MULTIPLIER=2`, `REPEATED_LOW_THRESHOLD=2`, `REPEATED_LOW_MIN_TOURNAMENTS=3`은 스펙 §7.2가 서술한 규칙을 코드화한 것이지 실제 운영 데이터로 튜닝된 값이 아니다. 튜닝은 이 계획 범위 밖 — Task 10의 `DISABLE_REVIEW_RISK_SWEEP` 플래그가 초기 관찰 기간을 벌어준다.

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns review-risk-rules`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋한다**

```bash
git add apps/v1_api/src/reviews/review-risk-rules.ts apps/v1_api/src/reviews/review-risk-rules.spec.ts
git commit -m "feat(reviews): 이상 평가 탐지 3규칙 순수함수 추가"
git show --stat HEAD
```

---

## Task 9: 결과 확정 시점에 `REVIEW_RISK_SWEEP_DUE` outbox 이벤트 스케줄 (§7.1)

**Files:**
- Modify: `apps/v1_api/src/games/games.service.ts` (`GamesOutboxEventType` 유니언, `decideResultRevision:2892`의 OFFICIAL 분기 — team_match)
- Modify: `apps/v1_api/src/tournament-operations/results/tournament-result-review.service.ts` (officialize 트랜잭션, `:487-520` — tournament_fixture)

**Interfaces:**
- Consumes: `V1Game.sourceType`/`teamMatchId`/`tournamentFixtureId`(officialize 커맨드 트랜잭션 안에서 이미 로드돼 있는 `game` 객체)
- Produces: `businessKey: review-risk-sweep:<sourceType>:<sourceId>`, `type: 'REVIEW_RISK_SWEEP_DUE'`, `availableAt: officialAt + 48h + 10min`

> 근거: 스펙 §7.1. **`decideResultRevision`(`games.service.ts:2892`)은 `game.sourceType !== TEAM_MATCH`면 즉시 403을 던지는, TEAM_MATCH 전용 결정 표면임을 실측 확인**(주석: "Tournament review uses the tournament review decision surface") — 즉 team_match와 tournament_fixture의 officialize는 **서로 다른 두 파일**에서 일어난다. `games.service.ts`의 `writeOutbox()`는 `type: GamesOutboxEventType`(닫힌 유니언, `:114` `'GAME_RESULT_SUBMITTED' | 'GAME_RESULT_OFFICIAL' | 'GAME_RESULT_CHANGE_REQUESTED'`)이라 새 이벤트 타입 추가가 **컴파일 에러 없이는 불가능하도록 설계돼 있다**(의도된 안전장치, 파일 자체 주석 확인) — 이 유니언에 `'REVIEW_RISK_SWEEP_DUE'`를 추가하지 않으면 이 Task는 컴파일이 안 된다. 반면 `tournament-result-review.service.ts`의 `writeOutbox()`는 `type: string`(열린 타입)이라 유니언 수정이 필요 없다.

- [ ] **Step 1: `GamesOutboxEventType`에 신규 타입을 추가한다**

`games.service.ts:114`:

```diff
-type GamesOutboxEventType = 'GAME_RESULT_SUBMITTED' | 'GAME_RESULT_OFFICIAL' | 'GAME_RESULT_CHANGE_REQUESTED';
+type GamesOutboxEventType =
+  | 'GAME_RESULT_SUBMITTED'
+  | 'GAME_RESULT_OFFICIAL'
+  | 'GAME_RESULT_CHANGE_REQUESTED'
+  | 'REVIEW_RISK_SWEEP_DUE';
```

- [ ] **Step 2: team_match officialize(`decideResultRevision`)에 훅을 추가한다**

`games.service.ts:2892` 함수 안, 기존 `GAME_RESULT_OFFICIAL` writeOutbox 호출(`~2955-2963`, target이 `V1GameResultRevisionState.OFFICIAL`일 때) 바로 다음:

```ts
if (target === V1GameResultRevisionState.OFFICIAL) {
  await this.writeOutbox(
    tx,
    `review-risk-sweep:team_match:${game.teamMatchId}`,
    gameId,
    'REVIEW_RISK_SWEEP_DUE',
    { sourceType: 'team_match', sourceId: game.teamMatchId },
    decided.id,
  );
}
```

`availableAt`은 `writeOutbox()` 시그니처에 없다(항상 `default(now())`) — Task 1에서 스키마를 이미 확정했으므로 여기서 `v1OutboxEvent.create`에 `availableAt`을 직접 넘기려면 `writeOutbox()` 헬퍼에 optional 파라미터를 추가해야 한다. `writeOutbox()`(`games.service.ts` private 메서드, 실측 시그니처 `(tx, businessKey, gameId, type, payload, revisionId?)`)에 6번째 optional 인자를 추가:

```diff
   private async writeOutbox(
     tx: Transaction,
     businessKey: string,
     gameId: string,
     type: GamesOutboxEventType,
     payload: unknown,
     revisionId?: string,
+    availableAt?: Date,
   ) {
     await tx.v1OutboxEvent.create({
       data: {
         businessKey,
         aggregateType: 'GAME',
         aggregateId: gameId,
         revisionId,
         type,
         payload: jsonInput(payload),
+        ...(availableAt ? { availableAt } : {}),
       },
     });
   }
```

그리고 위 훅 호출에 7번째 인자로 `reviewRiskSweepAvailableAt(new Date())`를 추가한다(다음 스텝에서 만드는 공유 헬퍼).

- [ ] **Step 3: `availableAt` 계산 공유 헬퍼를 만든다**

`apps/v1_api/src/reviews/review-deadline.ts`(Task 4에서 만든 파일)에 추가:

```ts
const RISK_SWEEP_BUFFER_MINUTES = 10;

/** 결과 확정(officialAt) 시각으로부터 48h+10분 뒤 — 마지막 순간 제출까지 반영되도록 여유를 둔다. */
export function reviewRiskSweepAvailableAt(officialAt: Date): Date {
  return new Date(officialAt.getTime() + REVIEW_WINDOW_HOURS * 60 * 60 * 1000 + RISK_SWEEP_BUFFER_MINUTES * 60 * 1000);
}
```

단위 테스트 추가(`review-deadline.spec.ts`):
```ts
it('reviewRiskSweepAvailableAt은 확정 시각 + 48h10m이다', () => {
  const officialAt = new Date('2026-08-01T00:00:00.000Z');
  const result = reviewRiskSweepAvailableAt(officialAt);
  expect(result.toISOString()).toBe('2026-08-03T00:10:00.000Z');
});
```

- [ ] **Step 4: tournament_fixture officialize에 훅을 추가한다**

`tournament-result-review.service.ts:487-520`, 기존 `GAME_RESULT_OFFICIAL` writeOutbox 호출(`:510-516`) 다음:

```ts
if (game.tournamentFixtureId !== null) {
  await this.writeOutbox(
    tx,
    `review-risk-sweep:tournament_fixture:${game.tournamentFixtureId}`,
    gameId,
    'REVIEW_RISK_SWEEP_DUE',
    { sourceType: 'tournament_fixture', sourceId: game.tournamentFixtureId },
    officialized.id,
  );
}
```

이 파일의 `writeOutbox()`(`:1310-1322`)는 `type: string`이라 시그니처 변경이 필요 없지만, `availableAt`을 넘기려면 이 파일에서도 동일하게 optional 6번째 인자를 추가한다(Step 2와 대칭). 호출 시 `reviewRiskSweepAvailableAt(officialized.officialAt)`를 넘긴다.

- [ ] **Step 5: `match`에는 이 훅을 추가하지 않는다는 것을 확인한다(D-12)**

`match`(개인 매치)는 Game 엔진을 타지 않는다(스펙 §1.2.2, 실측 확인 — `matches.service.ts`에 `complete()` 메서드 자체가 없다) — 따라서 이 Task가 훅을 건 두 지점(games.service.ts의 TEAM_MATCH 전용 `decideResultRevision`, tournament-result-review.service.ts의 officialize) 중 어느 쪽도 `match` 소스에 대해 호출되지 않는다. **별도 분기 코드가 필요 없다** — Game 엔진 자체가 `match`를 다루지 않으므로 자연히 제외된다. 이 사실을 검증하는 회귀 주석을 두 훅 옆에 남긴다.

- [ ] **Step 6: 타입 체크**

Run: `cd apps/v1_api && ./node_modules/.bin/tsc --noEmit`

- [ ] **Step 7: 기존 games.service.spec.ts / tournament-result-review.service.spec.ts 회귀를 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns "games.service|tournament-result-review.service"`
Expected: PASS(기존 outbox 관련 테스트가 `writeOutbox` 호출 횟수를 정확히 세고 있다면 새 호출이 추가돼 깨질 수 있다 — 깨지면 그 테스트가 이번에 의도적으로 늘어난 호출을 반영하도록 기대치를 갱신한다. 스펙과 무관한 다른 어서션이 깨지면 회귀이므로 원인을 먼저 규명한다).

- [ ] **Step 8: 커밋한다**

```bash
git add apps/v1_api/src/games/games.service.ts \
        apps/v1_api/src/tournament-operations/results/tournament-result-review.service.ts \
        apps/v1_api/src/reviews/review-deadline.ts \
        apps/v1_api/src/reviews/review-deadline.spec.ts
git commit -m "feat(reviews): 결과 확정 시 이상탐지 outbox 이벤트 스케줄"
git show --stat HEAD
```

---

## Task 10: risk sweep 워커 핸들러 — 판정 + flagged 전이 (§7.2)

**Files:**
- Create: `apps/v1_api/src/reviews/review-risk-sweep.service.ts`
- Create: `apps/v1_api/src/reviews/review-risk-sweep.service.spec.ts`
- Modify: `apps/v1_api/src/jobs/v1-game-operations-worker.service.ts` (`registerHandler` 등록)
- Modify: `apps/v1_api/src/reviews/reviews.module.ts`

**Interfaces:**
- Consumes: `GameOperationHandler = (claim, tx) => Promise<void>`(기존 worker 타입), `detectExtremeLowOutlier`/`detectUniformTeamExtreme`/`detectRepeatedLowPair`(Task 8)
- Produces: `ReviewRiskSweepService.handler: GameOperationHandler`

> 근거: 스펙 §7.2·§10. `v1-game-operations-worker.service.ts`(`registerHandler('GAME_RESULT_OFFICIAL', ...)` 패턴, 실측 확인)와 동일한 등록 방식을 재사용한다.

- [ ] **Step 1: claim payload 타입과 후보 리뷰 조회 쿼리를 설계한다**

`claim.payload`는 Task 9에서 실은 `{ sourceType: 'team_match' | 'tournament_fixture'; sourceId: string }`. 핸들러는 이 payload로 관련 리뷰 후보군을 3가지 형태로 각각 준비해야 한다(Task 8의 각 함수가 요구하는 Map 구조):

- `EXTREME_LOW_OUTLIER`: 판정 대상 작성자들(이 소스에 리뷰를 쓴 사람들)의 **최근 N건**(전체 히스토리, 이 소스에 국한되지 않음) — 코호트 평균/표준편차는 **전체 리뷰 모집단**에서 계산.
- `UNIFORM_TEAM_EXTREME`: **이 소스 1건**에 대한 리뷰만(위 payload의 sourceId로 필터).
- `REPEATED_LOW_PAIR`: 이 소스의 리뷰 작성자-대상 조합별로 **그 조합의 전체 히스토리**(여러 대회에 걸침) — `sourceGroupId`(대회) 단위 판정이므로 tournament_fixture만 대상(§7.2 규칙 자체가 "최근 3개 대회").

- [ ] **Step 2: 실패하는 테스트를 작성한다(핵심 흐름 위주 — DB 의존은 mock)**

`apps/v1_api/src/reviews/review-risk-sweep.service.spec.ts`:

```ts
import { ReviewRiskSweepService } from './review-risk-sweep.service';

describe('ReviewRiskSweepService.handler', () => {
  function makeTx(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      v1PostEventReview: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      v1PostEventReviewRiskFlag: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      ...overrides,
    };
  }

  it('판정된 규칙이 없으면 아무 것도 쓰지 않는다', async () => {
    const service = new ReviewRiskSweepService();
    const tx = makeTx();
    await service.handler(
      { id: 'claim1', businessKey: 'bk', aggregateType: 'GAME', aggregateId: 'g1', revisionId: null, type: 'REVIEW_RISK_SWEEP_DUE', payload: { sourceType: 'tournament_fixture', sourceId: 'fx1' }, attempts: 0, retryGeneration: 0, version: 0, leaseOwner: 'o', leaseUntil: new Date() },
      tx as any,
    );
    expect(tx.v1PostEventReviewRiskFlag.upsert).not.toHaveBeenCalled();
  });

  it('UNIFORM_TEAM_EXTREME이 판정되면 관련 리뷰 전부를 flagged로 전이하고 groupKey를 공유하는 risk flag row를 만든다', async () => {
    // arrange: findMany가 같은 소스에 대해 한 팀이 전원 1점을 준 2건을 반환하도록 mock
    // act: handler 호출
    // assert: v1PostEventReviewRiskFlag.upsert가 리뷰 2건 각각에 대해(reviewId, ruleCode) unique 키로 2회 호출되고
    //         두 호출의 data.groupKey가 동일, v1PostEventReview.updateMany({ where: { id: { in: [r1,r2] } }, data: { status: 'flagged' } })가 호출됨
  });

  it('idempotent 재실행 — 같은 판정을 다시 돌려도 risk flag row가 늘지 않는다(upsert)', async () => {
    // upsert 사용 자체가 (reviewId, ruleCode) unique로 idempotent함을 재확인하는 테스트
  });
});
```

- [ ] **Step 3: 구현한다**

`apps/v1_api/src/reviews/review-risk-sweep.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { GameOperationClaim, GameOperationHandler } from '../jobs/v1-game-operations-worker.service';
import type { Prisma } from '@prisma/client';
import {
  detectExtremeLowOutlier,
  detectRepeatedLowPair,
  detectUniformTeamExtreme,
  type RiskCandidateReview,
  type RiskFinding,
} from './review-risk-rules';

type SweepPayload = { sourceType: 'team_match' | 'tournament_fixture'; sourceId: string };

function isSweepPayload(payload: unknown): payload is SweepPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'sourceType' in payload &&
    'sourceId' in payload
  );
}

@Injectable()
export class ReviewRiskSweepService {
  handler: GameOperationHandler = async (claim: GameOperationClaim, tx: Prisma.TransactionClient) => {
    if (!isSweepPayload(claim.payload)) return; // 방어적 — 이 타입 이벤트는 항상 이 shape이어야 한다
    const { sourceType, sourceId } = claim.payload;

    const sourceReviews = await tx.v1PostEventReview.findMany({
      where: { sourceType, sourceId, status: 'submitted' },
      select: {
        id: true, reviewerUserId: true, reviewerTeamId: true,
        targetUserId: true, targetTeamId: true, sourceGroupId: true, rating: true,
      },
    });
    if (sourceReviews.length === 0) return;

    const toCandidate = (r: (typeof sourceReviews)[number]): RiskCandidateReview => ({
      reviewId: r.id,
      reviewerUserId: r.reviewerUserId,
      reviewerTeamId: r.reviewerTeamId,
      targetUserId: r.targetUserId,
      targetTeamId: r.targetTeamId,
      sourceGroupId: r.sourceGroupId,
      compositeScore: r.rating,
    });

    const findings: RiskFinding[] = [];

    // 규칙 2: 이 소스 내 (reviewerTeamId) 그룹
    const byReviewerTeam = new Map<string, RiskCandidateReview[]>();
    for (const r of sourceReviews) {
      if (!r.reviewerTeamId) continue;
      const key = `${sourceId}:${r.reviewerTeamId}`;
      const bucket = byReviewerTeam.get(key) ?? [];
      bucket.push(toCandidate(r));
      byReviewerTeam.set(key, bucket);
    }
    findings.push(...detectUniformTeamExtreme(byReviewerTeam));

    // 규칙 1: 이 소스의 작성자별로, 그 작성자의 전체 히스토리(최근순) + 전체 코호트 평균/표준편차
    const reviewerUserIds = [...new Set(sourceReviews.map((r) => r.reviewerUserId))];
    const cohort = await tx.v1PostEventReview.aggregate({
      where: { status: 'submitted' },
      _avg: { rating: true },
    });
    const cohortAverage = cohort._avg.rating ?? 3;
    // 표준편차는 Prisma aggregate가 직접 지원하지 않아 raw로 낸다.
    const stddevRow = await tx.$queryRaw<{ stddev: number | null }[]>`
      SELECT STDDEV_POP(rating)::float AS stddev FROM v1_post_event_reviews WHERE status = 'submitted'
    `;
    const cohortStdDev = stddevRow[0]?.stddev ?? 1;

    const byReviewer = new Map<string, RiskCandidateReview[]>();
    for (const userId of reviewerUserIds) {
      const recent = await tx.v1PostEventReview.findMany({
        where: { reviewerUserId: userId, status: 'submitted' },
        orderBy: { submittedAt: 'desc' },
        take: 20, // "최근 N건" — N=20은 추정치, 튜닝 대상(§13)
        select: { id: true, reviewerUserId: true, reviewerTeamId: true, targetUserId: true, targetTeamId: true, sourceGroupId: true, rating: true },
      });
      byReviewer.set(userId, recent.map(toCandidate));
    }
    findings.push(...detectExtremeLowOutlier(byReviewer, cohortAverage, cohortStdDev));

    // 규칙 3: tournament_fixture만 — 이 소스의 (reviewerTeamId/reviewerUserId → targetTeamId/targetUserId) 조합별 전체 히스토리
    if (sourceType === 'tournament_fixture') {
      const pairs = [...new Set(sourceReviews.map((r) => `${r.reviewerTeamId ?? r.reviewerUserId}:${r.targetTeamId ?? r.targetUserId}`))];
      const byPair = new Map<string, RiskCandidateReview[]>();
      for (const pairKey of pairs) {
        const [reviewerScope, targetScope] = pairKey.split(':');
        const history = await tx.v1PostEventReview.findMany({
          where: {
            sourceType: 'tournament_fixture',
            status: 'submitted',
            OR: [
              { reviewerTeamId: reviewerScope, targetTeamId: targetScope },
              { reviewerUserId: reviewerScope, targetUserId: targetScope },
            ],
          },
          select: { id: true, reviewerUserId: true, reviewerTeamId: true, targetUserId: true, targetTeamId: true, sourceGroupId: true, rating: true },
        });
        byPair.set(pairKey, history.map(toCandidate));
      }
      findings.push(...detectRepeatedLowPair(byPair));
    }

    if (findings.length === 0) return;

    const flaggedReviewIds = new Set<string>();
    for (const finding of findings) {
      for (const reviewId of finding.reviewIds) {
        flaggedReviewIds.add(reviewId);
        await tx.v1PostEventReviewRiskFlag.upsert({
          where: { reviewId_ruleCode: { reviewId, ruleCode: finding.ruleCode } },
          update: { groupKey: finding.groupKey, riskScore: finding.riskScore, signal: finding.signal, status: 'pending' },
          create: {
            reviewId, ruleCode: finding.ruleCode, groupKey: finding.groupKey,
            riskScore: finding.riskScore, signal: finding.signal, status: 'pending',
          },
        });
      }
    }

    await tx.v1PostEventReview.updateMany({
      where: { id: { in: [...flaggedReviewIds] } },
      data: { status: 'flagged' },
    });

    // §10: flagged 전이가 집계를 어긋나게 하지 않도록, 영향받은 대상 전부를 같은 트랜잭션에서
    // 재계산한다 — 대상 목록은 flagged된 리뷰들의 targetUserId/targetTeamId 집합.
    // 재계산 함수 호출은 recalculateForReview() 패턴(reviews.service.ts:126-146)과 동일한
    // 모양이므로, 순환 의존(ReviewRiskSweepService ↔ ReviewsService)을 피하기 위해
    // 이 서비스가 ReviewsService를 주입받아 그 private 메서드를 호출할 수 없다 — 재계산 함수를
    // reviews.service.ts 밖으로 뽑아 공유하거나(권장, 신규 review-recalculation.ts), ReviewsService에
    // public 래퍼를 추가한다. **구현 시 확정** — 이 스텝은 자리만 잡아 둔다.
  };
}
```

> **구현 시 확정 필요**: 위 코드의 마지막 블록(flagged 전이 후 재계산 호출)은 `recalculateUserReputation`/`recalculateTeamTrust`/`recalculateTournamentUserReputation`/`recalculateTournamentFixtureTeamTrust` 4개 함수 중 관련 대상에 맞는 것을 호출해야 하는데, 이 중 2개는 `ReviewsService`의 **private** 메서드다(`reviews.service.ts:1010`, `:1038`, 실측 확인). `ReviewRiskSweepService`가 `ReviewsService`를 주입받아 private 메서드를 호출할 수 없으므로, 다음 중 하나를 택해 이 스텝에서 리팩터한다: (a) 이 2개 함수를 `reviews.service.ts` 밖의 신규 공유 모듈(`review-recalculation.ts`)로 뽑아 `tournament-fixture-review-reputation.ts`/`tournament-fixture-review-trust.ts`와 나란히 두고 `ReviewsService`와 `ReviewRiskSweepService` 양쪽이 import, (b) `ReviewsService`에 `recalculateForReviewPublic(tx, review)` 같은 public 래퍼를 추가해 위임. **(a)를 권장** — Task 6·7이 이미 4개 함수를 거의 동형으로 다루고 있어 한 파일로 모으면 advisory lock 스코프 키 정의도 한 곳에 모여 유지보수가 쉬워진다. 이 리팩터는 Task 6/7 커밋과 별도로 이 Task에서 수행한다(파일 이동은 이 Task의 diff에 포함).

- [ ] **Step 4: 워커에 핸들러를 등록한다**

`apps/v1_api/src/jobs/v1-game-operations-worker.service.ts` 생성자(기존 `registerHandler('GAME_RESULT_OFFICIAL', ...)` 호출부 근처)에 추가:

```ts
import { ReviewRiskSweepService } from '../reviews/review-risk-sweep.service';
// ...
if (process.env.DISABLE_REVIEW_RISK_SWEEP !== 'true') {
  const riskSweep = new ReviewRiskSweepService();
  this.registerHandler('REVIEW_RISK_SWEEP_DUE', riskSweep.handler);
}
```

> `DISABLE_REVIEW_RISK_SWEEP`는 이 저장소의 `DISABLE_MARKETPLACE_CRON`/`DISABLE_OPS_ALERT_CRON` 선례와 동일한 opt-out 패턴이다(CLAUDE.md Known Blockers 2·3 참조) — 배포는 항상 가능하게 하되, 임계값이 튜닝되지 않은 상태에서 자동 FLAGGED 전이가 프로덕션에 나가는 것이 우려되면 이 변수로 끌 수 있다. **다만 이 플래그는 "이상탐지 전체를 끄는" 스위치이지, 스펙 §14가 묻는 "관찰 모드(리스크 스코어만 기록, status는 안 바꿈)"와는 다르다** — 관찰 모드가 필요하면 `handler` 안의 `tx.v1PostEventReview.updateMany(...status:'flagged')` 호출만 별도 플래그로 skip하는 추가 분기가 필요하고, 이는 사용자가 §14를 결정한 뒤 별도로 추가한다.

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns review-risk-sweep`
Expected: PASS

- [ ] **Step 6: 타입 체크**

Run: `cd apps/v1_api && ./node_modules/.bin/tsc --noEmit`

- [ ] **Step 7: 통합 테스트를 작성한다 — ⚠️ 이 환경에서는 실행 보류(DB 없음)**

`apps/v1_api/test/integration/review-risk-sweep.e2e-spec.ts`(신규, 파일만 작성): 스펙 §11의 "이상 탐지 flagged 전이" 시나리오 — 3규칙 각각 positive 1건 + negative 1건, groupKey 공유 확인, 집계(`metric*Score`)에서 실제로 제외되는지 13개 호출부 코드 변경 없이 확인. `resolve(active)`/`resolve(excluded)` 양쪽 경로 검증은 Task 11 이후 이 파일에 추가한다.

- [ ] **Step 8: 커밋한다**

```bash
git add apps/v1_api/src/reviews/review-risk-sweep.service.ts \
        apps/v1_api/src/reviews/review-risk-sweep.service.spec.ts \
        apps/v1_api/src/jobs/v1-game-operations-worker.service.ts \
        apps/v1_api/src/reviews/reviews.module.ts \
        apps/v1_api/test/integration/review-risk-sweep.e2e-spec.ts
git commit -m "feat(reviews): risk sweep 워커 핸들러 — 판정 + flagged 전이"
git show --stat HEAD
```

---

## Task 11: 운영 검토 엔드포인트 (§7.3)

**Files:**
- Create: `apps/v1_api/src/reviews/admin/review-flags.controller.ts`
- Create: `apps/v1_api/src/reviews/admin/review-flags-admin.service.ts`
- Create: `apps/v1_api/src/reviews/dto/resolve-review-flags.dto.ts`
- Modify: `apps/v1_api/src/reviews/reviews.module.ts`

**Interfaces:**
- Produces: `GET /reviews/admin/flags?status=pending`, `POST /reviews/admin/flags/groups/:groupKey/resolve`

> **정정 — 스펙 §7.3의 "platform_ops 역할 게이트 재사용" 제안과 다르게 구현한다.** 스펙은 `tournament-operations-staff.service.ts:258`의 `platform_ops` 게이트 재사용을 제안했지만, 실측 확인 결과 그 게이트(`access.assertAccess({ tournamentId, ... })`)는 **대회(tournamentId) 스코프 전제**의 권한 체크이고 `V1TournamentOperationsStaff` 배정 모델에 묶여 있다 — 리스크 플래그는 `team_match` 소스(대회와 무관)도 다루므로 이 게이트가 구조적으로 맞지 않는다. 반면 **같은 파일(`reviews.service.ts:73-107`, 실측 확인)에 이미 hide/unhide 어드민 엔드포인트가 `AdminContextService.getMutationAdmin()`(V1AdminUser·adminRole `ops`/`owner`, 대회 스코프 없음)로 구현돼 있다** — 이 계획은 그 기존 패턴을 재사용한다(스펙의 "운영 검토"라는 목적은 동일하게 달성하며, D-9 자체를 바꾸지 않는다).

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`apps/v1_api/src/reviews/admin/review-flags-admin.service.spec.ts`(신규):

```ts
describe('ReviewFlagsAdminService', () => {
  it('listFlags(status=pending)는 groupKey로 묶인 목록을 반환한다', async () => {
    // arrange: risk flag 3건(groupKey A 2건 + groupKey B 1건)
    // act: listFlags(admin, { status: 'pending' })
    // assert: 2개 그룹으로 묶여 반환
  });

  it("resolveGroup(decision='active')는 groupKey 전체 리뷰를 flagged→submitted로 되돌리고 영향받은 대상을 재계산한다", async () => {
    // assert: v1PostEventReview.updateMany({ status: 'submitted' }), risk flag status는 'resolved_active',
    //         재계산 함수가 영향받은 targetUserId/targetTeamId마다 호출됨
  });

  it("resolveGroup(decision='excluded')는 리뷰 status를 유지하고 risk flag만 resolved_excluded로 바꾼다", async () => {
    // assert: v1PostEventReview.updateMany 호출 없음(또는 status 변경 없는 no-op), risk flag status만 갱신
  });

  it('support 등급 어드민은 resolveGroup을 호출할 수 없다', async () => {
    // AdminContextService.getMutationAdmin이 support에 대해 던지는 403을 그대로 전파하는지 확인
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns review-flags-admin`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: DTO를 작성한다**

`apps/v1_api/src/reviews/dto/resolve-review-flags.dto.ts`:

```ts
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveReviewFlagGroupDto {
  @IsIn(['active', 'excluded'])
  decision!: 'active' | 'excluded';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
```

- [ ] **Step 4: 서비스를 구현한다**

`apps/v1_api/src/reviews/admin/review-flags-admin.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminContextService } from '../../common/admin-context.service';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { ResolveReviewFlagGroupDto } from '../dto/resolve-review-flags.dto';
// Task 10에서 뽑은 공유 재계산 모듈 — 정확한 경로는 Task 10 구현 결과에 맞춘다.
import { recalculateForReview } from '../review-recalculation';

@Injectable()
export class ReviewFlagsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  async listFlags(user: V1AuthUser, status: 'pending' | 'resolved_active' | 'resolved_excluded' = 'pending') {
    await this.adminContext.getActiveAdmin(user.id);
    const flags = await this.prisma.v1PostEventReviewRiskFlag.findMany({
      where: { status },
      orderBy: [{ createdAt: 'desc' }],
      include: { review: { select: { id: true, sourceType: true, sourceId: true, targetUserId: true, targetTeamId: true, rating: true } } },
    });
    const byGroup = new Map<string, typeof flags>();
    for (const flag of flags) {
      const bucket = byGroup.get(flag.groupKey) ?? [];
      bucket.push(flag);
      byGroup.set(flag.groupKey, bucket);
    }
    return [...byGroup.entries()].map(([groupKey, items]) => ({
      groupKey,
      ruleCode: items[0].ruleCode,
      riskScore: Math.max(...items.map((i) => i.riskScore)),
      createdAt: items[0].createdAt.toISOString(),
      reviews: items.map((i) => ({ reviewId: i.reviewId, signal: i.signal, review: i.review })),
    }));
  }

  async resolveGroup(user: V1AuthUser, groupKey: string, dto: ResolveReviewFlagGroupDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const flags = await this.prisma.v1PostEventReviewRiskFlag.findMany({
      where: { groupKey, status: 'pending' },
      include: { review: { select: { id: true, sourceType: true, targetType: true, targetUserId: true, targetTeamId: true } } },
    });
    if (flags.length === 0) return { resolved: false, reason: 'NO_PENDING_FLAGS' };

    await this.prisma.$transaction(async (tx) => {
      if (dto.decision === 'active') {
        await tx.v1PostEventReview.updateMany({
          where: { id: { in: flags.map((f) => f.reviewId) } },
          data: { status: 'submitted' },
        });
        const seen = new Set<string>();
        for (const flag of flags) {
          const key = `${flag.review.targetType}:${flag.review.targetUserId ?? flag.review.targetTeamId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          await recalculateForReview(tx, flag.review);
        }
      }
      await tx.v1PostEventReviewRiskFlag.updateMany({
        where: { groupKey, status: 'pending' },
        data: {
          status: dto.decision === 'active' ? 'resolved_active' : 'resolved_excluded',
          resolvedByUserId: admin.userId,
          resolvedAt: new Date(),
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'review.flag_group.resolve',
          targetType: 'post_event_review_risk_flag_group',
          targetId: groupKey,
          reason: dto.note ?? null,
          beforeJson: { status: 'pending', reviewCount: flags.length },
          afterJson: { decision: dto.decision },
        },
        tx,
      );
    });
    return { resolved: true, decision: dto.decision, reviewCount: flags.length };
  }
}
```

- [ ] **Step 5: 컨트롤러를 작성한다**

`apps/v1_api/src/reviews/admin/review-flags.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { ResolveReviewFlagGroupDto } from '../dto/resolve-review-flags.dto';
import { ReviewFlagsAdminService } from './review-flags-admin.service';

@Controller('reviews/admin/flags')
@UseGuards(V1AuthGuard)
export class ReviewFlagsController {
  constructor(private readonly service: ReviewFlagsAdminService) {}

  @Get()
  list(@CurrentUser() user: V1AuthUser, @Query('status') status?: 'pending' | 'resolved_active' | 'resolved_excluded') {
    return this.service.listFlags(user, status);
  }

  @Post('groups/:groupKey/resolve')
  resolve(
    @CurrentUser() user: V1AuthUser,
    @Param('groupKey') groupKey: string,
    @Body() dto: ResolveReviewFlagGroupDto,
  ) {
    return this.service.resolveGroup(user, groupKey, dto);
  }
}
```

> 라우트는 `/reviews/admin/flags*`로 두어 기존 `reviews.controller.ts`의 `admin/:reviewId/hide|unhide`와 같은 `reviews/admin/*` prefix 관례를 따른다(스펙 §9.4의 `/admin/reviews/flags*` 제안과 경로 순서만 다르다 — 이 저장소는 `TeamsModule`/`AdminModule`이 이미 `/admin/*`을 여러 도메인에서 공유하고 있어, 리뷰 도메인 전용 어드민 라우트를 `reviews/admin/*`으로 두면 컨트롤러가 이 모듈 안에 자연스럽게 소재한다 — 기존 hide/unhide가 이미 그렇게 돼 있다).

- [ ] **Step 6: 모듈에 등록한다**

`reviews.module.ts`에 `ReviewFlagsController`/`ReviewFlagsAdminService` 추가.

- [ ] **Step 7: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns review-flags-admin`
Expected: PASS

- [ ] **Step 8: 타입 체크**

Run: `cd apps/v1_api && ./node_modules/.bin/tsc --noEmit`

- [ ] **Step 9: 커밋한다**

```bash
git add apps/v1_api/src/reviews/admin/ \
        apps/v1_api/src/reviews/dto/resolve-review-flags.dto.ts \
        apps/v1_api/src/reviews/reviews.module.ts
git commit -m "feat(reviews): FLAGGED 운영 검토 엔드포인트 추가"
git show --stat HEAD
```

---

## Task 12: 경기 무효(VOID) → `archived` 전이 (§7.4)

**Files:**
- Modify: `apps/v1_api/src/tournament-operations/results/tournament-result-review.service.ts` (`voidResultRevision:546-612`)

**Interfaces:**
- Consumes: 없음(같은 트랜잭션 내 update)

> 근거: 스펙 §7.4. `voidResultRevision()`(`:546-612`, 실측 확인)이 `game.tournamentFixtureId`/`game.teamMatchId`를 이미 갖고 있고, `sourceGroupId`(대회 스코프)까지 필요하다면 fixture를 통해 `tournamentId`를 추가 조회해야 한다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`tournament-result-review.service.spec.ts`에 추가:

```ts
it('결과가 VOID되면 해당 소스의 submitted 리뷰 전부를 archived로 전이한다', async () => {
  // arrange: fixture에 submitted 리뷰 2건
  // act: voidResultRevision(...)
  // assert: v1PostEventReview.updateMany({ where: { sourceType, sourceId, status: 'submitted' }, data: { status: 'archived' } })가 호출됨
});

it('점수 정정(officialize 재실행)만으로는 리뷰를 건드리지 않는다(회귀)', async () => {
  // 기존 officialize 경로에 이 훅이 없음을 확인 — VOID 전용
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns tournament-result-review.service`

- [ ] **Step 3: `voidResultRevision`에 훅을 추가한다**

`:601-611`, 기존 `GAME_RESULT_VOIDED` writeOutbox 호출 앞 또는 뒤(트랜잭션 안이면 순서 무관):

```ts
const archiveSourceType = game.tournamentFixtureId !== null ? 'tournament_fixture' : 'team_match';
const archiveSourceId = game.tournamentFixtureId ?? game.teamMatchId;
if (archiveSourceId) {
  await tx.v1PostEventReview.updateMany({
    where: { sourceType: archiveSourceType, sourceId: archiveSourceId, status: 'submitted' },
    data: { status: 'archived' },
  });
}
```

> `match`는 이 경로(Game 엔진)를 타지 않으므로 자연히 대상이 아니다(Task 9 Step 5와 동일 근거).

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns tournament-result-review.service`
Expected: PASS

- [ ] **Step 5: 타입 체크 + 커밋**

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit
git add apps/v1_api/src/tournament-operations/results/tournament-result-review.service.ts \
        apps/v1_api/src/tournament-operations/results/tournament-result-review.service.spec.ts
git commit -m "feat(reviews): 경기 무효(VOID) 시 관련 리뷰를 archived로 전이"
git show --stat HEAD
```

> **PR 2 종료 지점.** PR을 열고 base가 `dev`인지 확인. `DISABLE_REVIEW_RISK_SWEEP`가 배포 직후 기본값(미설정 = 활성)으로 나가도 되는지는 §14 미결(관찰 모드 여부)과 별개로, 이 PR 자체는 룰 임계값이 추정치임을 PR 설명에 명시한다(스펙 §13 리스크 그대로 인용).

---

# PR 3 — 데이터 이관 리포트 + 프론트

## Task 13: 레거시 데이터 이관 dry-run 리포트 (§8, 파괴적 작업 아님)

**Files:**
- Create: `apps/v1_api/scripts/review-legacy-migration-report.ts`

**Interfaces:**
- Produces: 콘솔 출력 — `source_type`별 `scoringVersion` 분포 건수

> 근거: 스펙 §8. **이 Task는 실행 단계(destructive)가 없다** — D-4(rating 유지)·D-7(태그 데이터 보존)이 이미 확정 결정이라, 옵션 (b)("레거시 보존, 신규만 4항목")는 코드 계층에서 이미 자동으로 달성된다(레거시 리뷰는 `scoringVersion='legacy_single_rating'`, `metricScores` 비어 있음 — Task 6에서 그렇게 만들었다). 이 Task는 **§8.2가 요구하는 "실제 건수 확인" 하나만** 수행하는 읽기 전용 리포트다. 옵션 (c)("레거시 집계 제외")로 바꾸려면 `PERSONAL_REPUTATION_SOURCES`류 필터에 `scoringVersion` 조건을 추가하는 **별도 파괴적 변경**이 필요한데, 이는 스펙이 회귀로 규정한 경로(§8.1 "trustState가 순간 사라짐")라 **사용자가 건수를 보고 명시적으로 (c)를 선택하지 않는 한 구현하지 않는다.**

- [ ] **Step 1: 읽기 전용 리포트 스크립트를 작성한다**

`apps/v1_api/scripts/review-legacy-migration-report.ts`(신규 — 프로덕션 대상은 `docs/ops/pr-review-visual-workflow.md`의 read-only SSM 경로를 통해 실행, 이 스크립트 자체는 로컬 dev DB에도 그대로 재사용 가능하도록 `DATABASE_URL` 그대로 사용):

```ts
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw<
      { source_type: string; scoring_version: string; count: bigint }[]
    >`
      SELECT source_type, scoring_version, COUNT(*) AS count
      FROM v1_post_event_reviews
      GROUP BY source_type, scoring_version
      ORDER BY source_type, scoring_version
    `;
    console.table(rows.map((row) => ({ ...row, count: Number(row.count) })));

    const total = rows.reduce((sum, row) => sum + Number(row.count), 0);
    const legacyTotal = rows
      .filter((row) => row.scoring_version === 'legacy_single_rating')
      .reduce((sum, row) => sum + Number(row.count), 0);
    console.log(`총 ${total}건 중 legacy_single_rating ${legacyTotal}건 (${total ? Math.round((legacyTotal / total) * 100) : 0}%)`);
    console.log('스펙 §8.2 재검토 기준: 수십~수백 건 수준이면 (c) 재고 가치 있음, 건수가 많고 이미 verified 등급이 여럿이면 (b) 고정 — 이 결과를 사용자에게 보고하고 §14 결정을 요청한다.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: 타입 체크**

Run: `cd apps/v1_api && ./node_modules/.bin/tsc --noEmit`

- [ ] **Step 3: 실행 — ⚠️ 이 환경에서는 보류(DB 없음)**

이 저장소는 PUBLIC이다 — 실행 결과(실제 건수)를 이 계획 문서나 PR 코멘트에 프로덕션 절대수치로 올릴 때도 `docs/ops/`의 "집계 수치만, 식별자 없음" 원칙을 따른다(사용자 메모리 `public-repo-never-post-prod-identifiers`). 실행은 `prod-db-readonly-via-ssm` 절차(사용자 메모리)로 사용자 또는 후속 세션이 별도로 수행하고, 결과를 스펙 §14 결정 요청과 함께 사용자에게 보고한다.

- [ ] **Step 4: 커밋한다**

```bash
git add apps/v1_api/scripts/review-legacy-migration-report.ts
git commit -m "chore(reviews): 레거시 리뷰 이관 dry-run 건수 리포트 스크립트 추가"
git show --stat HEAD
```

> **§14 미결 — 사용자 결정 대기:** 이 스크립트 실행 결과를 사용자에게 보고하고 "(b) 레거시 보존 유지"(기본, 이미 구현됨) vs "(c) 레거시 집계 제외로 축소"를 물은 뒤에만 (c) 관련 후속 작업을 시작한다. 이 계획은 (c)의 구현 스텝을 포함하지 않는다.

---

## Task 14: 프론트 — 4항목 제출 폼 전환 (breaking, D-12 sourceType별 마감 문구 분기)

**Files:**
- Modify: `apps/v1_web/src/components/reviews/reviews.types.ts`
- Modify: `apps/v1_web/src/components/reviews/reviews-api-clients.tsx:46-150` (`ReviewSourcePageClient`)
- Modify: `apps/v1_web/src/types/api.ts`

**Interfaces:**
- Consumes: `POST /reviews`(Task 5·6, 4항목 `scores` 필수)
- Produces: `ReviewTargetDraft = { scores: { skill, manner, punctuality, safety } }`(기존 `{ rating, tagCodes }` 대체)

> 근거: 실측 — `ReviewTargetDraft`(`reviews.types.ts:32-35`), `ReviewSourcePageClient`(`reviews-api-clients.tsx:46-150`, `setRating`/`toggleTag`/제출 루프 확인). 스펙 §13 리스크: "`match` 화면에는 48h 마감 문구를 노출하지 않도록 sourceType별 분기 필요."

- [ ] **Step 1: 타입을 4항목으로 바꾼다**

`reviews.types.ts:32-35`:

```diff
-export type ReviewTargetDraft = {
-  rating: number;
-  tagCodes: string[];
-};
+export type ReviewTargetDraft = {
+  scores: { skill: number; manner: number; punctuality: number; safety: number };
+};
```

`apps/v1_web/src/types/api.ts`의 `V1ReviewTarget`/`V1ReceivedReviewDetail`(정확한 타입명은 파일을 열어 확인)에 `scores`/`compositeScore`/`scoringVersion` 필드를 추가하고 기존 `rating`/`tags`는 **레거시 조회용으로 유지**(D-7 — 레거시 리뷰 응답은 여전히 `tags`를 돌려준다, 스펙 §9.1 "레거시 리뷰 조회 시: `scores: null`, `tags: [...]`, `compositeScore`는 legacy `rating` 그대로").

- [ ] **Step 2: 제출 폼 컴포넌트를 4개 슬라이더로 바꾼다**

`reviews-api-clients.tsx:70-150` — 기존 `setRating`(단일 별점)·`toggleTag`(8종 프리셋)를 제거하고 4항목 각각 1~5 슬라이더/별점 위젯으로 교체:

```diff
-      const draft = drafts[key] ?? { rating: 4, tagCodes: [] };
+      const draft = drafts[key] ?? { scores: { skill: 4, manner: 4, punctuality: 4, safety: 4 } };
```

`setRating(key, rating)` → `setMetricScore(key, metric, score)`로 교체:

```ts
const setMetricScore = (key: string, metric: 'skill' | 'manner' | 'punctuality' | 'safety', score: number) => {
  setDrafts((current) => {
    const draft = current[key] ?? { scores: { skill: 4, manner: 4, punctuality: 4, safety: 4 } };
    return { ...current, [key]: { scores: { ...draft.scores, [metric]: score } } };
  });
};
```

제출 payload 조립부(`:117-125` 근처):

```diff
-        const draft = drafts[key] ?? { rating: 4, tagCodes: [] };
+        const draft = drafts[key] ?? { scores: { skill: 4, manner: 4, punctuality: 4, safety: 4 } };
         ...
-          rating: draft.rating,
-          tagCodes: draft.tagCodes,
+          scores: draft.scores,
```

`toggleTag`/`isTagSelected`류 태그 관련 함수·마크업은 전부 제거한다(D-7 — 신규 제출은 태그가 없다).

- [ ] **Step 3: sourceType별 마감 문구를 분기한다(D-12)**

`ReviewSourcePageClient`(또는 화면 상단 안내 문구 렌더 지점)에서:

```tsx
{sourceType !== 'match' && (
  <p className="text-2xs text-gray-500 dark:text-gray-400">
    경기 확정 후 48시간 안에 평가해주세요.
  </p>
)}
```

`match`는 마감이 없으므로(D-12) 이 문구를 아예 렌더하지 않는다 — 문구를 "무기한"으로 바꾸는 게 아니라 **완전히 숨긴다**(스펙 §13 리스크가 지시한 그대로).

- [ ] **Step 4: `REVIEW_WINDOW_CLOSED`(410) 에러 처리**

제출 실패 처리 블록에 `extractErrorMessage(err, '...')` fallback 메시지 추가(레포 컨벤션):

```ts
const message = extractErrorMessage(err, '평가 가능 기간(48시간)이 지났어요.');
```

`REVIEW_WINDOW_CLOSED` 코드가 백엔드에서 오면 이 fallback이 그대로 적절한 문구가 되도록, 백엔드 메시지 자체를 해요체로 맞췄음을 재확인한다(Task 4 Step 5·6에서 이미 해요체 적용됨).

- [ ] **Step 5: 프론트 테스트**

Run: `cd apps/v1_web && pnpm test -- reviews`
Expected: PASS(기존 `rating`/`tagCodes` 참조 테스트가 있다면 함께 갱신 — 정확한 테스트 파일은 `apps/v1_web/src/components/reviews/` 아래 `*.test.tsx` 검색으로 확인)

- [ ] **Step 6: 타입 체크**

Run: `cd apps/v1_web && npx tsc --noEmit`

- [ ] **Step 7: 커밋한다**

```bash
git add apps/v1_web/src/components/reviews/reviews.types.ts \
        apps/v1_web/src/components/reviews/reviews-api-clients.tsx \
        apps/v1_web/src/types/api.ts
git commit -m "feat(web): 후기 제출 폼을 4항목 채점으로 전환 (breaking)"
git show --stat HEAD
```

---

## Task 15: 프론트 — 항목별 요약 표시 + legacy 배지 + 운영 FLAGGED 큐 화면

**Files:**
- Modify: `apps/v1_web/src/components/reviews/reviews-summary-dashboard.tsx`
- Create: `apps/v1_web/src/app/admin/reviews/flags/page.tsx`
- Create: `apps/v1_web/src/components/admin/review-flags-table.tsx`

**Interfaces:**
- Consumes: `GET /reviews/received/summary`(4항목 확장, Task 6), `GET /reviews/admin/flags`, `POST /reviews/admin/flags/groups/:groupKey/resolve`(Task 11)

> 근거: 스펙 §9.3(팀/유저 리뷰 요약 전용 엔드포인트 존재 여부 미확인) — 아래 Step 0에서 먼저 조사하고 시작한다(사용자 결정이 필요한 항목이 아니라 코드 검색으로 풀리는 사실 확인 갭).

- [ ] **Step 0: `GET /teams/:id/review-summary`, `/users/:id/review-summary` 존재 여부를 확인한다**

Run: `grep -rn "review-summary" apps/v1_api/src/teams/ apps/v1_api/src/users/`

있으면 그 응답 셰이프를 4항목으로 확장(신규 엔드포인트 불필요). 없으면 이미 존재하는 `receivedSummary()`(`GET /reviews/received/summary`)를 그대로 쓰는 것으로 충분한지 재확인 — 스펙 §9.3이 이미 "이미 동등한 기능이 존재하는지 확인 필요"라 적어 두었으므로, 없다고 확인되면 신규 엔드포인트 추가는 **이 Task 범위 밖**(스펙이 요구하지 않은 확장) — `receivedSummary()` 응답을 그대로 표시한다.

- [ ] **Step 1: 받은 후기 요약에 항목별 막대를 추가한다**

`reviews-summary-dashboard.tsx`(기존 컴포넌트, 104줄 — 실측) — 종합점수(`compositeScore`) 아래에 4개 막대(스킬/매너/시간엄수/안전) 추가. `metricReviewCount`가 `reviewCount`보다 작으면(레거시 리뷰가 섞여 있으면) "세부 항목은 N건부터 제공돼요" 안내(스펙 §4.5). 다크모드·터치타겟·`aria-label` 레포 기준(CLAUDE.md 프론트엔드 품질 기준) 그대로 적용.

- [ ] **Step 2: legacy 배지를 추가한다**

리뷰 개별 카드에서 `scoringVersion === 'legacy_single_rating'`이면 "이전 방식 후기" 배지(컬러만이 아니라 텍스트 병행 — 레포 규칙) 표시, `scores` 4항목 막대 대신 종합점수만 표시.

- [ ] **Step 3: 운영 FLAGGED 큐 화면을 만든다**

`apps/v1_web/src/app/admin/reviews/flags/page.tsx` — `GET /reviews/admin/flags?status=pending` 조회, `components/admin/review-flags-table.tsx`에서 groupKey 단위로 묶어 표시, "정상(active)"/"제외 확정(excluded)" 버튼 2개(레포 `components/ui/modal.tsx` 확인 모달 재사용 — 파괴적 결정이므로 클릭 즉시 반영이 아니라 확인 모달을 거친다). `V1AuthGuard` + 어드민 여부는 백엔드가 검증하므로 프론트는 401/403 응답 시 리다이렉트만 처리(레포 기존 어드민 페이지 패턴 확인 후 따른다, 예: `apps/v1_web/src/app/admin/`의 다른 페이지들이 쓰는 인증 체크 방식).

- [ ] **Step 4: 프론트 테스트 + 타입 체크**

Run: `cd apps/v1_web && pnpm test -- reviews && npx tsc --noEmit`

- [ ] **Step 5: 커밋한다**

```bash
git add apps/v1_web/src/components/reviews/reviews-summary-dashboard.tsx \
        apps/v1_web/src/app/admin/reviews/flags/page.tsx \
        apps/v1_web/src/components/admin/review-flags-table.tsx
git commit -m "feat(web): 후기 항목별 요약 표시 + legacy 배지 + 운영 FLAGGED 큐 화면"
git show --stat HEAD
```

---

## Task 16: alpha 시각 검증

**Files:** 없음(캡처 스크립트만, `scripts/` 내부)

- [ ] **Step 1: PR을 열고 dev에 머지한 뒤 alpha 배포를 확인한다**

```bash
gh run list --workflow deploy-alpha.yml --branch dev --limit 1 --json headSha,status,conclusion --jq '.[0]'
curl -fsSI https://alpha.teameet.co.kr/landing | grep -i 'x-teameet-\(release\|commit\)'
```

내 머지 커밋이 배포 SHA에 포함되는지 `git merge-base --is-ancestor`로 확인한다(레포 CLAUDE.md "Alpha 실측 검증" 절차 그대로).

- [ ] **Step 2: 스크린샷 캡처**

캡처 대상(📱390 / 📲768 / 🖥1440 3폭):
1. 경기 후기 제출 폼(4항목 슬라이더) — `team_match`/`tournament_fixture`/`match` 각각(마감 문구 분기 확인)
2. 받은 후기 요약(항목별 막대 + legacy 배지 혼재 화면)
3. 어드민 FLAGGED 큐 화면

캡처 스크립트는 `scripts/` 내부에 둔다(`/tmp`는 모듈 해석 실패). alpha에는 `flagged` 리뷰가 자연 발생하지 않을 수 있으므로, 필요하면 시드 데이터 또는 운영 API(레포 메모리 `alpha-live-game-state-via-ops-api` 절차 참고)로 3규칙 중 하나를 재현한다 — 재현이 과도하게 번거로우면 빈 상태(EmptyState) 화면 캡처로 대체하고 "flagged 리뷰 재현은 후속 검증"으로 명시한다.

- [ ] **Step 3: 갤러리를 PR 코멘트로 게시한다**

raw URL 200 확인 후 게시. **이 저장소는 public** — 프로덕션 UUID·실제 사용자명·엔드포인트는 올리지 않는다.

---

## Self-Review 결과

**1. 스펙 커버리지**

| 스펙 요구 | 담당 태스크 |
|---|---|
| §4.1 `V1PostEventReviewStatus` 값 추가 | Task 1 |
| §4.2 신규 enum 4종 | Task 1 |
| §4.3 `scoringVersion` | Task 1, 6 |
| §4.4 `V1PostEventReviewMetricScore` + CHECK | Task 1 |
| §4.5 `metric*` 컬럼 10개씩 | Task 1, 6 |
| §4.6 `V1PostEventReviewRiskFlag`(reviewId NOT NULL, groupKey) | Task 1, 10 |
| §5 실출전 게이트(tournament_fixture만, D-2) | Task 2, 3 |
| §6 48h 평가창(team_match/tournament_fixture만, D-12) | Task 4 |
| §7.1 outbox 트리거 | Task 9 |
| §7.2 이상탐지 3규칙 + N/M/K건 전부 flagged 전이 | Task 8, 10 |
| §7.3 운영 검토 엔드포인트(groupKey 단위) | Task 11 |
| §7.4 VOID → archived | Task 12 |
| §8 이관 계획(파괴적 아님, dry-run) | Task 13 |
| §9.1 API 계약(scores, compositeScore, breaking) | Task 5, 6, 14 |
| §9.2 오류 코드 매핑 | Task 3(`NOT_ACTUAL_PARTICIPANT`), 4(`REVIEW_WINDOW_CLOSED`) |
| §9.4 관리자 API | Task 11 |
| §10 정합성(advisory lock) | Task 7 |
| §11 검증 전략 8개 수용기준 | 각 태스크 테스트 스텝(Task 3·4·6·7·10에 매핑) |
| §12 마이그레이션·배포(단일 마이그레이션, PR 분할) | Task 1, PR 구조 전체 |

**갭 없음** — 스펙의 §1~§13 전 절이 최소 1개 태스크에 매핑된다.

**2. §14 미결 항목 처리 (임의 결정 금지 원칙 적용)**

| 미결 항목 | 이 계획의 처리 |
|---|---|
| D-3 공개 임계값(3건 게이트 승격 여부) | 어떤 태스크도 `review-visibility.ts`/reveal 로직을 건드리지 않는다 — 현행 유지가 곧 "결정 안 함"의 안전한 기본값(스펙도 이걸 "현행 유지" 옵션으로 이미 제시). Task 4 끝에 명시적 미결 표시 |
| 레거시 payload 이중 지원 기간 | Task 5에 두 개 경로(기본: 즉시 breaking / 대안: 이중 지원)를 **양쪽 다 코드로 준비**해 두고, 착수 전 확정을 요구하는 배너를 Task 제목 바로 아래 넣었다 |
| 이상 탐지 초기 자동화 수준(관찰 모드 vs 자동전이) | Task 10에서 메커니즘(자동 flagged 전이)은 §7.2 확정 설계대로 구현하되, `DISABLE_REVIEW_RISK_SWEEP` 전체 off 스위치만 기본 제공 — "판정은 기록하되 상태는 안 바꾸는" 세분화된 관찰 모드는 별도 플래그가 필요하다고 명시하고 이 계획에 포함하지 않았다 |
| `/teams/:id/review-summary` 등 전용 엔드포인트 존재 여부 | 사용자 결정이 아니라 조사 갭이므로 Task 15 Step 0에서 `grep`으로 먼저 확인하도록 배치(결정 대기 아님) |
| 프로덕션 리뷰 실제 건수 | Task 13이 읽기 전용 리포트만 만들고 실행·판단은 사용자에게 위임 — (c) 옵션의 구현은 이 계획에 없음 |

**3. 타입 일관성**

- `RiskCandidateReview`(Task 8) → `ReviewRiskSweepService.handler`(Task 10)의 `toCandidate()` 변환 — 필드 일치
- `RiskFinding.groupKey`(Task 8) → `V1PostEventReviewRiskFlag.groupKey`(Task 1) → `ReviewFlagsAdminService.listFlags()`의 그룹핑 키(Task 11) — 일관
- `ReviewScoreDto`(Task 5) → `compositeScoreFromMetrics()`(Task 6) 입력 타입 — 일치
- `MetricAverages`(Task 6) → `V1TeamTrustScore.metric*`/`V1UserReputationSummary.metric*` 컬럼(Task 1) — 필드명 대응(`SKILL→metricSkillScore` 등) 확인됨

**4. 알려진 구현 시 확정 지점 (Ambiguity 아님 — 코드 구조 확인 필요)**

- Task 6 Step 6·7: 팀/대회 단위 "그룹 평균의 평균" 구조를 metric 4항목에 어떻게 얹을지는 기존 `groupBy`/`revealGroups` 변수명을 파일에서 직접 읽고 맞춘다.
- Task 10: `recalculateUserReputation`/`recalculateTeamTrust`가 `ReviewsService`의 private 메서드라, risk-sweep 서비스가 호출하려면 공유 모듈로 뽑는 리팩터가 선행되어야 한다 — 이 계획은 (a) 안(신규 `review-recalculation.ts`)을 권장하되 구현 시점에 최종 확정한다.

이 두 지점은 "무엇을 할지"(요구사항)가 아니라 "기존 코드를 어떻게 재배치할지"(구현 세부)라 §6 원칙("모호함은 기획 재진입")의 대상이 아니다 — 리그전 계획(Task 5 Step 5)도 동일한 성격의 지점을 같은 방식으로 처리한 선례를 따랐다.

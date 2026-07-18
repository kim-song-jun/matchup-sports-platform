# Task 117 Implementation Plan - V1 Review Anonymized Aggregates

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 스펙 문서: `.github/tasks/117-v1-review-anonymized-aggregates.md` (Context/Goal/Ambiguity Log 참고)

**Goal:** 개인매치·팀매치 상호평가 리뷰(`V1PostEventReview`)를 대상자에게 개별(누가 몇 점을 줬는지) 노출 없이, 종목별 × 기간별(전체/월 선택) 집계 수치로만 보여주고, 상대와 상호 제출되거나 72시간이 지나야 그 리뷰가 집계에 반영되도록 만든다.

**Architecture:** `V1PostEventReview`에 `sportId`를 제출 시점에 스냅샷으로 기록한다(신규 컬럼, 과거 row는 backfill하지 않고 null로 남겨 "신규 규칙 적용 대상"의 자연스러운 컷오프로 쓴다). "공개(reveal)" 여부는 별도 상태 컬럼 없이 애플리케이션 코드에서 매번 계산한다(양쪽 다 제출됐는지 페어 조회 + `submittedAt` 기준 72시간 경과 여부) — cron 없음. 집계는 DB `aggregate()`가 아니라 애플리케이션 레벨에서 계산한다(공개 여부 판정 자체가 SQL 단일 쿼리로 표현하기 어려운 페어 조회를 필요로 하므로).

**Tech Stack:** NestJS 11 + Prisma 6 (백엔드), Next.js 16 + TanStack Query 5 (프론트), Jest(백엔드 유닛), Vitest(프론트 유닛).

## Global Constraints

- 스키마 변경은 반드시 migration 파일 동반, `IF NOT EXISTS`/`duplicate_object` 가드로 멱등 작성 (프로젝트 CLAUDE.md DB 마이그레이션 규율).
- 공유 dev DB(`teameet_v1_pg`)에 `prisma migrate dev/deploy`를 직접 실행하지 않는다 — `npx prisma generate`로 타입만 재생성, 실제 적용 검증은 CI의 migration replay + drift gate에 맡긴다.
- 에러 메시지는 해요체, `extractErrorMessage(err, fallback)` 사용(프론트).
- `filter.limit || 20` 대신 `?? 20` (nullish coalescing) — 숫자 기본값 규칙.
- 신규 프론트 컴포넌트는 다크모드 variant 없이 작성한다 — v1_web은 현재 light-only 컨벤션(`globals.css:11 color-scheme: light`)이 전역이므로 이 규칙을 따른다.
- 각 태스크 끝의 검증은 해당 태스크가 건드린 파일에 한정한다(풀스위트는 마지막 통합 태스크에서만).

---

## Task 1: sportId 컬럼 추가 (스키마 + 마이그레이션)

**Files:**
- Modify: `apps/v1_api/prisma/schema.prisma` (`model V1PostEventReview`, 871–907행 부근)
- Create: `apps/v1_api/prisma/migrations/<타임스탬프>_v1_post_event_review_sport/migration.sql`

**Interfaces:**
- Produces: `V1PostEventReview.sportId String?` — 이후 모든 태스크가 이 필드로 종목 필터링/그룹핑한다.

- [ ] **Step 1: schema.prisma에 필드 추가**

`model V1PostEventReview` 블록(현재 881행 `rating Int` 바로 아래)에 추가:

```prisma
  rating         Int
  sportId        String?                     @map("sport_id")
```

인덱스 블록(현재 898–905행)에 추가:

```prisma
  @@index([targetUserId, sportId, submittedAt])
  @@index([targetTeamId, sportId, submittedAt])
```

- [ ] **Step 2: 멱등 마이그레이션 작성**

`apps/v1_api/prisma/migrations/` 최신 항목이 `20260718080000_...`이므로 그보다 뒤 타임스탬프를 쓴다(예: `20260719000000_v1_post_event_review_sport`). 디렉터리를 만들고 `migration.sql`:

```sql
ALTER TABLE "v1_post_event_reviews" ADD COLUMN IF NOT EXISTS "sport_id" TEXT;

CREATE INDEX IF NOT EXISTS "v1_post_event_reviews_target_user_sport_idx"
  ON "v1_post_event_reviews" ("target_user_id", "sport_id", "submitted_at");

CREATE INDEX IF NOT EXISTS "v1_post_event_reviews_target_team_sport_idx"
  ON "v1_post_event_reviews" ("target_team_id", "sport_id", "submitted_at");
```

- [ ] **Step 3: Prisma client 재생성 (공유 DB에 migrate 실행 금지)**

Run: `cd apps/v1_api && npx prisma generate`
Expected: `✔ Generated Prisma Client` 출력, 에러 없음.

- [ ] **Step 4: tsc로 스키마-코드 정합 확인**

Run: `pnpm --filter v1_api exec tsc --noEmit`
Expected: exit 0 (이 시점엔 아직 sportId를 쓰는 코드가 없으므로 에러 없어야 정상).

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_api/prisma/schema.prisma apps/v1_api/prisma/migrations/20260719000000_v1_post_event_review_sport
git commit -m "feat(v1/reviews): V1PostEventReview에 sportId 스냅샷 컬럼 추가"
```

---

## Task 2: 제출 시점에 sportId 캡처

**Files:**
- Modify: `apps/v1_api/src/reviews/reviews.service.ts:245-352` (`matchSource`, `teamMatchSource`), `:354-418` (`submitPersonalReview`, `submitTeamReview`)
- Test: `apps/v1_api/src/reviews/reviews.service.spec.ts`

**Interfaces:**
- Consumes: Task 1의 `V1PostEventReview.sportId`
- Produces: `matchSource()`/`teamMatchSource()` 반환 객체에 `sportId: string` 필드 추가 — Task 4(집계)가 이 값이 review row에 항상 채워져 있다고 가정한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`reviews.service.spec.ts`에 추가(기존 `submitPersonalReview`/`submitTeamReview` 테스트 블록 옆):

```typescript
it('submitPersonalReview: 리뷰 생성 시 매치의 sportId를 스냅샷으로 저장한다', async () => {
  prisma.v1Match.findUnique.mockResolvedValueOnce({
    id: 'match-1',
    title: '테스트 매치',
    status: 'completed',
    completedAt: new Date('2026-07-01T00:00:00Z'),
    startAt: new Date('2026-07-01T00:00:00Z'),
    sportId: 'sport-futsal',
    participants: [
      { userId: 'user-me', user: { id: 'user-me', profile: null } },
      { userId: 'user-target', user: { id: 'user-target', profile: null } },
    ],
  });
  prisma.v1PostEventReview.findMany.mockResolvedValueOnce([]);
  prisma.v1PostEventReview.create.mockResolvedValueOnce({
    id: 'review-1', sourceType: 'match', sourceId: 'match-1', targetType: 'user',
    targetUserId: 'user-target', rating: 5, sportId: 'sport-futsal', status: 'submitted',
    submittedAt: new Date(), tags: [], reviewerUser: { id: 'user-me', profile: null },
    reviewerTeam: null, targetUser: { id: 'user-target', profile: null }, targetTeam: null,
  });

  await service.submitPersonalReview(
    { id: 'user-me' } as V1AuthUser,
    { sourceType: 'match', sourceId: 'match-1', targetType: 'user', targetUserId: 'user-target', rating: 5, tagCodes: ['manner'] } as SubmitReviewDto,
    ['manner'],
  );

  expect(prisma.v1PostEventReview.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ sportId: 'sport-futsal' }) }),
  );
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `pnpm --filter v1_api exec jest src/reviews/reviews.service.spec.ts -t "sportId를 스냅샷"`
Expected: FAIL — `prisma.v1PostEventReview.create`가 `sportId` 없이 호출됨(현재 코드에 없음), 또는 `matchSource`가 `sportId`를 select하지 않아 `source.sportId`가 `undefined`.

- [ ] **Step 3: matchSource에 sportId select 추가**

`reviews.service.ts` 246–264행(`matchSource`의 `findUnique` select) 수정:

```typescript
  private async matchSource(user: V1AuthUser, sourceId: string) {
    const match = await this.prisma.v1Match.findUnique({
      where: { id: sourceId },
      select: {
        id: true,
        title: true,
        status: true,
        completedAt: true,
        startAt: true,
        sportId: true,
        participants: {
          where: { status: { in: ELIGIBLE_PARTICIPANT_STATUSES } },
          select: {
            userId: true,
            user: {
              select: { id: true, profile: { select: { nickname: true, profileImageUrl: true } } },
            },
          },
        },
      },
    });
```

반환 객체(280–300행)에 `sportId` 추가:

```typescript
    return {
      source: sourceSummary('match', match.id, match.title, match.completedAt ?? match.startAt),
      sportId: match.sportId,
      reviewerTeam: null,
      targets: match.participants
```

- [ ] **Step 4: teamMatchSource에 sportId select 추가**

304–317행 select에 `sportId: true` 추가, 336–351행 반환 객체에 `sportId: teamMatch.sportId` 추가(matchSource와 동일 패턴).

- [ ] **Step 5: submitPersonalReview/submitTeamReview에서 sportId 전달**

364–375행(`submitPersonalReview`의 `create` 호출):

```typescript
      const created = await tx.v1PostEventReview.create({
        data: {
          reviewerUserId: user.id,
          sourceType: 'match',
          sourceId: dto.sourceId,
          targetType: 'user',
          targetUserId,
          rating: dto.rating,
          sportId: source.sportId,
          tags: { create: tagCodes.map((tagCode) => ({ tagCode, labelSnapshot: REVIEW_TAGS[tagCode] })) },
        },
        include: reviewInclude(),
      });
```

397–409행(`submitTeamReview`의 `create` 호출)에 동일하게 `sportId: source.sportId` 추가.

- [ ] **Step 6: 테스트 재실행해서 통과 확인**

Run: `pnpm --filter v1_api exec jest src/reviews/reviews.service.spec.ts`
Expected: 전체 PASS(기존 테스트 포함, mock에 `sportId` 필드가 없어도 `select`가 실제 DB 호출이 아니라 mock이므로 기존 테스트의 `v1Match.findUnique`/`v1TeamMatch.findUnique` mock 리턴값에 `sportId`가 없으면 `source.sportId`가 `undefined`가 되어 `create` 호출 시 `sportId: undefined`로 들어감 — 기존 테스트들이 `toHaveBeenCalledWith`로 정확한 data 객체를 검증하고 있다면 실패할 수 있으니, 기존 mock 데이터에도 `sportId: 'sport-futsal'` 같은 값을 추가하고 기존 `expect(...create).toHaveBeenCalledWith(...)` 단언에도 `sportId`를 포함시켜라).

- [ ] **Step 7: 커밋**

```bash
git add apps/v1_api/src/reviews/reviews.service.ts apps/v1_api/src/reviews/reviews.service.spec.ts
git commit -m "feat(v1/reviews): 리뷰 제출 시 매치/팀매치의 sportId를 스냅샷으로 저장"
```

---

## Task 3: 공개(reveal) 판정 헬퍼

**Files:**
- Create: `apps/v1_api/src/reviews/review-visibility.ts`
- Test: `apps/v1_api/src/reviews/review-visibility.spec.ts`

**Interfaces:**
- Produces:
  - `const REVEAL_FALLBACK_HOURS = 72`
  - `function isReviewRevealed(review: { sourceId: string; reviewerUserId: string; targetUserId: string | null; submittedAt: Date }, reverseReviews: Array<{ sourceId: string; reviewerUserId: string; targetUserId: string | null }>, now: Date): boolean`
  - Task 4(집계)와 Task 6(mannerScore 재계산)이 이 함수를 그대로 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/v1_api/src/reviews/review-visibility.spec.ts`:

```typescript
import { isReviewRevealed, REVEAL_FALLBACK_HOURS } from './review-visibility';

describe('isReviewRevealed', () => {
  const baseReview = {
    sourceId: 'match-1',
    reviewerUserId: 'user-a',
    targetUserId: 'user-b',
    submittedAt: new Date('2026-07-19T00:00:00Z'),
  };

  it('상대(user-b→user-a, 같은 sourceId)가 이미 제출했으면 즉시 공개', () => {
    const reverseReviews = [{ sourceId: 'match-1', reviewerUserId: 'user-b', targetUserId: 'user-a' }];
    const now = new Date('2026-07-19T00:10:00Z'); // 10분 후
    expect(isReviewRevealed(baseReview, reverseReviews, now)).toBe(true);
  });

  it('상대가 안 냈고 72시간 미만이면 비공개', () => {
    const now = new Date('2026-07-21T23:59:00Z'); // 71시간 59분 후
    expect(isReviewRevealed(baseReview, [], now)).toBe(false);
  });

  it('상대가 안 냈어도 72시간 지나면 공개', () => {
    const now = new Date('2026-07-22T00:01:00Z'); // 72시간 1분 후
    expect(isReviewRevealed(baseReview, [], now)).toBe(true);
  });

  it('reverseReviews에 다른 sourceId나 다른 사람 리뷰가 섞여 있어도 정확히 매칭한다', () => {
    const reverseReviews = [
      { sourceId: 'match-2', reviewerUserId: 'user-b', targetUserId: 'user-a' }, // 다른 매치
      { sourceId: 'match-1', reviewerUserId: 'user-c', targetUserId: 'user-a' }, // 다른 사람
    ];
    const now = new Date('2026-07-19T00:10:00Z');
    expect(isReviewRevealed(baseReview, reverseReviews, now)).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `pnpm --filter v1_api exec jest src/reviews/review-visibility.spec.ts`
Expected: FAIL — `Cannot find module './review-visibility'`.

- [ ] **Step 3: 구현**

`apps/v1_api/src/reviews/review-visibility.ts`:

```typescript
export const REVEAL_FALLBACK_HOURS = 72;

type ReviewPairKey = { sourceId: string; reviewerUserId: string; targetUserId: string | null };

export function isReviewRevealed(
  review: ReviewPairKey & { submittedAt: Date },
  reverseReviews: ReviewPairKey[],
  now: Date,
): boolean {
  const partnerSubmitted = reverseReviews.some(
    (candidate) =>
      candidate.sourceId === review.sourceId &&
      candidate.reviewerUserId === review.targetUserId &&
      candidate.targetUserId === review.reviewerUserId,
  );
  if (partnerSubmitted) return true;

  const elapsedMs = now.getTime() - review.submittedAt.getTime();
  return elapsedMs >= REVEAL_FALLBACK_HOURS * 60 * 60 * 1000;
}
```

- [ ] **Step 4: 테스트 재실행해서 통과 확인**

Run: `pnpm --filter v1_api exec jest src/reviews/review-visibility.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_api/src/reviews/review-visibility.ts apps/v1_api/src/reviews/review-visibility.spec.ts
git commit -m "feat(v1/reviews): 리뷰 공개(reveal) 판정 헬퍼 — 상호제출 또는 72시간 경과"
```

---

## Task 4: 집계 요약 서비스 메서드

**Files:**
- Modify: `apps/v1_api/src/reviews/reviews.service.ts`
- Test: `apps/v1_api/src/reviews/reviews.service.spec.ts`

**Interfaces:**
- Consumes: Task 3의 `isReviewRevealed`, `REVEAL_FALLBACK_HOURS`
- Produces: `ReviewsService.receivedSummary(user: V1AuthUser, query: { targetType: 'user' | 'team'; period?: string }): Promise<ReviewSummaryResult>` — Task 5(컨트롤러)가 그대로 노출한다.
  - `ReviewSummaryResult = { bySport: SportSummary[]; availableMonths: string[] }`
  - `SportSummary = { sportId: string; ratingAvg: number | null; ratingCount: number; tagRates: Array<{ tagCode: string; label: string; rate: number; count: number }> }`

- [ ] **Step 1: 실패하는 테스트 작성**

`reviews.service.spec.ts`에 추가:

```typescript
describe('receivedSummary', () => {
  it('sportId가 없는(레거시) 리뷰는 집계에서 제외하고, 공개되지 않은 리뷰도 제외한다', async () => {
    const now = new Date('2026-08-01T00:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    prisma.v1PostEventReview.findMany
      .mockResolvedValueOnce([
        // 대상 X가 받은 리뷰들
        { id: 'r1', sourceId: 'm1', reviewerUserId: 'a', targetUserId: 'x', rating: 5, sportId: 'futsal', submittedAt: new Date('2026-07-30T00:00:00Z'), tags: [{ tagCode: 'manner', labelSnapshot: '매너가 좋아요' }] },
        { id: 'r2', sourceId: 'm2', reviewerUserId: 'b', targetUserId: 'x', rating: 3, sportId: null, submittedAt: new Date('2026-07-01T00:00:00Z'), tags: [] }, // 레거시(sportId null) — 집계 제외
        { id: 'r3', sourceId: 'm3', reviewerUserId: 'c', targetUserId: 'x', rating: 4, sportId: 'futsal', submittedAt: new Date('2026-07-31T23:00:00Z'), tags: [] }, // 아직 71시간 미만, 상대도 미제출 — 비공개
      ])
      .mockResolvedValueOnce([
        // X가 쓴 리뷰들(reverse pair 확인용) — r1의 짝(a→x)에 대응하는 x→a가 존재해야 즉시 공개
        { sourceId: 'm1', reviewerUserId: 'x', targetUserId: 'a' },
      ]);

    const result = await service.receivedSummary({ id: 'x' } as V1AuthUser, { targetType: 'user' });

    expect(result.bySport).toEqual([
      { sportId: 'futsal', ratingAvg: 5, ratingCount: 1, tagRates: [{ tagCode: 'manner', label: '매너가 좋아요', rate: 1, count: 1 }] },
    ]);

    jest.useRealTimers();
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `pnpm --filter v1_api exec jest src/reviews/reviews.service.spec.ts -t "receivedSummary"`
Expected: FAIL — `service.receivedSummary is not a function`.

- [ ] **Step 3: 구현**

`reviews.service.ts`의 `received()` 메서드(70-91행) 바로 아래에 추가:

```typescript
  async receivedSummary(user: V1AuthUser, query: { targetType: 'user' | 'team'; period?: string }) {
    const now = new Date();
    const targetFilter = query.targetType === 'team'
      ? { targetTeamId: { in: await this.managedTeamIds(user.id) }, targetType: 'team' as const }
      : { targetUserId: user.id, targetType: 'user' as const };

    const candidates = await this.prisma.v1PostEventReview.findMany({
      where: { status: 'submitted', sportId: { not: null }, ...targetFilter },
      select: { sourceId: true, reviewerUserId: true, targetUserId: true, targetTeamId: true, rating: true, sportId: true, submittedAt: true, tags: { select: { tagCode: true, labelSnapshot: true } } },
    });

    const reverseReviews = query.targetType === 'team'
      ? await this.reverseTeamReviews(candidates)
      : await this.reverseUserReviews(user.id, candidates);

    const revealed = candidates.filter((review) =>
      isReviewRevealed(
        { sourceId: review.sourceId, reviewerUserId: review.reviewerUserId, targetUserId: query.targetType === 'team' ? review.targetTeamId : review.targetUserId, submittedAt: review.submittedAt },
        reverseReviews,
        now,
      ),
    );

    const availableMonths = [...new Set(revealed.map((review) => review.submittedAt.toISOString().slice(0, 7)))].sort().reverse();
    const filtered = query.period
      ? revealed.filter((review) => review.submittedAt.toISOString().slice(0, 7) === query.period)
      : revealed;

    return { bySport: summarizeBySport(filtered), availableMonths };
  }

  private async reverseUserReviews(targetUserId: string, candidates: Array<{ sourceId: string }>) {
    if (!candidates.length) return [];
    const sourceIds = [...new Set(candidates.map((review) => review.sourceId))];
    const reverse = await this.prisma.v1PostEventReview.findMany({
      where: { reviewerUserId: targetUserId, sourceId: { in: sourceIds }, status: 'submitted' },
      select: { sourceId: true, reviewerUserId: true, targetUserId: true },
    });
    return reverse;
  }

  private async reverseTeamReviews(candidates: Array<{ sourceId: string; targetTeamId: string | null }>) {
    if (!candidates.length) return [];
    const sourceIds = [...new Set(candidates.map((review) => review.sourceId))];
    const teamIds = [...new Set(candidates.map((review) => review.targetTeamId).filter((id): id is string => Boolean(id)))];
    if (!teamIds.length) return [];
    const reverse = await this.prisma.v1PostEventReview.findMany({
      where: { reviewerTeamId: { in: teamIds }, sourceId: { in: sourceIds }, status: 'submitted' },
      select: { sourceId: true, reviewerTeamId: true, targetTeamId: true },
    });
    return reverse.map((review) => ({ sourceId: review.sourceId, reviewerUserId: review.reviewerTeamId ?? '', targetUserId: review.targetTeamId }));
  }
```

파일 상단 import(1-20행)에 추가:

```typescript
import { isReviewRevealed } from './review-visibility';
```

파일 하단(731행 이후, 헬퍼 함수들 근처)에 추가:

```typescript
function summarizeBySport(
  reviews: Array<{ sportId: string | null; rating: number; tags: Array<{ tagCode: string; labelSnapshot: string }> }>,
) {
  const bySport = new Map<string, { ratings: number[]; tagCounts: Map<string, { label: string; count: number }> }>();
  for (const review of reviews) {
    if (!review.sportId) continue;
    const bucket = bySport.get(review.sportId) ?? { ratings: [], tagCounts: new Map() };
    bucket.ratings.push(review.rating);
    for (const tag of review.tags) {
      const current = bucket.tagCounts.get(tag.tagCode) ?? { label: tag.labelSnapshot, count: 0 };
      current.count += 1;
      bucket.tagCounts.set(tag.tagCode, current);
    }
    bySport.set(review.sportId, bucket);
  }

  return [...bySport.entries()].map(([sportId, bucket]) => ({
    sportId,
    ratingAvg: bucket.ratings.length ? Number((bucket.ratings.reduce((sum, value) => sum + value, 0) / bucket.ratings.length).toFixed(2)) : null,
    ratingCount: bucket.ratings.length,
    tagRates: [...bucket.tagCounts.entries()].map(([tagCode, { label, count }]) => ({
      tagCode,
      label,
      rate: Number((count / bucket.ratings.length).toFixed(2)),
      count,
    })),
  }));
}
```

**참고 — `reviewerTeamId` 필드**: `V1PostEventReview`에는 이미 `reviewerTeamId String?`가 존재한다(873행). `reverseTeamReviews`에서 사용하는 이 필드는 스키마 변경 불필요.

- [ ] **Step 4: 테스트 재실행해서 통과 확인**

Run: `pnpm --filter v1_api exec jest src/reviews/reviews.service.spec.ts`
Expected: 전체 PASS.

- [ ] **Step 5: tsc 확인**

Run: `pnpm --filter v1_api exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: 커밋**

```bash
git add apps/v1_api/src/reviews/reviews.service.ts apps/v1_api/src/reviews/reviews.service.spec.ts
git commit -m "feat(v1/reviews): 종목별 집계 요약(receivedSummary) — 공개된 리뷰만, 레거시(sportId null) 제외"
```

---

## Task 5: 컨트롤러 엔드포인트 + DTO

**Files:**
- Create: `apps/v1_api/src/reviews/dto/received-summary-query.dto.ts`
- Modify: `apps/v1_api/src/reviews/reviews.controller.ts`
- Test: `apps/v1_api/src/reviews/reviews.controller.spec.ts`

**Interfaces:**
- Consumes: Task 4의 `ReviewsService.receivedSummary`
- Produces: `GET /reviews/received/summary?targetType=user|team&period=YYYY-MM` — Task 7(프론트 훅)이 그대로 호출한다.

- [ ] **Step 1: DTO 작성**

`apps/v1_api/src/reviews/dto/received-summary-query.dto.ts`:

```typescript
import { IsIn, IsOptional, Matches } from 'class-validator';

export class ReceivedSummaryQueryDto {
  @IsIn(['user', 'team'])
  targetType!: 'user' | 'team';

  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'period must be in YYYY-MM format' })
  period?: string;
}
```

- [ ] **Step 2: 실패하는 컨트롤러 테스트 작성**

`reviews.controller.spec.ts`에 추가(기존 파일이 없다면 `received` 테스트 옆에):

```typescript
it('GET /reviews/received/summary는 targetType 쿼리를 서비스로 그대로 전달한다', async () => {
  const summary = { bySport: [], availableMonths: [] };
  service.receivedSummary.mockResolvedValueOnce(summary);

  const result = await controller.receivedSummary({ id: 'user-1' } as V1AuthUser, { targetType: 'user' });

  expect(service.receivedSummary).toHaveBeenCalledWith({ id: 'user-1' }, { targetType: 'user' });
  expect(result).toBe(summary);
});
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `pnpm --filter v1_api exec jest src/reviews/reviews.controller.spec.ts`
Expected: FAIL — `controller.receivedSummary is not a function`.

- [ ] **Step 4: 컨트롤러에 라우트 추가**

`reviews.controller.ts`의 `@Get('received')` 블록(20-23행) 바로 아래:

```typescript
  @Get('received/summary')
  receivedSummary(@CurrentUser() user: V1AuthUser, @Query() query: ReceivedSummaryQueryDto) {
    return this.reviewsService.receivedSummary(user, query);
  }
```

import 추가:

```typescript
import { ReceivedSummaryQueryDto } from './dto/received-summary-query.dto';
```

**주의**: NestJS는 라우트를 등록 순서대로 매칭하지 않고 static path를 우선하므로 `received/summary`가 `received`와 충돌하지 않는다(별도 static 세그먼트). 순서는 무관하지만 가독성을 위해 `received` 바로 아래 둔다.

- [ ] **Step 5: 테스트 재실행해서 통과 확인**

Run: `pnpm --filter v1_api exec jest src/reviews/reviews.controller.spec.ts`
Expected: PASS.

- [ ] **Step 6: tsc 확인**

Run: `pnpm --filter v1_api exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: 커밋**

```bash
git add apps/v1_api/src/reviews/dto/received-summary-query.dto.ts apps/v1_api/src/reviews/reviews.controller.ts apps/v1_api/src/reviews/reviews.controller.spec.ts
git commit -m "feat(v1/reviews): GET /reviews/received/summary 엔드포인트 추가"
```

---

## Task 6: mannerScore 재계산에 공개 판정 반영 + 팀신뢰점수 소스 분리

**Files:**
- Modify: `apps/v1_api/src/reviews/reviews.service.ts` (`recalculateUserReputation` 506-518행, `recalculateTeamTrust` 520-553행)
- Test: `apps/v1_api/src/reviews/reviews.service.spec.ts`

**Interfaces:**
- Consumes: Task 3의 `isReviewRevealed`
- 이 태스크는 신규 인터페이스를 생산하지 않는다 — 기존 `recalculateUserReputation`/`recalculateTeamTrust`의 내부 동작만 바꾼다(시그니처 동일).

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
it('recalculateUserReputation: 공개되지 않은(상대 미제출+72시간 미경과) 리뷰는 mannerScore 집계에서 제외한다', async () => {
  const now = new Date('2026-07-19T00:00:00Z');
  jest.useFakeTimers().setSystemTime(now);

  prisma.v1PostEventReview.findMany
    .mockResolvedValueOnce([
      { sourceId: 'm1', reviewerUserId: 'a', targetUserId: 'x', rating: 5, submittedAt: new Date('2026-07-18T00:00:00Z') }, // 상대 미제출, 24시간 경과 — 비공개
      { sourceId: 'm2', reviewerUserId: 'b', targetUserId: 'x', rating: 1, submittedAt: new Date('2026-07-19T00:00:00Z') }, // 상대 제출됨 — 공개
    ])
    .mockResolvedValueOnce([{ sourceId: 'm2', reviewerUserId: 'x', targetUserId: 'b' }]);

  await service['recalculateUserReputation'](prisma, 'x');

  expect(prisma.v1UserReputationSummary.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      update: expect.objectContaining({ reviewCount: 1, mannerScore: expect.objectContaining({}) }),
    }),
  );
  const upsertCall = prisma.v1UserReputationSummary.upsert.mock.calls[0][0];
  expect(upsertCall.update.mannerScore.toString()).toBe('1.00'); // m2 리뷰(1점)만 반영

  jest.useRealTimers();
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `pnpm --filter v1_api exec jest src/reviews/reviews.service.spec.ts -t "mannerScore 집계에서 제외"`
Expected: FAIL — 현재 구현은 `aggregate()`로 전체를 한 번에 평균 내므로 두 리뷰(5점, 1점) 평균인 3.00이 나와 기대값 1.00과 다름.

- [ ] **Step 3: recalculateUserReputation을 공개 리뷰만 집계하도록 수정**

506-518행 교체:

```typescript
  private async recalculateUserReputation(tx: PrismaTx, targetUserId: string) {
    const now = new Date();
    const candidates = await tx.v1PostEventReview.findMany({
      where: { targetUserId, targetType: 'user', status: 'submitted' },
      select: { sourceId: true, reviewerUserId: true, targetUserId: true, rating: true, submittedAt: true },
    });
    const reverseReviews = candidates.length
      ? await tx.v1PostEventReview.findMany({
          where: { reviewerUserId: targetUserId, sourceId: { in: [...new Set(candidates.map((review) => review.sourceId))] }, status: 'submitted' },
          select: { sourceId: true, reviewerUserId: true, targetUserId: true },
        })
      : [];
    const revealed = candidates.filter((review) => isReviewRevealed(review, reverseReviews, now));
    const reviewCount = revealed.length;
    const avgRating = reviewCount ? revealed.reduce((sum, review) => sum + review.rating, 0) / reviewCount : null;

    await tx.v1UserReputationSummary.upsert({
      where: { userId: targetUserId },
      update: reputationData(reviewCount, avgRating, '완료 경기 리뷰 기반'),
      create: { userId: targetUserId, ...reputationData(reviewCount, avgRating, '완료 경기 리뷰 기반') },
    });
  }
```

- [ ] **Step 4: recalculateTeamTrust를 sourceType='team_match' 전용으로 좁히고 동일하게 공개 판정 적용**

520-553행 교체:

```typescript
  private async recalculateTeamTrust(tx: PrismaTx, targetTeamId: string) {
    const now = new Date();
    const [candidates, completedMatchCount] = await Promise.all([
      tx.v1PostEventReview.findMany({
        // sourceType 필터 추가 — team_match 리뷰만 팀신뢰점수에 반영(대회후기는 별도 경로에서 집계)
        where: { targetTeamId, targetType: 'team', status: 'submitted', sourceType: 'team_match' },
        select: { sourceId: true, reviewerTeamId: true, targetTeamId: true, rating: true, submittedAt: true },
      }),
      tx.v1TeamMatch.count({
        where: {
          OR: [{ hostTeamId: targetTeamId }, { approvedApplicantTeamId: targetTeamId }],
          AND: [{ OR: [{ status: 'completed' }, { completedAt: { not: null } }] }],
        },
      }),
    ]);
    const teamIds = [...new Set(candidates.map((review) => review.reviewerTeamId).filter((id): id is string => Boolean(id)))];
    const reverseReviews = teamIds.length
      ? (
          await tx.v1PostEventReview.findMany({
            where: { reviewerTeamId: { in: teamIds }, sourceId: { in: [...new Set(candidates.map((review) => review.sourceId))] }, sourceType: 'team_match', status: 'submitted' },
            select: { sourceId: true, reviewerTeamId: true, targetTeamId: true },
          })
        ).map((review) => ({ sourceId: review.sourceId, reviewerUserId: review.reviewerTeamId ?? '', targetUserId: review.targetTeamId }))
      : [];
    const revealed = candidates.filter((review) =>
      isReviewRevealed({ sourceId: review.sourceId, reviewerUserId: review.reviewerTeamId ?? '', targetUserId: review.targetTeamId, submittedAt: review.submittedAt }, reverseReviews, now),
    );
    const reviewCount = revealed.length;
    const avgRating = reviewCount ? revealed.reduce((sum, review) => sum + review.rating, 0) / reviewCount : null;

    await tx.v1TeamTrustScore.upsert({
      where: { teamId: targetTeamId },
      update: {
        trustState: trustStateForReviewCount(reviewCount),
        mannerScore: decimalScore(avgRating),
        matchCount: completedMatchCount,
        sourceLabel: '완료 팀매치 리뷰 기반',
        calculatedAt: new Date(),
      },
      create: {
        teamId: targetTeamId,
        trustState: trustStateForReviewCount(reviewCount),
        mannerScore: decimalScore(avgRating),
        matchCount: completedMatchCount,
        sourceLabel: '완료 팀매치 리뷰 기반',
        calculatedAt: new Date(),
      },
    });
  }
```

**중요**: `sourceType: 'team_match'` 필터를 추가한 것이 대회후기(`tournament_fixture`) 리뷰를 이 집계에서 제외하는 지점이다(스펙의 "팀신뢰점수 분리" 요구사항). `tournament-fixture-review-trust.ts`의 `recalculateTournamentFixtureTeamTrust`는 이 태스크에서 건드리지 않는다 — 단, 그쪽도 같은 `V1TeamTrustScore.mannerScore` 필드에 upsert하고 있다면 두 함수가 서로 덮어쓰는 문제가 남는다. **Step 4a**로 이어서 처리한다.

- [ ] **Step 4a: tournament-fixture-review-trust.ts 확인 및 필드 분리**

`apps/v1_api/src/reviews/tournament-fixture-review-trust.ts`를 읽어라(`git show origin/dev:apps/v1_api/src/reviews/tournament-fixture-review-trust.ts`). 이 파일이 동일하게 `v1TeamTrustScore.mannerScore`를 upsert한다면, 두 소스(team_match, tournament_fixture)가 하나의 `mannerScore` 컬럼을 놓고 경쟁하게 되어 "분리"가 실질적으로 무의미해진다. 이 경우:
1. `V1TeamTrustScore`에 `tournamentMannerScore Decimal? @map("tournament_manner_score") @db.Decimal(4,2)`, `tournamentReviewCount Int @default(0) @map("tournament_review_count")` 컬럼을 추가(Task 1과 같은 방식으로 별도 마이그레이션).
2. `recalculateTeamTrust`(이 태스크에서 수정한 team_match 전용 버전)는 기존 `mannerScore`/`reviewCount`(팀매치 전용으로 이미 좁혀짐)에 계속 쓴다.
3. `recalculateTournamentFixtureTeamTrust`는 새 `tournamentMannerScore`/`tournamentReviewCount` 컬럼에 쓰도록 수정한다.
4. 이 필드 분리로 영향받는 프론트(팀 신뢰점수를 노출하는 화면)는 Task 9 이후 별도 후속으로 남긴다 — 이번 계획의 범위는 백엔드 데이터 분리까지다(스펙의 Ambiguity Log 대상은 아니었으나 구현 중 발견된 실제 충돌이므로 여기 기록한다).

이 Step은 실제 `tournament-fixture-review-trust.ts` 내용을 읽은 뒤 확정하는 조건부 단계다 — 만약 이미 별도 필드/모델을 쓰고 있다면(예: 대회후기가 애초에 다른 테이블에 집계된다면) Step 4a는 스킵하고 그 사실을 커밋 메시지에 기록한다.

- [ ] **Step 5: 테스트 재실행해서 통과 확인**

Run: `pnpm --filter v1_api exec jest src/reviews/reviews.service.spec.ts`
Expected: 전체 PASS.

- [ ] **Step 6: tsc 확인**

Run: `pnpm --filter v1_api exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: 커밋**

```bash
git add apps/v1_api/src/reviews/reviews.service.ts apps/v1_api/src/reviews/reviews.service.spec.ts
git commit -m "fix(v1/reviews): mannerScore 재계산이 공개(reveal)된 리뷰만 반영, 팀신뢰점수는 team_match 소스로 한정"
```

(Step 4a에서 스키마 변경이 실제로 필요했다면 마이그레이션 파일도 같은 커밋 또는 별도 후속 커밋에 포함)

- [ ] **Step 8: profile.service.ts의 실시간 재집계 경로 확인 및 정합 — 자체 리뷰에서 발견된 갭**

스펙 조사 단계에서 확인된 사실: `apps/v1_api/src/profile/profile.service.ts`의 `activitySummary()`(약 60-73행)는 `V1UserReputationSummary` 캐시값을 읽지 않고 **매번 `v1PostEventReview`를 직접 재집계**한다(`recalculateUserReputation`과 별개 경로). Step 1-3에서 `recalculateUserReputation`을 고쳐도 이 경로는 그대로면 마이페이지 프로필 화면이 여전히 비공개 리뷰의 점수를 반영해버린다.

`git show origin/dev:apps/v1_api/src/profile/profile.service.ts`로 `activitySummary()` 전체를 읽어라. 그 함수가 직접 `this.prisma.v1PostEventReview.aggregate(...)`(또는 유사한 직접 쿼리)를 수행하고 있다면:
- 가장 단순하고 일관된 수정은 그 직접 aggregate 호출을 **제거**하고, 대신 `this.prisma.v1UserReputationSummary.findUnique({ where: { userId } })`로 캐시값(Step 3에서 이미 공개된 리뷰만 반영하도록 고친)을 읽어오도록 바꾸는 것이다 — 로직 중복 없이 정합성이 자동으로 유지된다.
- 만약 `activitySummary()`가 mannerScore 외에 리뷰 집계와 무관한 다른 실시간 값(예: 이번 달 매치 참여 횟수 등)도 같이 계산하고 있다면, mannerScore/reviewCount 부분만 캐시 조회로 교체하고 나머지는 그대로 둔다.
- 이 함수를 사용하는 테스트(`apps/v1_api/src/profile/profile.service.spec.ts`)가 있으면 mock을 `v1PostEventReview.aggregate` 대신 `v1UserReputationSummary.findUnique`로 갱신해라.

실제로 읽어본 결과 이미 캐시를 읽고 있어 문제가 없다면(스펙 작성 시점의 조사가 부정확했을 가능성), 이 Step은 "확인 결과 이미 캐시 기반이라 변경 불필요"라고 커밋 메시지에 남기고 스킵해도 된다 — 다만 반드시 실제로 읽고 확인한 뒤에 판단해라, 추측하지 마라.

Run(수정했다면): `pnpm --filter v1_api exec jest src/profile`
Expected: PASS.

Run: `pnpm --filter v1_api exec tsc --noEmit`
Expected: exit 0.

```bash
git add apps/v1_api/src/profile/profile.service.ts apps/v1_api/src/profile/profile.service.spec.ts
git commit -m "fix(v1/profile): activitySummary가 캐시된(공개 리뷰만 반영하는) mannerScore를 읽도록 정합"
```

---

## Task 7: 프론트 타입 + 훅

**Files:**
- Modify: `apps/v1_web/src/types/api.ts` (977행 이후, 리뷰 타입 블록 끝)
- Modify: `apps/v1_web/src/hooks/use-v1-api.ts` (1044행 `useV1ReceivedReviews` 바로 아래)
- Modify: `apps/v1_web/src/lib/query-keys.ts` (20행 `reviewsReceived` 바로 아래)

**Interfaces:**
- Consumes: Task 5의 `GET /reviews/received/summary`
- Produces: `useV1ReceivedReviewSummary(targetType, period?, options?)` 훅 — Task 8(대시보드 컴포넌트)이 그대로 쓴다.

- [ ] **Step 1: query-keys.ts에 키 추가**

`apps/v1_web/src/lib/query-keys.ts` 20행(`reviewsReceived`) 바로 아래:

```typescript
  reviewsReceivedSummary: (targetType: 'user' | 'team', period?: string) => [...v1Keys.all, 'reviews', 'received', 'summary', targetType, period ?? 'all'] as const,
```

- [ ] **Step 2: types/api.ts에 타입 추가**

`apps/v1_web/src/types/api.ts` 978행(파일의 `V1ReviewSubmitResponse` 타입 정의) 바로 아래:

```typescript
export type V1ReviewTagRate = {
  tagCode: string;
  label: string;
  rate: number;
  count: number;
};

export type V1ReviewSportSummary = {
  sportId: string;
  ratingAvg: number | null;
  ratingCount: number;
  tagRates: V1ReviewTagRate[];
};

export type V1ReviewReceivedSummaryResponse = {
  bySport: V1ReviewSportSummary[];
  availableMonths: string[];
};
```

- [ ] **Step 3: use-v1-api.ts에 훅 추가**

import 블록(90-95행)에 `V1ReviewReceivedSummaryResponse` 추가. `useV1ReceivedReviews`(1038-1044행) 바로 아래:

```typescript
export function useV1ReceivedReviewSummary(targetType: 'user' | 'team', period?: string, options?: QueryOptions) {
  return useQuery({
    queryKey: v1Keys.reviewsReceivedSummary(targetType, period),
    queryFn: () => v1Get<V1ReviewReceivedSummaryResponse>('/reviews/received/summary', { targetType, period }),
    enabled: options?.enabled,
  });
}
```

- [ ] **Step 4: tsc 확인**

Run: `pnpm --filter v1_web exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_web/src/types/api.ts apps/v1_web/src/hooks/use-v1-api.ts apps/v1_web/src/lib/query-keys.ts
git commit -m "feat(v1/web): 리뷰 집계 요약 타입·쿼리키·훅(useV1ReceivedReviewSummary) 추가"
```

---

## Task 8: 집계 대시보드 컴포넌트

**Files:**
- Create: `apps/v1_web/src/components/reviews/reviews-summary-dashboard.tsx`
- Test: `apps/v1_web/src/components/reviews/reviews-summary-dashboard.test.tsx`

**Interfaces:**
- Consumes: Task 7의 `V1ReviewReceivedSummaryResponse`
- Produces: `<ReviewsSummaryDashboard summary={...} availableMonths={...} period={...} onPeriodChange={...} loading={...} />` — Task 9(페이지 재구성)이 그대로 마운트한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/v1_web/src/components/reviews/reviews-summary-dashboard.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReviewsSummaryDashboard } from './reviews-summary-dashboard';

const summary = {
  bySport: [
    { sportId: 'futsal', ratingAvg: 4.8, ratingCount: 12, tagRates: [{ tagCode: 'manner', label: '매너가 좋아요', rate: 0.68, count: 8 }] },
  ],
  availableMonths: ['2026-07', '2026-06'],
};

describe('ReviewsSummaryDashboard', () => {
  it('종목별 평균 별점·건수·태그 빈도를 표시하고 개별 작성자 정보는 렌더링하지 않는다', () => {
    render(<ReviewsSummaryDashboard summary={summary} period={null} onPeriodChange={vi.fn()} loading={false} />);

    expect(screen.getByText('4.8')).toBeInTheDocument();
    expect(screen.getByText('12건')).toBeInTheDocument();
    expect(screen.getByText(/매너가 좋아요/)).toBeInTheDocument();
    expect(screen.getByText('68%')).toBeInTheDocument();
    // 개별 리뷰 작성자 관련 텍스트는 이 컴포넌트 어디에도 없어야 한다
    expect(screen.queryByText(/reviewerUser|작성자/)).not.toBeInTheDocument();
  });

  it('월 드롭다운 선택 시 onPeriodChange를 선택한 값으로 호출한다', () => {
    const onPeriodChange = vi.fn();
    render(<ReviewsSummaryDashboard summary={summary} period={null} onPeriodChange={onPeriodChange} loading={false} />);

    fireEvent.change(screen.getByLabelText('기간 선택'), { target: { value: '2026-07' } });

    expect(onPeriodChange).toHaveBeenCalledWith('2026-07');
  });

  it('집계 결과가 비어 있으면 안내 문구를 보여준다', () => {
    render(<ReviewsSummaryDashboard summary={{ bySport: [], availableMonths: [] }} period={null} onPeriodChange={vi.fn()} loading={false} />);
    expect(screen.getByText('아직 집계된 리뷰가 없어요.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `pnpm --filter v1_web exec vitest run src/components/reviews/reviews-summary-dashboard.test.tsx`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`apps/v1_web/src/components/reviews/reviews-summary-dashboard.tsx`:

```tsx
'use client';

import { Card, EmptyState } from '@/components/v1-ui/primitives';
import type { V1ReviewReceivedSummaryResponse } from '@/types/api';

export function ReviewsSummaryDashboard({
  summary,
  period,
  onPeriodChange,
  loading,
}: {
  summary: V1ReviewReceivedSummaryResponse | undefined;
  period: string | null;
  onPeriodChange: (period: string | null) => void;
  loading: boolean;
}) {
  if (loading) return null;
  const bySport = summary?.bySport ?? [];
  const availableMonths = summary?.availableMonths ?? [];

  return (
    <section>
      <div className="tm-review-summary-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="tm-my-section-label">리뷰 집계</div>
        <label className="tm-text-caption" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          기간
          <select
            aria-label="기간 선택"
            className="tm-create-input tm-create-select-control"
            value={period ?? 'all'}
            onChange={(event) => onPeriodChange(event.target.value === 'all' ? null : event.target.value)}
          >
            <option value="all">전체</option>
            {availableMonths.map((month) => (
              <option key={month} value={month}>{month}</option>
            ))}
          </select>
        </label>
      </div>

      {bySport.length === 0 ? (
        <EmptyState title="아직 집계된 리뷰가 없어요." sub="상대방이 리뷰를 함께 남기거나 72시간이 지나면 반영돼요." />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {bySport.map((sport) => (
            <Card key={sport.sportId} pad={16}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div className="tm-text-body-lg">{sport.sportId}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span className="tm-text-subhead" style={{ fontWeight: 700 }}>{sport.ratingAvg ?? '-'}</span>
                  <span className="tm-text-caption">{sport.ratingCount}건</span>
                </div>
              </div>
              <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                {sport.tagRates.map((tag) => (
                  <div key={tag.tagCode} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="tm-text-caption">{tag.label}</span>
                    <span className="tm-text-caption" style={{ fontWeight: 600 }}>{Math.round(tag.rate * 100)}%</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
```

**참고**: `Card`/`EmptyState`는 이미 `apps/v1_web/src/components/reviews/reviews-page.tsx`(323-341행)가 `components/v1-ui/primitives`에서 가져다 쓰는 것과 동일 컴포넌트다 — 실제 import 경로를 `git show origin/dev:apps/v1_web/src/components/reviews/reviews-page.tsx`의 import 블록에서 재확인하고 다르면 맞춰라.

- [ ] **Step 4: 테스트 재실행해서 통과 확인**

Run: `pnpm --filter v1_web exec vitest run src/components/reviews/reviews-summary-dashboard.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: 패턴 체크**

Run: `cd apps/v1_web && node scripts/v1-pattern-check.mjs`
Expected: `✓ v1 패턴 검사 통과`.

- [ ] **Step 6: 커밋**

```bash
git add apps/v1_web/src/components/reviews/reviews-summary-dashboard.tsx apps/v1_web/src/components/reviews/reviews-summary-dashboard.test.tsx
git commit -m "feat(v1/web): 리뷰 종목별 집계 대시보드 컴포넌트"
```

---

## Task 9: "받은 리뷰" 페이지 재구성 (집계 대시보드 + 이전 리뷰 레거시 섹션)

**Files:**
- Modify: `apps/v1_web/src/components/reviews/reviews-api-clients.tsx` (`ReviewsReceivedPageClient`, 135-147행)
- Modify: `apps/v1_web/src/components/reviews/reviews-page.tsx` (`ReviewsReceivedPageView`/`ReviewsReceivedContent`, 168행 이후)
- Modify: `apps/v1_web/src/components/reviews/reviews.view-model.ts` (`toReviewsReceivedPageModel`, 70-85행)
- Test: 관련 `.test.tsx` 파일(존재하면 업데이트, 없으면 이 태스크에서 생성)

**Interfaces:**
- Consumes: Task 7의 `useV1ReceivedReviewSummary`, Task 8의 `ReviewsSummaryDashboard`
- 페이지 레벨 태스크라 하위로 소비되는 인터페이스는 없다.

- [ ] **Step 1: 먼저 `reviews-page.tsx` 전체와 `ReviewsReceivedContent` 정의를 읽어라**

Run: `git show origin/dev:apps/v1_web/src/components/reviews/reviews-page.tsx`

(이 계획서 작성 시점엔 168-189행, 323-358행만 발췌 확보했다 — `ReviewsReceivedContent`가 `ReceivedGroupSection`을 어떻게 조합하는지 정확한 JSX(아마 189-322행 사이)를 먼저 확인한 뒤 아래 Step을 진행한다. 발췌되지 않은 구간에 이 계획이 가정하지 않은 조건부 렌더링이 있다면, 그 실제 구조를 보존하면서 아래 변경을 끼워 넣어라 — 구조가 다르면 이 Task를 진행하기 전에 BLOCKED로 보고하고 실제 코드를 다시 확인한다.)

- [ ] **Step 2: view-model에 레거시/신규 분리 로직 추가**

`reviews.view-model.ts`의 `toReviewsReceivedPageModel`(70-85행)을 수정 — 레거시(작성 시점 기준이 아니라 API가 이미 sportId 유무로 분리해서 내려주는 게 아니라 기존 `/reviews/received`는 여전히 모든 개별 리뷰를 반환하므로, 프론트에서 필터링한다는 뜻은 아니다):

**중요한 설계 정정**: Task 4의 `receivedSummary`는 `sportId: { not: null }`인(신규) 리뷰만 집계한다. 기존 `/reviews/received`(개별 리스트, `received()` 메서드)는 **모든** 리뷰(신규+레거시)를 여전히 반환한다 — 이 리스트를 그대로 "이전 리뷰"로 보여주면 신규 리뷰(아직 비공개 상태일 수도 있는)의 개별 내용까지 노출되어 버려 스펙을 위반한다. 따라서 백엔드도 함께 고쳐야 한다:

`apps/v1_api/src/reviews/reviews.service.ts`의 `received()` 메서드(70-91행) where 절에 `sportId: null`을 추가해서 **레거시 리뷰만** 반환하도록 좁힌다:

```typescript
  async received(user: V1AuthUser, query: ListReviewsQueryDto) {
    const limit = normalizeLimit(query.limit);
    const managedTeamIds = await this.managedTeamIds(user.id);
    const receivedFilters: Prisma.V1PostEventReviewWhereInput[] = [{ targetUserId: user.id }];
    if (managedTeamIds.length) receivedFilters.push({ targetTeamId: { in: managedTeamIds } });
    const reviews = await this.prisma.v1PostEventReview.findMany({
      where: {
        status: 'submitted',
        sportId: null, // 레거시(이 기능 출시 이전) 리뷰만 — 개별 노출은 소급 마스킹하지 않는다는 스펙에 따름
        OR: receivedFilters,
      },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: reviewInclude(),
    });
    const pageItems = reviews.slice(0, limit);

    return {
      items: pageItems.map((review) => this.toReviewDetail(review)),
      pageInfo: { nextCursor: reviews.length > limit ? pageItems.at(-1)?.id ?? null : null, hasNext: reviews.length > limit },
    };
  }
```

이 변경은 Task 6에 속해야 자연스럽지만(백엔드 변경이므로), 이 Task를 작성하며 발견된 필수 정정이라 여기 명시한다 — 실제 구현 시 **Task 6의 Step 7 커밋 전에 포함**시키거나, 이 Task 9에서 별도 백엔드 커밋으로 분리해도 무방하다(둘 다 dev PR 하나로 합쳐지므로 순서보다 포함 여부가 중요하다).

- [ ] **Step 3: `ReviewsReceivedPageClient`에 요약 쿼리 연결**

`reviews-api-clients.tsx` 135-147행 교체:

```tsx
export function ReviewsReceivedPageClient() {
  const [period, setPeriod] = useState<string | null>(null);
  const query = useV1ReceivedReviews();
  const summaryQuery = useV1ReceivedReviewSummary('user', period ?? undefined);
  const model = useMemo(() => toReviewsReceivedPageModel(query.data), [query.data]);

  return (
    <ReviewsReceivedPageView
      errorMessage={query.error instanceof Error ? query.error.message : null}
      loading={query.isLoading}
      model={model}
      onRetry={() => void query.refetch()}
      summary={summaryQuery.data}
      summaryLoading={summaryQuery.isLoading}
      period={period}
      onPeriodChange={setPeriod}
    />
  );
}
```

import 블록(5행)에 `useV1ReceivedReviewSummary` 추가.

- [ ] **Step 4: `ReviewsReceivedPageView`에 대시보드 마운트 + "이전 리뷰" 라벨링**

`reviews-page.tsx` 168-189행 교체:

```tsx
export function ReviewsReceivedPageView({
  errorMessage,
  loading,
  model,
  onRetry,
  summary,
  summaryLoading,
  period,
  onPeriodChange,
}: QueryStateProps & {
  model: ReviewsReceivedPageModel;
  summary: V1ReviewReceivedSummaryResponse | undefined;
  summaryLoading: boolean;
  period: string | null;
  onPeriodChange: (period: string | null) => void;
}) {
  const hasLegacyReviews = model.userGroups.length > 0 || model.teamGroups.length > 0;
  return (
    <AppChrome title="받은 리뷰" activeTab="my" bottomNav={false} backHref="/my/reviews?tab=received">
      <div className="tm-review-shell">
        <ReviewsSummaryDashboard summary={summary} period={period} onPeriodChange={onPeriodChange} loading={summaryLoading} />
        {hasLegacyReviews ? (
          <div style={{ marginTop: 24 }}>
            <div className="tm-my-section-label">이전 리뷰</div>
            <div className="tm-text-caption" style={{ marginBottom: 10 }}>이 기능이 도입되기 전에 받은 리뷰예요.</div>
            <ReviewsReceivedContent
              errorMessage={errorMessage}
              loading={loading}
              model={model}
              onRetry={onRetry}
            />
          </div>
        ) : null}
      </div>
    </AppChrome>
  );
}
```

import 블록에 `ReviewsSummaryDashboard`(`./reviews-summary-dashboard`), `V1ReviewReceivedSummaryResponse`(`@/types/api`) 추가.

- [ ] **Step 5: 기존 테스트 확인 및 갱신**

`reviews.view-model.test.ts`(경로: `apps/v1_web/src/components/reviews/reviews.view-model.test.ts`)를 읽고 `toReviewsReceivedPageModel` 관련 케이스가 있으면, mock 리뷰 데이터에 `sportId`가 응답에 없어도(백엔드가 레거시만 내려주므로 프론트 타입엔 변화 없음) 영향이 없는지 확인한다. `ReviewsReceivedPageView`를 직접 렌더링하는 테스트가 있다면 새 필수 prop(`summary`, `summaryLoading`, `period`, `onPeriodChange`)을 채워라.

- [ ] **Step 6: 관련 테스트 전부 실행**

Run: `pnpm --filter v1_web exec vitest run src/components/reviews/`
Expected: 전체 PASS.

- [ ] **Step 7: tsc + 패턴체크**

Run: `pnpm --filter v1_web exec tsc --noEmit && cd apps/v1_web && node scripts/v1-pattern-check.mjs`
Expected: 둘 다 clean.

- [ ] **Step 8: 커밋**

```bash
git add apps/v1_web/src/components/reviews/ apps/v1_api/src/reviews/reviews.service.ts
git commit -m "feat(v1/web): 받은 리뷰 화면에 집계 대시보드 추가, 개별 리스트는 레거시(이전 리뷰)로 한정"
```

---

## Task 10: 통합 검증 (마지막)

**Files:** 없음(검증 전용)

- [ ] **Step 1: 백엔드 전체 리뷰 관련 테스트**

Run: `pnpm --filter v1_api exec jest src/reviews`
Expected: 전체 PASS.

- [ ] **Step 2: 프론트 전체 스위트**

Run: `pnpm --filter v1_web exec vitest run`
Expected: 전체 PASS(무관한 기존 flaky 타이머 경고는 알려진 baseline — Task 109에서 확인됨).

- [ ] **Step 3: 양쪽 tsc**

Run: `pnpm --filter v1_api exec tsc --noEmit && pnpm --filter v1_web exec tsc --noEmit`
Expected: 둘 다 exit 0.

- [ ] **Step 4: prisma validate (DATABASE_URL 더미값으로 문법만)**

Run: `cd apps/v1_api && DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma validate`
Expected: `The schema ... is valid`.

- [ ] **Step 5: changeset 추가**

`.changeset/v1-review-anonymized-aggregates.md`:

```markdown
---
"v1_api": minor
"v1_web": minor
---

Add anonymized, aggregated review visibility for match/team-match mutual reviews: individual reviews are no longer shown to the reviewed party — only per-sport rating averages and tag frequencies (all-time or a selected month), revealed once both sides have submitted or after 72 hours. Team trust score now only aggregates team_match reviews (tournament fixture reviews are calculated separately).
```

- [ ] **Step 6: PR 오픈**

`git push -u origin <브랜치명>` 후 `gh pr create --base dev --title "feat(v1/reviews): 리뷰 익명화·지연공개·종목별 집계 (Task 117)" --body "..."` — body에 Task 117 스펙 문서와 이 계획서 링크, 검증 결과 요약.

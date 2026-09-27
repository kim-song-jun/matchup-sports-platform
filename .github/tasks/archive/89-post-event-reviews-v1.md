# 89. Post-Event Reviews V1

Status: Complete
Owner: Codex
Scope: `apps/v1_api`, `apps/v1_web`, `docs/scenarios`
Design Source: `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html` section `14 리뷰 최종`

## Goal

Build the v1 post-event review domain as a real backend + frontend feature based on the `14 리뷰 최종` design.

The feature lets users review other participants after a completed personal match and review the opposing team after a completed team match. Reviews use star ratings and predefined selectable tags. Free-text review body is out of scope for this design pass.

## Approval Gate

Every numbered step in this task requires explicit user approval before implementation starts.

- Do not proceed from one step to the next automatically.
- After completing a step, update this task document and ask for approval for the next step.
- If a step discovers a contract conflict, stop and log it in `Ambiguity Log` before asking for direction.

## Current State

- v1 has no dedicated post-event review DB model or API.
- Existing `reviewedAt` fields in v1 Prisma models refer to application approval/rejection review, not post-event user reviews.
- `V1UserReputationSummary.reviewCount` exists and can be updated by real post-event reviews.
- Current v1 frontend has review-related text and disabled/review CTA surfaces, but no real review route or review submit flow.
- Design section `14 리뷰 최종` contains the target UI flow:
  - review inbox with write/written tabs
  - per-target review writing
  - received reviews
  - submit complete state

## Non-Goals

- Do not copy or reference legacy app review code.
- Do not implement venue reviews in this task.
- Do not add free-text review comments unless the design is changed and approved.
- Do not simulate successful save in frontend without a real API path.
- Do not build payment, refund, badge, or dispute behavior beyond the review-specific contract.
- Do not solve exact team-match participant snapshotting unless approved as an added DB scope.

## Acceptance Criteria

- [x] Completed personal matches unlock eligible review targets only for approved/active participants.
- [x] Completed team matches unlock eligible opposing team review targets only for valid participating team members.
- [x] Cancelled, not-participated, disputed, expired, and self-review cases are locked with concrete reasons.
- [x] A user can submit rating `1-5` and one or more predefined review tags for an eligible target.
- [x] Duplicate submissions for the same reviewer, target, and event do not create duplicate records.
- [x] Written reviews appear in the written tab.
- [x] Received reviews appear grouped by event.
- [x] Submitting a personal match review updates target user reputation summary using a clearly documented real-data signal.
- [x] Submitting a team match review updates target team trust score using a clearly documented real-data signal.
- [x] Frontend uses v1 shared shell/components/tokens and follows `14 리뷰 최종` design intent.
- [x] API, DTO, frontend hooks/types, seed/fixtures, scenarios, and tests are synced in the same change set.

## Step Checklist

- [x] 89-1. Task document setup.
  - Create this task document.
  - Preserve approval-gated workflow.
  - Capture initial DB/API/frontend plan.

- [x] 89-2. DB design approval.
  - Decide model names, relations, enum values, unique constraints, user reputation update policy, and team trust update policy.
  - Team-match team-review actor decision: one representative owner/manager review per participating team, backed by `reviewerTeamId`.
  - Output: approved Prisma design before schema edits.

- [x] 89-3. API design approval.
  - Decide endpoint paths, DTOs, response shapes, duplicate submit behavior, and permission rules.
  - Output: approved controller/service contract before backend edits.

- [x] 89-4. Frontend design approval.
  - Decide routes, component structure, query state, loading/error/empty states, submit success flow, and existing `/my` CTA integration.
  - Output: approved frontend implementation plan before UI edits.

- [x] 89-5. Prisma schema and migration implementation.
  - Update `apps/v1_api/prisma/schema.prisma`.
  - Add migration.
  - Update seed data if needed.
  - Run Prisma generation.

- [x] 89-6. Backend reviews module implementation.
  - Add `reviews.module.ts`, `reviews.controller.ts`, `reviews.service.ts`, DTOs, and tests.
  - Implement eligibility, submit, written list, received list, and reputation update.

- [x] 89-7. Frontend data layer implementation.
  - Add review API types, query keys, and hooks.
  - Add fallback view-model data only for loading/error/empty-safe UI, not fake save success.

- [x] 89-8. Frontend UI implementation.
  - Add review routes and components based on `14 리뷰 최종`.
  - Implement write/written tabs, per-target stars/tags, received reviews, and completion state.

- [x] 89-9. Existing surface integration.
  - Link `/my` ended match CTA to reviews.
  - Link review notification destinations to reviews.
  - Ensure navigation is not lost after submit/invalidation.

- [x] 89-10. Scenario and docs sync.
  - Update `docs/scenarios/12-v1-sm-new-e2e-scenarios.md`.
  - Update `docs/scenarios/09-payment-review-badge.md`.
  - Update task progress and any new gotchas.

- [x] 89-11. Validation.
  - Backend tests.
  - Frontend typecheck/tests.
  - Route smoke or E2E for `V1-14-001` through `V1-14-004` where feasible.

## Proposed DB Direction

89-2 status: approved by user on 2026-06-01.

### Candidate Models

`V1PostEventReview`

Responsibilities:
- Store one review from one user, or one representative team action, to one target entity for one completed event.
- Represent personal match user reviews and team match team reviews with a shared source discriminator.
- Provide the source of truth for received/written review lists.
- Feed `V1UserReputationSummary`.

Candidate fields:
- `id`
- `reviewerUserId`
- `reviewerTeamId`
- `targetType`: `user | team`
- `targetUserId`
- `targetTeamId`
- `sourceType`: `match | team_match`
- `sourceId`
- `rating`: integer `1-5`
- `status`: `submitted | hidden | removed`
- `submittedAt`
- `createdAt`
- `updatedAt`

Candidate indexes:
- unique personal match identity and team match identity, finalized in 89-2.
- index `[reviewerUserId, sourceType, submittedAt]`
- index `[reviewerTeamId, sourceType, submittedAt]`
- index `[targetUserId, submittedAt]`
- index `[targetTeamId, submittedAt]`
- index `[sourceType, sourceId]`

`V1PostEventReviewTag`

Responsibilities:
- Store predefined selected tags for a review.
- Preserve label snapshot for historical display even if future tag copy changes.

Candidate fields:
- `id`
- `reviewId`
- `tagCode`
- `labelSnapshot`
- `createdAt`

Candidate indexes:
- unique `[reviewId, tagCode]`
- index `[tagCode]`

## 89-2 DB Design Proposal

### Recommended Decision Summary

- Use a new dedicated post-event review table.
- Do not reuse `reviewedAt` fields because those mean application review, not user-to-user post-event review.
- Use a shared `sourceType + sourceId` pair instead of nullable `matchId` / `teamMatchId` unique pairs.
- Store selected tags in a child table because `14 리뷰 최종` supports multiple selectable tags.
- Team match reviews target the opposing team, not individual users.
- Team match reviews are submitted as one representative review per participating team, not one review per member.
- Do not add a team-match participant/member snapshot in the first implementation.
- For team matches, use the completed team-match's host team and approved applicant team current owner/manager memberships as the first v1 submitter eligibility rule.
- Keep exact completed-event membership snapshot as an explicitly logged follow-up risk.

### New Enums

```prisma
enum V1PostEventReviewSourceType {
  match
  team_match
}

enum V1PostEventReviewTargetType {
  user
  team
}

enum V1PostEventReviewStatus {
  submitted
  hidden
  removed
}
```

### New Relations On `V1User`

```prisma
postEventReviewsWritten      V1PostEventReview[] @relation("V1PostEventReviewReviewer")
postEventUserReviewsReceived V1PostEventReview[] @relation("V1PostEventReviewTargetUser")
```

### New Relations On `V1Team`

```prisma
postEventTeamReviewsReceived V1PostEventReview[] @relation("V1PostEventReviewTargetTeam")
postEventReviewsWritten      V1PostEventReview[] @relation("V1PostEventReviewReviewerTeam")
```

### New Model: `V1PostEventReview`

```prisma
model V1PostEventReview {
  id             String                      @id @default(uuid())
  reviewerUserId String                      @map("reviewer_user_id")
  reviewerTeamId String?                     @map("reviewer_team_id")
  sourceType     V1PostEventReviewSourceType @map("source_type")
  sourceId       String                      @map("source_id")
  targetType     V1PostEventReviewTargetType @map("target_type")
  targetUserId   String?                     @map("target_user_id")
  targetTeamId   String?                     @map("target_team_id")
  rating         Int
  status         V1PostEventReviewStatus     @default(submitted)
  submittedAt    DateTime                    @default(now()) @map("submitted_at")
  hiddenAt       DateTime?                   @map("hidden_at")
  removedAt      DateTime?                   @map("removed_at")
  createdAt      DateTime                    @default(now()) @map("created_at")
  updatedAt      DateTime                    @updatedAt @map("updated_at")

  reviewerUser V1User  @relation("V1PostEventReviewReviewer", fields: [reviewerUserId], references: [id], onDelete: Restrict)
  reviewerTeam V1Team? @relation("V1PostEventReviewReviewerTeam", fields: [reviewerTeamId], references: [id], onDelete: Restrict)
  targetUser   V1User? @relation("V1PostEventReviewTargetUser", fields: [targetUserId], references: [id], onDelete: Restrict)
  targetTeam   V1Team? @relation("V1PostEventReviewTargetTeam", fields: [targetTeamId], references: [id], onDelete: Restrict)
  tags         V1PostEventReviewTag[]

  @@unique([reviewerUserId, targetUserId, sourceType, sourceId])
  @@unique([reviewerTeamId, targetTeamId, sourceType, sourceId])
  @@index([reviewerUserId, sourceType, submittedAt])
  @@index([reviewerTeamId, sourceType, submittedAt])
  @@index([targetUserId, submittedAt])
  @@index([targetTeamId, submittedAt])
  @@index([sourceType, sourceId])
  @@index([targetType])
  @@index([status])
  @@map("v1_post_event_reviews")
}
```

Notes:

- `sourceId` points to `V1Match.id` when `sourceType = match`.
- `sourceId` points to `V1TeamMatch.id` when `sourceType = team_match`.
- `sourceType = match` must use `targetType = user`, non-null `targetUserId`, and null `reviewerTeamId`.
- `sourceType = team_match` must use `targetType = team`, non-null `targetTeamId`, and non-null `reviewerTeamId`.
- `reviewerUserId` always stores the actual signed-in user who submitted the review for audit/display.
- `reviewerTeamId` stores the participating team represented by that user for team-match reviews and is the uniqueness owner for one-review-per-team behavior.
- Prisma cannot express a polymorphic FK, so service-level validation must confirm the source exists and is completed.
- Prisma cannot express conditional non-null target constraints directly, so service validation must enforce target consistency.
- `hiddenAt` / `removedAt` are reserved for future moderation/admin behavior without deleting trust history.

### New Model: `V1PostEventReviewTag`

```prisma
model V1PostEventReviewTag {
  id            String   @id @default(uuid())
  reviewId      String   @map("review_id")
  tagCode       String   @map("tag_code")
  labelSnapshot String   @map("label_snapshot")
  createdAt     DateTime @default(now()) @map("created_at")

  review V1PostEventReview @relation(fields: [reviewId], references: [id], onDelete: Cascade)

  @@unique([reviewId, tagCode])
  @@index([tagCode])
  @@map("v1_post_event_review_tags")
}
```

### Review Tag Catalog

For v1, keep the tag catalog in application code, not DB.

Rationale:

- `14 리뷰 최종` defines a small fixed set of tags.
- A DB-backed catalog adds admin/catalog management scope that is not needed for this feature.
- `labelSnapshot` preserves historical display if tag copy changes later.

Initial tag codes:

| Code | Label |
| --- | --- |
| `punctual` | 시간 약속을 잘 지켜요 |
| `manner` | 매너가 좋아요 |
| `teamwork` | 팀워크가 좋아요 |
| `communication` | 소통이 원활해요 |
| `active` | 운동에 적극적으로 참여해요 |
| `considerate` | 배려심이 있어요 |
| `passionate` | 열정적으로 운동해요 |
| `play_again` | 또 같이 운동하고 싶어요 |

### Rating Constraint

Prisma schema alone will store `rating Int`.

Validation layers:

- DTO: `@IsInt()`, `@Min(1)`, `@Max(5)`.
- Service: reject non-integer or out-of-range values defensively.
- Optional migration-level DB check constraint can be added manually if approved, but this repo's existing Prisma migrations mostly rely on schema + DTO validation.

Recommended default:

- Use DTO + service validation first.
- Do not add manual SQL check constraint in the first pass unless user asks for DB-level rating enforcement.

### Eligibility Data Dependency

Personal match eligibility:

- Source exists in `V1Match`.
- `V1Match.status = completed` or `completedAt IS NOT NULL`.
- Reviewer has a `V1MatchParticipant` row for the match with status `active` or `completed`.
- Target has a `V1MatchParticipant` row for the match with status `active` or `completed`.
- Reviewer and target are different users.
- Existing review unique key prevents duplicate writes.

Team match eligibility:

- Source exists in `V1TeamMatch`.
- `V1TeamMatch.status = completed` or `completedAt IS NOT NULL`.
- Team match has a host team and approved applicant team.
- Reviewer is currently an active owner/manager of either participating team.
- `reviewerTeamId` is the participating team represented by the reviewer.
- Target is the opposite participating team.
- A team cannot review itself for the same team match.
- Existing review unique key prevents duplicate writes.

Team-match limitation:

- This does not preserve the exact membership roster at match completion time.
- Exact historical reviewer eligibility requires a new event participant/member snapshot table, which is larger than the minimum DB needed for `14 리뷰 최종`.

Recommended follow-up if exactness becomes required:

- Add `V1TeamMatchReviewMemberSnapshot` or a broader `V1EventParticipantSnapshot` table.
- Create rows when a team match is completed.
- Use the snapshot for all future review eligibility.

### Reputation Summary Update Policy

Recommended first-pass user reputation policy for personal match reviews:

- Count only reviews with `status = submitted`.
- Recalculate target user's `reviewCount` as count of submitted reviews.
- Recalculate target user's `mannerScore` as average `rating`, rounded to two decimals.
- Set `sourceLabel = "완료 경기 리뷰 기반"`.
- Set `calculatedAt = now()`.

Recommended first-pass team trust policy for team match reviews:

- Count only submitted team-target reviews.
- Recalculate target team's `V1TeamTrustScore.mannerScore` as average team review `rating`, rounded to two decimals.
- Keep `V1TeamTrustScore.matchCount` as completed-match count, not review count, unless a later task redefines it.
- Set `sourceLabel = "완료 팀매치 리뷰 기반"`.
- Set `calculatedAt = now()`.

Open approval point:

- If `verified` feels too strong for one review, use `estimated` until a threshold such as 3 reviews.
- Recommended default is:
  - `1-2` submitted reviews: `estimated`
  - `3+` submitted reviews: `verified`
  - `0` submitted reviews: existing state remains unchanged unless no summary exists.

### Migration Impact

Required:

- Add two enums.
- Add two relation fields to `V1User`.
- Add two relation fields to `V1Team`.
- Add `V1PostEventReview`.
- Add `V1PostEventReviewTag`.
- Create migration.
- Regenerate Prisma client.

Not required in the first DB pass:

- Backfill from legacy data.
- Destructive seed reset.
- Team-match roster snapshot table.
- Admin moderation table.

### Approval Questions For 89-2

1. Approved by user on 2026-06-01: use `sourceType + sourceId` polymorphic source design instead of nullable `matchId` / `teamMatchId` columns.
2. Approved by user on 2026-06-01: team-match reviews are team-target reviews, with the opposing team as the target.
3. Approved by user on 2026-06-01: no team-match membership snapshot in the first implementation, with current active team membership used only to decide who may submit a team review.
4. Approved by user on 2026-06-01: team-match reviews are one representative review per participating team, restricted to current owner/manager submitters, backed by `reviewerTeamId`.
5. Approved by user on 2026-06-01: reputation/trust threshold policy is `1-2 reviews = estimated`, `3+ reviews = verified`.

89-2 is complete. 89-3 API design can begin.

### Reputation Update

Minimum approved direction to evaluate in 89-2:

- On successful personal match review submit, update target user's `V1UserReputationSummary`.
- On successful team match review submit, update target team's `V1TeamTrustScore`.
- User `reviewCount` increments based on actual submitted user-target reviews.
- User and team `mannerScore` values are recalculated from submitted review ratings.
- `trustState` should move away from `sample` when the score is based on real completed-event reviews.
- `sourceLabel` should describe whether the signal is based on completed personal match reviews or completed team match reviews.

## Proposed API Direction

All endpoints use `/api/v1` prefix through Nest global config.

89-3 status: approved by user on 2026-06-02.

### Recommended API Surface

Candidate module files:

- `apps/v1_api/src/reviews/reviews.module.ts`
- `apps/v1_api/src/reviews/reviews.controller.ts`
- `apps/v1_api/src/reviews/reviews.service.ts`
- `apps/v1_api/src/reviews/dto/list-reviews.dto.ts`
- `apps/v1_api/src/reviews/dto/review-source.dto.ts`
- `apps/v1_api/src/reviews/dto/submit-review.dto.ts`

Endpoints:

- `GET /reviews?tab=pending|written`
  - Auth required.
  - Returns review inbox list for the current user.
  - `pending` includes completed personal matches where the user can review other participants and completed team matches where the user is owner/manager of a participating team that has not submitted its team representative review.
  - `written` includes user-written personal reviews and user-written team representative reviews.
  - Cursor pagination: `cursor`, `limit`.

- `GET /reviews/received`
  - Auth required.
  - Returns reviews received by the current user and reviews received by teams where the user is current owner/manager.
  - Cursor pagination: `cursor`, `limit`.

- `GET /reviews/sources/:sourceType/:sourceId`
  - Auth required.
  - `sourceType`: `match | team_match`.
  - Returns reviewable targets, locked targets, source summary, and already submitted state for a completed event.
  - For `match`, targets are eligible participant users.
  - For `team_match`, target is the opposing team and `reviewerTeamId` is resolved by service from current owner/manager membership.

- `POST /reviews`
  - Auth required.
  - Body: `sourceType`, `sourceId`, `targetType`, `targetUserId?`, `targetTeamId?`, `rating`, `tagCodes`.
  - Validates eligibility and duplicate policy.
  - Updates review records and reputation summary.

### DTO Contract

`ListReviewsQueryDto`

- `tab?: "pending" | "written"`
- `cursor?: string`
- `limit?: number`

`ReviewSourceParamsDto`

- `sourceType: "match" | "team_match"`
- `sourceId: string`

`SubmitReviewDto`

- `sourceType: "match" | "team_match"`
- `sourceId: string`
- `targetType: "user" | "team"`
- `targetUserId?: string`
- `targetTeamId?: string`
- `rating: number`
- `tagCodes: string[]`

Validation:

- `rating` must be an integer from `1` to `5`.
- `tagCodes` must be non-empty and must only contain known catalog codes.
- `sourceType = match` requires `targetType = user`, `targetUserId`, and no `targetTeamId`.
- `sourceType = team_match` requires `targetType = team`, `targetTeamId`, and no `targetUserId`.
- Client never sends `reviewerTeamId`; service resolves it for team matches.

### Response Contract

List response:

```ts
type ReviewListResponse = {
  items: ReviewListItem[];
  pageInfo: { nextCursor: string | null; hasNext: boolean };
};
```

Source response:

```ts
type ReviewSourceResponse = {
  source: {
    sourceType: 'match' | 'team_match';
    sourceId: string;
    title: string;
    completedAt: string | null;
  };
  reviewerTeam?: {
    teamId: string;
    name: string;
    role: 'owner' | 'manager';
  } | null;
  targets: ReviewTarget[];
};
```

Submit response:

```ts
type SubmitReviewResponse = {
  review: ReviewDetail;
  alreadySubmitted: boolean;
};
```

### Duplicate Submit Policy

Approved recommendation for 89-3:

- Return success-like `200` or `201` with `alreadySubmitted: true` when the same unique review already exists.
- Do not create or mutate a duplicate row.
- If the submitted payload conflicts with the existing review, return existing review data and `alreadySubmitted: true`; do not overwrite in v1.

Rationale:

- Mobile retry and double-tap cases should converge without creating duplicate UI states.
- True editing is a separate feature and is out of scope for Task 89.

### Permission And Error Policy

Common errors:

- `401 Unauthorized`: not signed in.
- `400 Bad Request`: invalid DTO, invalid target/source combination, unknown tag code, invalid rating.
- `403 Forbidden`: signed-in user is not eligible to review this source/target.
- `404 Not Found`: source or target does not exist.
- `409 Conflict`: source exists but is not completed or no longer reviewable.

Team match submit permission:

- Service resolves `reviewerTeamId` from the completed team match's host/applicant teams and the current user's active owner/manager membership.
- Current user must be active owner/manager of exactly one participating team for that source.
- Target team must be the opposing participating team.
- If the user is owner/manager of both teams, reject with `409 Conflict` and code `AMBIGUOUS_REVIEWER_TEAM` until a future UI explicitly supports selecting represented team.

### Service Responsibilities

- Build pending review sources from completed personal matches and completed team matches.
- Validate completed-event eligibility before every submit.
- Create `V1PostEventReview` and `V1PostEventReviewTag` in a transaction.
- Recalculate `V1UserReputationSummary` for personal target reviews.
- Recalculate `V1TeamTrustScore` for team target reviews.
- Use explicit Prisma `select` on runtime paths to avoid local DB drift false negatives.

### API Approval Questions For 89-3

1. Approved by user on 2026-06-02: endpoints are `GET /reviews`, `GET /reviews/received`, `GET /reviews/sources/:sourceType/:sourceId`, `POST /reviews`.
2. Approved by user on 2026-06-02: submit DTO uses `targetType`, nullable `targetUserId`, nullable `targetTeamId`, and service-resolved `reviewerTeamId`.
3. Approved by user on 2026-06-02: duplicate submit returns existing review with `alreadySubmitted: true`, no overwrite.
4. Approved by user on 2026-06-02: if a user manages both teams, reject with `AMBIGUOUS_REVIEWER_TEAM` for v1.
5. Approved by user on 2026-06-02: received list includes both current user's received reviews and teams where current user is owner/manager.

89-3 is complete. 89-4 frontend design can begin.

## Proposed Frontend Direction

89-4 status: approved by user on 2026-06-02.

Candidate routes:

- `/my/reviews`
  - Main review hub from `14 리뷰 최종`.
  - Two tabs: `작성할 리뷰`, `작성된 리뷰`.
  - Query state: `?tab=pending|written`.
  - Uses `GET /reviews`.

- `/my/reviews/[sourceType]/[sourceId]`
  - Per-source rating/tag entry screen.
  - Uses `GET /reviews/sources/:sourceType/:sourceId`.
  - Submits through `POST /reviews`.
  - Personal match: multiple user targets can appear in one screen.
  - Team match: one opposing-team target appears, with reviewer team context shown.

- `/my/reviews/received`
  - Received reviews grouped by event.
  - Uses `GET /reviews/received`.
  - Shows user received reviews and owner/manager team received reviews with clear target labels.

Candidate files:

- `apps/v1_web/src/app/my/reviews/page.tsx`
- `apps/v1_web/src/app/my/reviews/[sourceType]/[sourceId]/page.tsx`
- `apps/v1_web/src/app/my/reviews/received/page.tsx`
- `apps/v1_web/src/components/reviews/reviews-client.tsx`
- `apps/v1_web/src/components/reviews/reviews-page.tsx`
- `apps/v1_web/src/components/reviews/reviews-source-page.tsx`
- `apps/v1_web/src/components/reviews/reviews-received-page.tsx`
- `apps/v1_web/src/components/reviews/reviews-api-clients.tsx`
- `apps/v1_web/src/components/reviews/reviews.types.ts`
- `apps/v1_web/src/components/reviews/reviews.view-model.ts`

### Component Structure

- `ReviewsClient`
  - Owns tab query state, calls list API, maps API data into view model.
  - Keeps `pending` and `written` tabs mounted through stable list layout where possible.

- `ReviewsPage`
  - Pure UI for `/my/reviews`.
  - Renders compact stats row, segmented tab control, schedule/review cards, empty/error/loading states.

- `ReviewSourceClient`
  - Loads source detail and target list.
  - Maintains local draft ratings and selected tag codes per target.
  - Converts visible UI state into DTO-compatible submit payloads.

- `ReviewSourcePage`
  - Pure UI for target rows, stars, tag chips, progress card, sticky submit CTA.
  - For team matches, renders a team target card and a small represented-team label.

- `ReviewsReceivedClient` / `ReviewsReceivedPage`
  - Loads received reviews and groups them by source.
  - Separates "내가 받은 리뷰" and "내 팀이 받은 리뷰" when both exist.

### State And UX Contract

- Loading:
  - Use skeleton cards matching the final card heights to prevent layout jump.

- Empty pending:
  - Show compact solid empty state: no completed matches to review.
  - CTA may return to `/my/matches` or `/team-matches`, but must not simulate available reviews.

- Empty written:
  - Show completed-review empty state with no fake rating totals.

- Error:
  - Preserve current tab/source route.
  - Show retry button wired to query refetch.

- Submit success:
  - If all targets for a source are done, navigate to a completion state or `/my/reviews?tab=written`.
  - If some personal match targets remain, keep user on source page and mark submitted targets as completed.
  - If API returns `alreadySubmitted: true`, show submitted state without overwriting local server data.

- Ineligible/locked source:
  - Display the lock reason from API.
  - Disable stars/chips/submit, keep route readable.

### Visual Direction

- Use `14 리뷰 최종` as visual reference, not as directly imported JSX.
- Use existing `AppChrome`, `MobileGlassHeader` where current `/my` pages use it, v1 shared primitives, and existing `tm-*` classes.
- Keep review pages as account/utility surfaces: compact header, solid content cards, no hero/marketing intro.
- Keep cards at 8px radius or existing v1 radius scale; avoid nested cards.
- Tag chips are multi-select controls; star buttons are accessible buttons with selected state.
- Team match cards must label the review target as a team, not a participant user.

### `/my` Integration

- Add a review entry CTA from the existing `/my` surface only if it does not create a false affordance.
- Recommended entry:
  - `/my` quick action or menu row: `리뷰`
  - Badge/count from `GET /reviews?tab=pending` when available.
  - No local mock "pending" count after API integration.

### Frontend API Types

Add to `apps/v1_web/src/types/api.ts` or local reviews types before promoting shared types:

- `ReviewSourceType = 'match' | 'team_match'`
- `ReviewTargetType = 'user' | 'team'`
- `ReviewListItem`
- `ReviewSourceResponse`
- `ReviewTarget`
- `SubmitReviewPayload`
- `SubmitReviewResponse`

### MSW / Fixture Direction

- Add MSW handlers for the four API routes.
- Fixtures must include:
  - personal match pending with multiple user targets.
  - team match pending with one opposing team target and reviewer team context.
  - written reviews.
  - received user reviews.
  - received team reviews for owner/manager.
  - duplicate submit response with `alreadySubmitted: true`.

Implementation principle:

- Build real product UI using `AppChrome`, v1 primitives, and existing `tm-*` compatibility classes.
- Do not render the design-source JSX directly in product routes.
- Use `14 리뷰 최종` as visual and flow reference.

### Frontend Approval Questions For 89-4

1. Approved by user on 2026-06-02: routes are `/my/reviews`, `/my/reviews/[sourceType]/[sourceId]`, `/my/reviews/received`.
2. Approved by user on 2026-06-02: `/my/reviews` tab state uses `?tab=pending|written`.
3. Approved by user on 2026-06-02: team-match source page is a single opposing-team target with represented-team context.
4. Approved by user on 2026-06-02: received page shows both user received reviews and owner/manager team received reviews.
5. Approved by user on 2026-06-02: `/my` review entry CTA is added only after API-backed pending count is available, with no fake count.

89-4 is complete. 89-5 Prisma schema/migration implementation can begin after explicit user approval.

## Validation Plan

Backend:

- `pnpm --filter v1_api test`
- `pnpm --filter v1_api test:integration` if persistence/controller coverage requires it.

Frontend:

- `pnpm --filter v1_web exec tsc --noEmit`
- `pnpm --filter v1_web test`

Prisma:

- `pnpm v1:db:generate`
- Migration application path must not use destructive reset unless explicitly approved.

Scenario:

- `V1-14-001`: review unlocks after completed schedule.
- `V1-14-002`: select target and submit rating/tags.
- `V1-14-003`: duplicate review lock/idempotency.
- `V1-14-004`: ineligible schedule lock.

## Progress Snapshot

- 2026-06-01: Created approval-gated task document.
- 2026-06-01: 89-2 DB design approved by user.
- 2026-06-02: 89-3 API design approved by user.
- 2026-06-02: 89-4 frontend design approved by user.
- 2026-06-02: 89-5 Prisma schema/migration implementation completed.
- 2026-06-02: 89-6 backend reviews module implementation completed.
- 2026-06-02: 89-7 frontend data layer implementation completed.
- 2026-06-02: 89-8 frontend UI implementation completed.
- 2026-06-02: 89-9 existing surface integration completed.
- 2026-06-03: 89-10 scenario and docs sync completed.
- 2026-06-05: 89-11 validation completed. Regenerated Prisma Client, backend/frontend typechecks passed, backend unit suite passed, targeted frontend review view-model test passed, and review routes were added to responsive route smoke.
- Current step: complete.
- Next step: no Task 89 follow-up required; payment/badge scenarios remain outside this task.

## Ambiguity Log

- Team-match review target eligibility may need a completed-event participant snapshot to be exact. Current v1 schema has team memberships and approved applicant team, but no per-event team roster snapshot.
- User clarified that team matches should create reviews for the opposing team, not individual opposing players.
- Duplicate submit policy approved for first pass: idempotent convergence with `alreadySubmitted: true`.
- `trustState` transition policy approved for first pass: `1-2` submitted reviews are `estimated`, `3+` submitted reviews are `verified`.

## Change Log

### 2026-06-01

- Created Task 89 planning document.
- No runtime code, DB schema, API, or frontend route changes yet.
- Updated 89-2 DB proposal so personal matches target users and team matches target teams.
- Updated 89-2 DB proposal so team matches use one owner/manager representative review per team via `reviewerTeamId`.
- Marked 89-2 complete after user approval.
- Added 89-3 API design proposal with endpoints, DTOs, response shapes, duplicate policy, and permission rules.

### 2026-06-02

- Marked 89-3 complete after user approval.
- Added 89-4 frontend design proposal with routes, component boundaries, state handling, visual direction, `/my` integration, API types, and MSW fixture direction.
- Marked 89-4 complete after user approval.
- Added Prisma enums, review models, user/team relations, and `20260602000000_v1_post_event_reviews` migration.
- Verified `prisma validate` with a dummy `DATABASE_URL`; schema is valid.
- Ran `pnpm v1:db:generate` with a dummy `DATABASE_URL`; Prisma Client generation succeeded.
- Marked 89-5 complete.
- Added backend reviews module, controller, DTOs, service logic, AppModule registration, and controller contract spec.
- Implemented pending/written/received/source/submit review APIs, personal match user review eligibility, team match representative team review eligibility, duplicate submit convergence, and user/team score recalculation.
- Verified backend type check with `pnpm --filter v1_api exec tsc --noEmit`.
- Attempted targeted Jest runs for `reviews.controller.spec.ts`; Jest reached `Running one project: unit` but timed out after 60s with no test result. This remains a test runner follow-up, not a TypeScript compile failure.
- Marked 89-6 complete.
- Added v1_web review API types, query keys, hooks, MSW fixtures, and MSW handlers for list/source/received/submit review APIs.
- Verified frontend type check with `pnpm --filter v1_web exec tsc --noEmit`.
- Marked 89-7 complete.
- Added `/my/reviews`, `/my/reviews/[sourceType]/[sourceId]`, and `/my/reviews/received` routes.
- Added review hub, per-source review writing, received review grouping, star/tag controls, and submit complete state using the v1 review API hooks.
- Verified frontend type check with `pnpm --filter v1_web exec tsc --noEmit`.
- Marked 89-8 complete.
- Added API-backed `/my` review menu entry, ended-match review CTA links, and review notification route normalization.
- Verified frontend type check with `pnpm --filter v1_web exec tsc --noEmit`.
- Marked 89-9 complete.

### 2026-06-03

- Synced `docs/scenarios/12-v1-sm-new-e2e-scenarios.md` `V1-14-*` with the implemented post-event review contract.
- Updated `docs/scenarios/09-payment-review-badge.md` so `REV-001` points to Task 89's match/team-match review contract instead of stale sample-labelled review surfaces.
- Updated `docs/scenarios/index.md` with Task 89 review scenario status and next validation follow-up.
- Marked 89-10 complete.

### 2026-06-04

- Reconciled stale Acceptance Criteria checkboxes against implemented review API/UI/data/scenario evidence.
- Kept 89-11 open because targeted Jest previously timed out and route smoke/E2E has not been completed.

### 2026-06-05

- Ran `pnpm v1:db:generate` to refresh the Prisma Client for Task 89 review models.
- Verified `apps/v1_api` typecheck with `.\node_modules\.bin\tsc.CMD --noEmit`.
- Verified `apps/v1_web` typecheck with `.\node_modules\.bin\tsc.CMD --noEmit`.
- Verified backend unit suite with `pnpm --filter v1_api test -- --passWithNoTests`: 15 suites / 87 tests passed.
- Verified targeted frontend review unit with `pnpm exec vitest run src/components/reviews/reviews.view-model.test.ts --config ./vitest.config.mts`: 1 file / 1 test passed. Sandbox execution was blocked by esbuild parent-directory access, so this was rerun with approval outside the sandbox.
- Extended `scripts/qa/v1-responsive-route-smoke.mjs` to include review routes and query-string paths.
- Verified review route smoke with `BASE_URL=http://localhost:3013/v1 RUN_ID=reviews-responsive-smoke-final node scripts/qa/v1-responsive-route-smoke.mjs`: 29 routes across 320/390/430, issues 0. Report: `output/playwright/v1-responsive-smoke/reviews-responsive-smoke-final/report.md`.
- Marked 89-11 and Task 89 complete.

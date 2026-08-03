# Team And Venue Hub Scenarios

> Status: Partial
> team/venue hub read model, global affiliation context, tournaments surface는 구현됐고 API/runtime smoke까지 확인됐다. 다만 interactive browser QA와 owner-capability 편집 smoke는 follow-up이다.

> **Stack scope note (Todo 26 reconciliation, 2026-08-04):** everything from `## Scenario Checklist` through `## Notes` below describes the **legacy** `apps/api` (port 8111) / `apps/web` (port 3003) stack — `GET /api/v1/teams/:id/hub`, `GET /api/v1/venues/:id/hub`, and the legacy `tournaments` list/detail/create surface all live in `apps/api`, not `apps/v1_api`. This is not stale prose about removed behavior; it is a different, still-live legacy stack from the one Tasks 12-24 shipped. **v1 has no hub concept at all**: `apps/v1_api/src/teams/teams.controller.ts` (verified directly, see `04-team-and-membership.md`'s v1 section) has no `/hub` route, no `goodsCount`/`passesCount`/`eventsCount` aggregation, and no image-upload slot. Do not read this file as coverage for v1 team/tournament detail pages. See `## v1 stack (Tasks 12-24)` below for the closest v1 equivalents.

## v1 stack (Tasks 12-24)

v1 has no single "hub" aggregation endpoint; the closest equivalents are separate, purpose-specific surfaces added across Tasks 12-24:

| Legacy hub concept | v1 equivalent | Backend doc |
|---|---|---|
| Team hub `goods/passes/events` sections | Not present in v1. Team detail (`apps/v1_web/src/app/teams/[id]/page.tsx`) links to the Task 12 schedule list (`apps/v1_web/src/app/teams/[id]/schedules/**`, `GET /teams/:id/schedules`) and a records page (`apps/v1_web/src/app/teams/[id]/records/page.tsx`) | `docs/api/domains/team-schedules.md`, `docs/api/domains/public-records.md` |
| Venue hub | Not present in v1 at all — no `apps/v1_api/src/venues/` module exists in this codebase (v1 has no venue domain; venues remain a legacy-stack-only concept). | n/a |
| `tournaments` list/detail/create surface | Fully rebuilt: `apps/v1_web/src/app/tournaments/**` (list, detail, apply, schedule, results, bracket, awards, reviews) backed by `apps/v1_api/src/tournaments/**` — a materially larger surface than the legacy minimal list/detail/create described below (gender/quota wizard per `17-tournament-gender-wizard.md`, staff/fields/lineup/operations-board per Task 18, result review/officialize/void per Task 22, public schedule/match/team/player projections per Task 24) | `docs/api/domains/tournament-operations.md`, `docs/api/domains/tournament-operations-auth.md`, `docs/api/domains/public-records.md` |

### Todo 26 E2E scenario ledger for this domain

| ID | Covers | Primary spec |
|---|---|---|
| `E2E-PUBLIC-01` | Public visibility matrix (`hidden`/`status_only`/`live`/`official_only`) on `GET /tournaments/:id/schedule`, `GET /tournaments/:id/matches/:fixtureId`, `GET /teams/:id/records`, `GET /users/:id/records` (Task 24, see `docs/api/domains/public-records.md`), plus consent revoke/regrant hiding a previously-eligible participant's identity. | `e2e/v1-tests/tournament.spec.ts` |

`e2e/v1-tests/tournament.spec.ts` today only asserts `/tournaments` list render and list→detail→`/apply` navigation for the `applicant` persona (verified by reading the spec file) — it does not exercise the public-records routes or the visibility/consent matrix at all. `E2E-PUBLIC-01` is a new ID as of this reconciliation; implementing it is out of this doc-reconciliation task's own scope. This row is `Unverified` — no Playwright coverage exists yet — not `Verified`.

## Legacy stack (`apps/api` / `apps/web`) — Scenario Checklist

## Scenario Checklist

- [x] HUB-001 팀 허브가 `overview / goods / passes / events` 구조와 honest empty state를 노출한다.
- [x] HUB-002 장소 허브가 section count와 기존 schedule/review 맥락을 유지한다.
- [x] HUB-003 전역 `lessons`, `marketplace`는 평탄 목록을 유지하면서 team/venue affiliation context를 함께 보여준다.
- [x] HUB-004 `tournaments` 목록/상세/등록 surface가 실제 API contract와 맞물린다.
- [ ] HUB-005 owner/admin capability 기반 edit flow의 interactive browser smoke

## HUB-001 팀 허브 집계와 빈 상태

### Steps

- [x] `GET /api/v1/teams/:id/hub` 응답을 확인한다.
- [x] `/teams/:id` route가 200을 반환하는지 확인한다.

### Expected

- [x] `sections.goodsCount / passesCount / eventsCount`가 존재한다.
- [x] 팀 허브가 top-level `goods`, `passes`, `events` 배열을 받는다.
- [x] 데이터가 없을 때 허브는 가짜 카드 대신 honest empty state를 렌더한다.

## HUB-002 장소 허브 집계와 capability 노출

### Steps

- [x] `GET /api/v1/venues/:id/hub` 응답을 확인한다.
- [x] `/venues/:id`와 `/venues/:id/edit` route가 200을 반환하는지 확인한다.

### Expected

- [x] `sections.goodsCount / passesCount / eventsCount / scheduleCount / reviewCount`가 존재한다.
- [x] 장소 허브는 `passes[*].venue` 요약을 포함한다.
- [x] anonymous/default viewer에서는 `canEditProfile`가 false로 내려온다.

## HUB-003 전역 flat list의 affiliation context

### Steps

- [x] `lessons`, `marketplace` 목록 구현이 `team` 또는 `venue` summary를 소비하는지 확인한다.

### Expected

- [x] 전역 목록은 여전히 flat browse를 유지한다.
- [x] 소속 데이터가 있는 항목은 team/venue publisher context를 함께 표시한다.

## HUB-004 대회 surface와 저장 계약

### Steps

- [x] `GET /api/v1/tournaments` 응답을 확인한다.
- [x] `/tournaments` route가 200을 반환하는지 확인한다.
- [x] 등록 폼 payload가 `eventDate -> startDate/endDate`로 변환되는지 확인한다.

### Expected

- [x] 대회 목록은 empty state 또는 실제 이벤트 카드를 안정적으로 렌더한다.
- [x] 등록 폼은 실제 저장되지 않는 city/district/manual venue 입력을 노출하지 않는다.
- [x] 대회 status 라벨은 backend status(`recruiting/full/ongoing/...`)와 일치한다.

## HUB-005 편집 capability browser smoke

### Current Status

- `Implemented`
  - 팀 수정은 `PATCH /teams/:id`, 삭제는 `DELETE /teams/:id`로 연결돼 있다.
  - 장소 수정은 `PATCH /venues/:id`로 연결돼 있고, 허브 capability 기준으로 CTA가 노출된다.
- `Follow-up`
  - owner/admin 계정으로 실제 브라우저에서 edit CTA, 저장 완료, redirect까지 한 번 더 닫아야 한다.

## Evidence

- `pnpm --filter api db:generate`
- `pnpm --filter api exec tsc --noEmit`
- `pnpm --filter api build`
- `pnpm --filter api test -- --runInBand src/teams/teams.service.spec.ts src/venues/venues.service.spec.ts src/lessons/lessons.service.spec.ts src/marketplace/marketplace.service.spec.ts src/tournaments/tournaments.service.spec.ts`
- `pnpm --filter web exec tsc --noEmit`
- `pnpm --filter web exec vitest run src/hooks/__tests__/use-api-teams.test.tsx src/hooks/__tests__/use-api-lessons.test.tsx`
- `curl http://localhost:8111/api/v1/health`
- `curl http://localhost:8111/api/v1/teams/:id/hub`
- `curl http://localhost:8111/api/v1/venues/:id/hub`
- `curl -I http://localhost:3003/teams/:id`
- `curl -I http://localhost:3003/venues/:id`
- `curl -I http://localhost:3003/tournaments`

## Notes

- 2026-04-11: venue self-serve는 `VenueMembership`까지는 아니지만 `ownerId + admin override` 범위로만 열렸다.
- 2026-04-11: browser MCP session이 끊겨 이번 round는 API/runtime smoke 중심으로 닫았고, full interactive browser smoke는 follow-up으로 남긴다.
- 2026-08-04 (Todo 26): confirmed by directly reading `apps/v1_api/src/teams/teams.controller.ts` and grepping `apps/v1_api/src` for `venue` that v1 has no hub route and no venue domain at all (only tournament-venue *display* components exist under `apps/v1_web/src/components/tournaments/`, which read venue text/coordinates off a tournament, not a standalone venue entity). Added the `## v1 stack (Tasks 12-24)` section above mapping legacy hub concepts to their v1 equivalents and naming `E2E-PUBLIC-01`.

# Task 48 — Team and Venue Hub Hierarchy

## Summary

- 팀 페이지와 장소 페이지를 "소개 상세"에서 "소유 주체별 허브"로 확장한다.
- 전역 `lessons`, `marketplace`, 향후 `tournaments`는 계속 평탄 목록으로 유지하되, 팀/장소 상세에서는 섹션형 계층 구조로 같은 자산을 재조합한다.
- 허브 안에서는 굿즈(유니폼, 팀 용품, 장비 대여), 수강 프로그램/수강권(그룹, 개인), 대회 같은 오퍼링을 주체 맥락 안에서 함께 보여준다.
- 팀은 기존 owner/membership 권한을 재사용하고, 장소는 운영자 권한 모델을 별도 도입한다.

## Problem

현재 코드베이스는 팀/장소 상세가 단일 엔티티 소개 화면에 가깝다.

- 팀 상세는 소개, 최근 경기, 활동 정보, SNS 중심이다.
- 장소 상세는 소개, 시설 정보, 리뷰, 예약 목록 중심이다.
- 전역 `lessons`와 `marketplace`는 각각 독립 목록이며 팀/장소와 소유 관계로 연결되지 않는다.
- `LessonTicketPlan`은 존재하지만 허브 IA 안에서 "프로그램/수강권" 표면으로 재구성되어 있지 않다.
- 팀은 `ownerId` + `TeamMembership`가 있지만 장소는 admin CRUD만 존재하고 운영자 권한 모델이 없다.
- 대회 도메인은 아직 저장소에 없다.

이 상태에서는 사용자가 전역 탐색과 소유 주체별 탐색을 자연스럽게 오갈 수 없고, 팀장/장소 운영자가 자기 허브 안에서 상품과 프로그램을 운영할 수 없다.

## Goals

1. `/teams/[id]`, `/venues/[id]`를 허브 landing page로 재정의한다.
2. 허브 안에서는 섹션형 hierarchy를 제공한다.
3. 전역 flat discovery와 허브 기반 contextual discovery를 동시에 유지한다.
4. 팀장/운영자가 허브 소속 상품을 생성·수정할 수 있게 한다.
5. 도메인별 허위 affordance 없이 실제 저장 경로와 노출 구조를 일치시킨다.

## Non-Goals

- 임의 depth를 가진 CMS형 page builder
- v1에서 tournament full domain 일괄 구현
- 기존 global route를 팀/장소 nested route로 완전히 대체
- 장소 권한 없이 UI만 먼저 노출하는 false affordance

## Product Decision

허브의 "계층 구조"는 자유로운 트리 편집이 아니라, **typed section hierarchy**로 정의한다.

- Team hub sections: `overview`, `goods`, `programs/tickets`, `matches`, `mercenary`, `tournaments(future)`
- Venue hub sections: `overview`, `rentals/goods`, `programs/tickets`, `schedule`, `reviews`, `tournaments(future)`
- `goods`는 v1에서 별도 inventory 도메인이 아니라 `marketplace`의 sell/rent/group-buy surface를 팀/장소 허브 맥락으로 재조합하는 것으로 본다.
- `programs/tickets`는 lesson entity + ticket plan entity를 함께 묶어 "그룹/개인/기간권/회차권"을 설명 가능한 허브 섹션으로 본다.
- 전역 목록은 계속 `marketplace`, `lessons`, `tournaments(future)`에서 flat browse를 제공한다.
- 각 상세 카드/CTA는 소속 허브(team/venue)를 명시하고 역링크를 제공한다.

## Architecture Direction

### 1. Ownership / affiliation model

- `Lesson`은 `hostId`를 유지하되 optional affiliation을 추가한다.
  - v1 candidate: `teamId?: string`
  - keep existing `venueId?: string`
- `LessonTicketPlan`은 별도 affiliation을 만들지 않고 parent `Lesson` affiliation을 상속한다.
- `MarketplaceListing`은 `sellerId`를 유지하되 optional affiliation을 추가한다.
  - v1 candidate: `teamId?: string`
  - v1 candidate: `venueId?: string`
- 저장 규칙:
  - 개인 소속 없음: 둘 다 null
  - 팀 소속: `teamId` set
  - 장소 소속: `venueId` set
  - 동시 소속은 금지

### 2. Hub read model

- 허브 landing은 개별 엔드포인트 다중 호출이 아니라 aggregate read model로 제공한다.
- candidate endpoints:
  - `GET /teams/:id/hub`
  - `GET /venues/:id/hub`
- response should include:
  - base entity profile
  - section counts
  - featured items per section
  - ticket/program summary per lesson section where applicable
  - editable capabilities for current viewer

### 3. Section detail routes

- typed subroutes only:
  - `/teams/[id]/goods`
  - `/teams/[id]/programs`
  - `/teams/[id]/matches`
  - `/teams/[id]/mercenary`
  - `/venues/[id]/goods`
  - `/venues/[id]/programs`
  - `/venues/[id]/schedule`
- `tournaments` route is reserved for future domain rollout.

### 4. Permissions

- Team:
  - reuse `TeamMembershipService.assertRole(teamId, userId, manager)` for affiliated create/update
  - owner/manager can edit hub profile and affiliated inventory
- Venue:
  - add venue operator membership model before exposing self-serve edit CTA
  - admin remains override authority

## Recommended Rollout

### Phase 1 — Read-only hub foundation

- Introduce hub landing DTO and typed section UI for team/venue
- Reuse currently available sections first
  - Team: overview, recent matches, mercenary, programs/tickets(if affiliated), goods(if affiliated)
  - Venue: overview, schedule, reviews, programs/tickets(by `venueId`), goods(if affiliated)
- Add source badge / publisher badge on lesson and marketplace cards
- In lesson/program cards, expose group/private type and active ticket plan summary when available

### Phase 2 — Affiliated lessons and goods

- Add optional `teamId` / `venueId` affiliation fields
- Extend create/edit APIs with affiliation payload
- Add context-aware create flows from team/venue hub
- Keep global flat lists unchanged, but enable filtering by affiliation
- Let team managers create team-scoped group/private programs and ticketed offers from hub context

### Phase 3 — Venue operator model

- Introduce `VenueMembership` / `VenueOperator` role model
- Add self-serve venue edit and affiliated inventory management
- Preserve admin override flows

### Phase 4 — Tournament domain

- Create explicit tournament domain and attach organizer affiliation
- Mount it as another typed section in team/venue hubs and global flat discovery

## Data Model Options

### Option A — Optional foreign keys on each domain model

Add nullable `teamId` / `venueId` to `Lesson`, `MarketplaceListing`, future `Tournament`.

- Pros
  - Prisma-friendly
  - explicit indexes and constraints
  - easiest incremental rollout
- Cons
  - every participating model needs schema change
  - new owner types increase field count

### Option B — Generic publisher table

Create generic publisher entity and connect goods/lessons/tournaments to publisher.

- Pros
  - uniform abstraction
  - easier to add future owner types
- Cons
  - larger migration
  - more indirection than current codebase needs
  - higher risk for this repository stage

### Decision

Choose **Option A** for now. This repository already models team ownership explicitly and does not yet justify a new polymorphic ownership layer.

## API Notes

- Global list endpoints keep existing contracts and add optional filters:
  - `teamId`
  - `venueId`
- Hub endpoints provide a curated first payload so team/venue landing pages do not fan out into many independent requests.
- Create/update DTOs must reject invalid affiliation combinations.
- Venue schedule remains reservation list contract, not availability grid.

## Migration Notes

- `Lesson.venueId` existing data can power venue hub immediately.
- `LessonTicketPlan` read model can be surfaced immediately wherever affiliated lessons already exist.
- `MarketplaceListing` has no reliable existing team/venue ownership; default to unassigned.
- No destructive backfill.
- Old records should render without affiliation badges rather than fake ownership.

## Testing Strategy

### Backend

- unit tests for affiliation validation and permission guards
- integration tests for `/teams/:id/hub`, `/venues/:id/hub`
- create/update tests ensuring unauthorized affiliation assignment is rejected

### Frontend

- hook tests for `useTeamHub`, `useVenueHub`
- route tests for typed section navigation and conditional edit CTA
- regression tests preserving flat list behavior on `/lessons` and `/marketplace`
- UI tests verifying lesson/program sections render ticket plan summary without implying unavailable purchase states

### E2E

- manager opens team hub and creates affiliated lesson/listing
- anonymous user browses flat list and navigates back to team/venue hub
- venue operator edits venue hub after role bootstrap

## Acceptance Criteria

### Phase 1

- Given a user visits `/teams/:id`
  When affiliated content exists
  Then the page renders typed hub sections with counts and section entry CTA

- Given a user visits `/venues/:id`
  When the venue has schedule/reviews/affiliated content
  Then the page renders the venue hub without breaking existing schedule contract

- Given a user visits `/lessons` or `/marketplace`
  When an item belongs to a team or venue
  Then the item still appears in the flat list and also exposes its publisher context

- Given a user visits a team or venue hub
  When lesson programs have group/private types or ticket plans
  Then the hub surfaces those distinctions in the programs section without inventing unsupported purchase flows

### Phase 2

- Given a team owner or manager creates a lesson/listing from team context
  When save succeeds
  Then the record is persisted with `teamId` affiliation and appears in both flat list and team hub

- Given a team owner or manager creates a private/group lesson program with ticket plans from hub context
  When save succeeds
  Then the program and its ticket summary appear in both global discovery and the team hub programs section

- Given an unauthorized user tries to assign someone else's team or venue affiliation
  When save is attempted
  Then the API rejects the request

### Phase 3

- Given a venue operator with manager+ role edits venue hub content
  When save succeeds
  Then venue hub changes are visible without admin-only fallback

## Open Questions

1. 장소 self-serve 운영 권한을 개인 사용자 기준으로 둘지, 조직 계정 기준으로 둘지
2. 팀/장소 허브의 첫 섹션 탭을 동일하게 맞출지, 도메인별로 다르게 둘지
3. tournament를 독립 도메인으로 바로 도입할지, phase 4까지 deferred할지
4. goods를 `marketplace` 확장으로 볼지, 별도 catalog/rental inventory로 분리할지

## Implementation Order

1. task/spec 확정
2. hub DTO + read endpoint 설계
3. team hub UI landing
4. venue hub UI landing
5. affiliation schema for lessons/listings
6. context-aware create/edit flows
7. venue operator permissions
8. tournament domain

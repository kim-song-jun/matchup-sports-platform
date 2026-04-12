# Task 48 — Team/Venue Hub IA and Owner-Scoped Catalog

Owner: project-director -> backend-dev / frontend-dev
Date drafted: 2026-04-11
Status: Completed
Priority: P1

## Context

현재 제품은 전역 탐색 surface와 소유 주체 surface가 분리되어 있다.

- 전역 surface: `/teams`, `/venues`, `/lessons`, `/marketplace`
- 팀 상세 surface: `/teams/:id`, `/teams/:id/matches`, `/teams/:id/mercenary`
- 장소 상세 surface: `/venues/:id`

하지만 팀/장소 내부에서 자신이 제공하는 상품과 활동을 계층적으로 보여주는 정보구조는 아직 없다. `SportTeam`, `Venue`, `Lesson`, `MarketplaceListing`은 독립 모델로 존재하고, lesson은 `hostId`, marketplace는 `sellerId`만 가진다. 즉 “어느 팀 페이지/장소 페이지에 속한 상품인가”를 표현하는 canonical parent contract가 없다.

또한 venue 도메인은 현재 public browse + review + admin CRUD만 있고, team과 같은 owner/manager membership model이 없다. 따라서 “장소도 마찬가지” 요구를 그대로 적용하려면 venue tenancy/permissions를 새로 설계해야 한다.

마지막으로 “대회” 도메인은 아직 저장소에 구현되어 있지 않다. 이 task에서는 future-proof IA와 extension point까지 설계하되, 실구현 범위는 별도 phase로 나눈다.

## Goal

- 사용자는 전역 `/marketplace`, `/lessons`, 향후 `/tournaments`에서 평탄화된 전체 탐색을 계속 사용할 수 있다.
- 사용자는 `/teams/:id`, `/venues/:id`에서 해당 주체의 소개, 신뢰 정보, 제공 상품/서비스/이벤트를 계층적으로 탐색할 수 있다.
- 팀장/운영자는 팀 허브를 수정하고, 소유한 catalog item을 팀 허브에 귀속시킬 수 있다.
- 장소 운영 주체가 도입되면 venue도 동일한 구조를 재사용한다.

## Product Decision

- **글로벌 목록은 유지**한다. 팀/장소 허브가 전역 discovery를 대체하지 않는다.
- **허브는 owner-scoped catalog aggregator**로 본다. 팀/장소 자체가 콘텐츠를 “소유/운영/귀속”할 수 있어야 한다.
- **하드코딩된 depth 1 hierarchy**를 우선한다. 예: 소개 / 굿즈 / 수강권 / 이벤트. 임의 depth tree CMS는 이번 범위에서 금지한다.
- **대회는 phase 1 placeholder가 아닌 explicit extension slot**으로 다룬다. 도메인 부재 상태에서 fake section을 shipping하지 않는다.

## Evidence

- `apps/api/prisma/schema.prisma`
- `apps/api/src/teams/teams.service.ts`
- `apps/api/src/venues/venues.service.ts`
- `apps/api/src/lessons/lessons.service.ts`
- `apps/api/src/marketplace/marketplace.service.ts`
- `apps/web/src/app/(main)/teams/[id]/page.tsx`
- `apps/web/src/app/(main)/teams/[id]/matches/page.tsx`
- `apps/web/src/app/(main)/teams/[id]/mercenary/page.tsx`
- `apps/web/src/app/(main)/venues/[id]/page.tsx`
- `docs/PAGE_FEATURES.md`

## Core Requirements

### 1. Team/Venue Hub Information Architecture

- 팀 상세와 장소 상세는 hub route로 승격한다.
- hub 상단은 identity 영역(소개, 이미지, 신뢰, 연락, 운영 정보)을 유지한다.
- hub 본문은 section navigation 또는 segmented tabs로 구성한다.
- initial section set:
  - `overview`
  - `goods`
  - `passes`
  - `events`
- team은 기존 `matches`, `mercenary`, `members` 하위 flow와 충돌하지 않게 통합한다.
- venue는 기존 `schedule`, `reviews`를 hub 하위 section과 함께 재배치한다.

### 2. Ownership / Attachment Contract

- lesson, ticket plan, marketplace listing, future tournament는 “creator”와 별도로 “hub owner”를 가질 수 있어야 한다.
- 최소 contract 후보:
  - `ownerType: 'team' | 'venue' | 'user'`
  - `ownerId: string`
- user-owned standalone item도 계속 허용한다.
- owner-scoped item만 팀/장소 hub에서 노출한다.

### 3. Permissions

- team:
  - `owner`, `manager`는 hub 콘텐츠 관리 가능
  - `member`는 view only
- venue:
  - 현행 admin-only에서 시작하되, public/operator editing을 하려면 `VenueMembership` 또는 동등한 operator model이 먼저 필요
- UI affordance는 실제 저장 contract가 준비되기 전까지 노출하지 않는다.

### 4. Catalog Semantics

- `goods`: 장터형 listing의 owner-scoped subset
- `passes`: lesson + ticket plan의 owner-scoped subset
- `events`: future tournament/event surface
- team/venue hub는 raw DB model을 직접 나열하지 않고, section별 read model을 사용한다.

## Recommended Architecture

### Option A — Per-domain foreign keys

- `MarketplaceListing.teamId?`, `MarketplaceListing.venueId?`
- `Lesson.teamId?`, `Lesson.venueId?`
- future `Tournament.teamId?`, `Tournament.venueId?`

장점:
- Prisma query가 직관적이다.
- 타입/인덱스 최적화가 쉽다.

단점:
- team/venue 외 owner type이 늘어나면 필드가 계속 증가한다.
- 동일 item이 정확히 하나의 owner만 가진다는 강한 제약이 필요하다.

### Option B — Shared owner contract

- 공통 owner 필드 `ownerType`, `ownerId`
- 필요 시 owner summary read model 별도 조합

장점:
- team/venue/event organizer 등 확장성이 높다.
- 전역 목록과 owner-scoped 목록을 같은 패턴으로 조회할 수 있다.

단점:
- FK integrity를 DB 레벨에서 직접 강제하기 어렵다.
- 서비스 계층 검증과 테스트가 더 중요해진다.

### Recommendation

- **Phase 1은 Option A**로 간다.
- 이유:
  - 현재 코드베이스는 Prisma relation 중심 구조다.
  - team/venue 두 owner type만 먼저 닫는 것이 읽기 쉽고 migration 리스크가 낮다.
  - 향후 owner type이 실제로 늘어날 때 shared abstraction으로 리팩터링해도 된다.

## Delivery Plan

### Phase 0 — Contract Cleanup

- `/teams/:id/edit`의 mock/stub 상태를 real contract 기준으로 정리한다.
- venue가 admin-owned domain임을 전제 문서에 명시한다.
- future `/tournaments`가 아직 unsupported임을 명시한다.

### Phase 1 — Team Hub

- `MarketplaceListing.teamId?` 추가
- `Lesson.teamId?` 추가
- team-scoped create/edit flow에서 귀속 팀 선택 또는 고정
- `GET /teams/:id/hub` 또는 동등 read model endpoint 추가
- `/teams/:id`를 hub landing으로 재구성
- 기존 `/teams/:id/matches`, `/teams/:id/mercenary`, `/teams/:id/members`는 보조 서브플로로 유지

### Phase 2 — Venue Hub

- `MarketplaceListing.venueId?` 추가
- `Lesson.venueId` existing link를 venue hub read model에서 재사용
- venue operator model이 없다면 우선 admin-owned venue catalog만 허용
- venue operator self-service까지 가려면 membership/task 분리

### Phase 3 — Event Domain

- tournament/event domain 신규 정의
- global `/events` 또는 `/tournaments` flat list 추가
- team/venue hub `events` section 연결

## Acceptance Criteria

- 전역 flat list와 owner hub가 동시에 존재하고, 서로 역할이 겹치지 않는다.
- 팀 허브에서 goods / passes / overview를 owner-scoped 실데이터로 볼 수 있다.
- venue 허브는 현재 ownership contract에 맞는 범위만 노출한다. unsupported operator editing을 fake CTA로 노출하지 않는다.
- section별 빈 상태는 `등록된 굿즈 없음`, `수강권 없음`, `예정 이벤트 없음`처럼 honest하게 표시한다.
- owner-scoped write permission은 team membership 또는 venue operator/admin contract와 1:1로 일치한다.

## Validation

- `pnpm --filter api test`
- `pnpm --filter api build`
- `pnpm --filter web exec tsc --noEmit`
- 관련 Vitest / RTL
- team hub / venue hub targeted browser smoke
- 필요 시 scenario 문서 추가: `docs/scenarios/11-team-and-venue-hubs.md`

## Implementation Notes

- `MarketplaceListing.teamId/venueId`, `Lesson.teamId`, `Venue.ownerId`, `Tournament` 도메인을 추가했다.
- 팀/장소 허브 집계 read model은 `GET /teams/:id/hub`, `GET /venues/:id/hub`로 구현했다.
- 팀/장소 상세는 `overview / goods / passes / events` 허브 UI로 재구성했고, 팀/장소 귀속 컨텍스트를 `lessons`, `marketplace` 전역 flat list에도 함께 노출했다.
- `tournaments`는 fake placeholder가 아니라 최소 실도메인(`list/detail/create`)으로 연결했다.
- 장소 수정 CTA는 `canEditProfile` capability가 있을 때만 노출되도록 유지했다.

## Validation Notes

- `pnpm --filter api db:generate`
- `pnpm --filter api exec tsc --noEmit`
- `pnpm --filter api build`
- `pnpm --filter api test -- --runInBand src/teams/teams.service.spec.ts src/venues/venues.service.spec.ts src/lessons/lessons.service.spec.ts src/marketplace/marketplace.service.spec.ts src/tournaments/tournaments.service.spec.ts`
- `pnpm --filter web exec tsc --noEmit`
- `pnpm --filter web exec vitest run src/hooks/__tests__/use-api-teams.test.tsx src/hooks/__tests__/use-api-lessons.test.tsx`
- runtime smoke:
  - `GET /api/v1/health` 200
  - `GET /api/v1/teams/:id/hub` 200
  - `GET /api/v1/venues/:id/hub` 200
  - `/teams/:id`, `/venues/:id`, `/tournaments`, `/venues/:id/edit` route HTTP 200

## Risks

- venue ownership model 없이 team UX를 그대로 복제하면 false affordance가 생긴다.
- lesson과 listing의 owner attachment를 성급히 일반화하면 DTO/API drift가 커질 수 있다.
- hub read model 없이 기존 detail query를 이어붙이면 N+1 query와 프런트 상태 분기가 과도해질 수 있다.
- tournament domain 부재 상태에서 fake tab을 먼저 shipping하면 unsupported surface가 늘어난다.

## Out Of Scope

- arbitrary nested CMS tree
- real tournament bracket / registration engine
- venue operator settlement/backoffice
- recommendation / ranking algorithm redesign

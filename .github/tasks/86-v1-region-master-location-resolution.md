# 86. v1 Region Master and Location Resolution

## Scope

- Target: backend + frontend
- Version: v1 only
- Canonical surfaces:
  - `apps/v1_api/src/master`
  - `apps/v1_api/prisma/schema.prisma`
  - `apps/v1_api/prisma/seed.ts`
  - `apps/v1_web/src/components/auth/onboarding-client.tsx`
  - `apps/v1_web/src/components/matches`
  - `apps/v1_web/src/components/team-matches`
  - `apps/v1_web/src/components/teams`

## Requirement

- Store region master data in DB and use it as the only source of selectable regions.
- Use browser geolocation only on the onboarding region step, then resolve coordinates to a stored district-level region.
- Match, team match, and team creation must select a district-level region from master data and keep detailed place/address as manual input.
- Parent regions such as `서울`, `경기` are grouping labels, not selectable values for v1 match/team creation.

## Plan

- [x] Extend `V1Region` with optional center coordinates for fallback distance matching.
- [x] Seed Seoul districts and Gyeonggi cities/counties with stable codes and centers.
- [x] Add a server-side `resolve-location` endpoint under v1 master.
- [x] Replace frontend hardcoded centroid matching with the resolver endpoint.
- [x] Update match/team/team-match forms so district selection is explicit and grouped.
- [x] Validate that region references used by match/team/team-match are active level-2 regions.
- [x] Add my-page location settings so users can refresh current location into their primary activity region after onboarding.
- [x] Add a home weather refresh control that re-reads current browser location on demand.

## UI / UX Changes To Report

- Onboarding region step: current-location button result copy and matched district display.
- Match create/edit place step: new explicit region dropdown before venue/address.
- Team match create/edit place step: new explicit region dropdown before venue/address.
- Team create/edit form: free-text city/county is replaced by DB-backed region selection.
- My location settings: current primary activity region, current-location refresh, and manual district fallback.
- Home weather card: explicit refresh action that updates weather from the user's current browser location.

## Acceptance Criteria

- Given the user allows browser location on `/onboarding/region`, when the server resolves it, then the nearest/matching district is selected and saved in onboarding draft.
- Given the user denies browser location, when they choose a region manually, then onboarding can continue.
- Given a match/team/team-match is created, when region is submitted, then the backend rejects inactive parent regions and accepts active level-2 regions.
- Given the master region API returns parents and children, when forms render, then only children are selectable and parent names are used for context.
- Given the user opens `/my/settings/location`, when they allow current location, then the matched district can be saved as the primary activity region.
- Given browser location fails or is denied on my location settings, when the user manually selects a district, then it can be saved as the primary activity region.
- Given the user taps the weather refresh action on `/home`, when browser location succeeds, then weather is fetched for the current coordinates without persisting raw coordinates.

## Progress Snapshot

- 2026-05-26: Implemented v1 region master expansion for Seoul/Gyeonggi, DB center coordinates, server-side location resolver, onboarding resolver integration, and district-only form selection for match/team/team-match. Local v1 DB was synced with `db push`, seeded, and v1 API/Web were restarted.
- 2026-05-26: Follow-up requested for my-page location management and home weather refresh. Current implementation only resolves location during onboarding and weather auto-load; my profile/settings cannot refresh activity region yet.
- 2026-05-26: Added `PATCH /api/v1/me/regions`, `/my/settings/location`, manual/current-location primary region update, and home weather refresh. Fixed existing v1 seed `index` build error encountered during validation. Browser `/v1/*` routes were later removed; root routes are canonical.
- 2026-06-24: Added a v1 data migration that upserts nationwide parent regions and level-2 districts/cities/counties by stable `code`, so fresh and existing DBs can query all regions through `GET /api/v1/master/regions` without relying on a seed rerun. Synced the v1 web MSW region fixture to generate the same nationwide region surface for tests and mock-backed screens.

## Validation

- `pnpm --filter v1_api db:generate`
- `pnpm --filter v1_api test`
- `pnpm --filter v1_api build`
- `pnpm --filter v1_web test`
- `pnpm --filter v1_web build`
- Local smoke:
  - `GET http://localhost:8121/api/v1/health`
  - `GET http://localhost:8121/api/v1/master/regions`
  - `POST http://localhost:8121/api/v1/master/regions/resolve-location`
  - `HEAD http://localhost:3013/onboarding/region`
  - `HEAD http://localhost:3013/v1/onboarding/region` → `404` negative contract

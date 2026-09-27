# Task 07 — Refresh Mock Visual Assets

## Context

- The frontend uses local fallback catalogs in `apps/web/src/lib/sport-image.ts`.
- The user explicitly asked for photoreal imagery, not illustrative SVG or generated poster-style art, in the places where the product visually expects real-world photos.
- `OPENAI_API_KEY` is not available in the current shell or dev containers, so live OpenAI image generation is not executable in this environment today.

## Goal

- Keep all active fallback photo slots local-first and photoreal.
- Ensure every user-facing image surface that currently depends on fallback/mock imagery uses the shared helper layer or another vetted local photoreal path.
- Preserve deterministic selection so repeated renders do not drift between server and client.

## In-Scope Image Surfaces

- Match:
  - `apps/web/src/app/(main)/home/page.tsx`
  - `apps/web/src/app/(main)/matches/page.tsx`
  - `apps/web/src/app/(main)/matches/[id]/page.tsx`
  - `apps/web/src/app/(main)/matches/new/page.tsx`
  - `apps/web/src/app/(main)/matches/[id]/edit/page.tsx`
- Lesson:
  - `apps/web/src/app/(main)/lessons/page.tsx`
  - `apps/web/src/app/(main)/lessons/[id]/page.tsx`
- Marketplace:
  - `apps/web/src/app/(main)/home/page.tsx`
  - `apps/web/src/app/(main)/marketplace/page.tsx`
  - `apps/web/src/app/(main)/marketplace/[id]/page.tsx`
  - `apps/web/src/app/(main)/marketplace/new/page.tsx`
  - `apps/web/src/app/(main)/my/listings/page.tsx`
- Team:
  - `apps/web/src/app/(main)/home/page.tsx`
  - `apps/web/src/app/(main)/teams/team-list.tsx`
  - `apps/web/src/app/(main)/teams/[id]/page.tsx`
- Venue:
  - `apps/web/src/app/(main)/venues/page.tsx`
  - `apps/web/src/app/(main)/venues/[id]/page.tsx`
- Shared support:
  - `apps/web/src/lib/sport-image.ts`
  - `apps/web/src/lib/mock-visual-factory.ts`
  - `apps/web/src/lib/__tests__/sport-image.test.ts`
  - `apps/web/public/mock/photoreal/ATTRIBUTION.md`

## Out of Scope

- User/profile/chat/avatar initials where the product has no photo fallback contract.
- Live remote image fetching or remote placeholder URLs.

## Current Gap Assessment

- Shared sport/listing/team/venue catalogs already point to `/mock/photoreal/...`.
- Remaining work is concentrated in pages that still render icon blocks or generic placeholders even though a photoreal fallback is available.
- The confirmed gaps for this round are:
  - `apps/web/src/app/(main)/matches/[id]/page.tsx`
  - `apps/web/src/app/(main)/lessons/[id]/page.tsx`
  - `apps/web/src/app/(main)/my/listings/page.tsx`
  - `apps/web/src/app/(main)/venues/page.tsx`
  - `apps/web/src/app/(main)/matches/new/page.tsx`
  - `apps/web/src/app/(main)/matches/[id]/edit/page.tsx`

## User Scenarios

1. As a user opening a match detail page, I should see a real-photo hero instead of only a sport icon card.
2. As a user opening a lesson detail page, I should see a real-photo cover and gallery instead of empty image placeholders.
3. As a seller managing my listings, I should still see a realistic thumbnail even when my item has no uploaded photos.
4. As a developer working offline, I should still get polished local assets without external dependencies.

## Acceptance Criteria

- Active fallback catalogs used by cards and detail galleries do not mix illustrative SVG placeholders into photoreal image slots.
- Match detail, lesson detail, and my listings surfaces do not show ad hoc icon-only placeholders when local photoreal fallbacks are available.
- Team logo fallback remains deterministic SVG, but photo slots remain photoreal.
- Attribution metadata stays in sync with the active local photo set.
- Existing helper tests and type checks pass after the change.

## Risks

- Some detail pages currently assume null media and may need layout-safe integration of a new hero/gallery section.
- Smaller sport catalogs can still repeat if a page requests more unique images than the available local set.
- Broad image-surface cleanup can accidentally touch user-upload flows; those must remain separate from fallback logic.

## Implementation Notes

- Use shared helper functions rather than page-local random image selection.
- Prefer composing uploaded images with photoreal local fallbacks for detail galleries.
- Ignore empty media URLs before falling back so `null`/`undefined`/`''` payload noise does not create broken image tags.
- Remove or avoid weak/off-target photo candidates from active catalogs.
- `apps/web/src/app/(main)/marketplace/new/page.tsx` now shows photoreal local example thumbnails instead of empty gray boxes.
- `apps/web/src/app/(main)/my/listings/page.tsx` now renders marketplace fallback photos even for local/mock listing rows.
- `apps/web/src/app/(main)/matches/[id]/page.tsx` now uses venue-aware fallback selection for the facility preview image instead of a generic sport photo.
- `apps/web/src/app/(main)/venues/page.tsx` now uses the venue helper layer for list thumbnails instead of a raw sport fallback call.
- `apps/web/src/app/(main)/matches/new/page.tsx` and `apps/web/src/app/(main)/matches/[id]/edit/page.tsx` now show photoreal example strips when no upload preview exists.
- Team-match logo frames use the same deterministic team-logo helper as team list/detail surfaces.

## Validation

- `pnpm --filter web test src/lib/__tests__/sport-image.test.ts`
- `pnpm --filter web exec tsc --noEmit`
- `curl -I http://localhost:3003/login`
- `curl -I http://localhost:3003/marketplace`
- `curl -I http://localhost:3003/venues`
- `curl -I http://localhost:3003/matches/new`
- Visual smoke-checks for:
  - `/matches/[id]`
  - `/matches/new`
  - `/lessons/[id]`
  - `/my/listings`
  - `/marketplace/new`
  - `/venues`
  - `/team-matches/[id]/score`

### Latest Validation Result

- Helper/unit regression: `sport-image.test.ts` `21/21` passed
- Type check: `pnpm --filter web exec tsc --noEmit` passed
- Route smoke: `/venues`, `/matches/new`, `/marketplace/new` `200 OK`
- Design review: `🔴 0 / 🟡 0`
- Persona QA: 4개 페르소나 리포트에서 검증된 26개 체크가 모두 통과했고, 실패는 없었다. 남은 1건은 auth-injected visual smoke follow-up으로 분류됐다.
- Remaining non-blocking follow-up: auth-injected visual smoke for `/matches/new` and `/matches/[id]/edit`, plus a stronger wait condition for `/venues` screenshot capture after skeleton loading

## Ambiguity Log

- 2026-04-07 — The request asked for generated real images, but `OPENAI_API_KEY` is unavailable in the host shell and dev containers. Decision: implement with vetted local photoreal assets instead.
- 2026-04-07 — The requirement was clarified to photoreal images. Decision: keep only the team-logo fallback as generated SVG and move photo slots to local real-photo assets.
- 2026-04-08 — Visual review showed that some active surfaces still displayed icon/placeholder UI even after the shared catalogs were upgraded. Decision: extend the photoreal fallback strategy into those remaining detail and owner-management surfaces.
- 2026-04-08 — Upload flows were initially treated as out of scope because they reflect local user files. Decision: keep raw file previews intact, but replace empty upload-slot placeholders with photoreal example strips on user-facing creation/edit screens.

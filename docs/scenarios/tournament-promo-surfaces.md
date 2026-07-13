# Tournament promo surfaces

## Scope

- `/home`
- `/tournaments`
- Public `GET /api/v1/tournaments` cursor pagination

## Scenarios

### PROMO-HOME-001 — all enabled home promos

- Given: two or more open tournaments have `promoHomeEnabled=true` with different priorities.
- When: the user opens `/home`.
- Then: every enabled tournament is visible in descending `promoHomePriority` order; ties use the earliest `createdAt` first. Mobile uses the horizontal recommendation rail and desktop uses a two-column wrapping grid.
- Status: component/unit contract passed; browser viewport verification blocked by local Node 18 runtime.

### PROMO-LIST-001 — card-news carousel

- Given: two or more open tournaments have `promoListEnabled=true`.
- When: the user opens `/tournaments`, swipes, presses ArrowLeft/ArrowRight, selects a pagination dot, or leaves the carousel idle.
- Then: every enabled tournament is reachable in descending `promoListPriority` order, ties use the earliest `createdAt` first, one complete banner is visible at a time, the centered bottom pagination dots follow the active slide, and mobile and desktop web playback advances every 5 seconds before looping to the first card. Keyboard focus and reduced-motion preference pause autoplay; mouse hover does not pause desktop playback.
- Status: component/unit contract passed; browser viewport verification blocked by local Node 18 runtime.

### PROMO-LIST-002 — sport filter synchronization

- Given: promo tournaments exist across multiple sports.
- When: the user selects a sport filter on `/tournaments`.
- Then: the normal list and promo carousel both use that sport; the carousel returns to its first slide.
- Status: code contract covered; browser interaction pending.

### PROMO-DATA-001 — cursor completeness and failure honesty

- Given: public open tournaments span multiple cursor pages.
- When: either promo surface loads.
- Then: pages are fetched until `hasNext=false`, duplicate boundary IDs are removed, and a missing/repeated cursor produces a retryable error instead of a partial-success UI.
- Status: unit contract passed.

## Validation record

- `pnpm --filter v1_web test`: 23 files / 88 tests passed.
- `pnpm --filter v1_web exec tsc --noEmit`: passed.
- `pnpm --filter v1_web lint:patterns`: passed.
- `pnpm --filter v1_web build`: blocked before compilation because local Node is 18.19.1 and Next.js requires at least 20.9.0; repository policy requires Node 22.
- Browser screenshots/console/network: blocked because no v1 server is running and the available Node cannot start Next.js.

# Task 30: Site-wide Performance Optimization

## Context
Site performance is noticeably slow. Comprehensive audit revealed issues across frontend (88/100 pages client-only), backend (no caching, missing indexes, N+1 queries), and infrastructure (no compression, unoptimized Docker builds).

## Goal
Resolve all identified performance bottlenecks across 4 waves without breaking existing functionality.

## Original Conditions
- [x] Wave 1: next.config.ts optimizePackageImports + image formats
- [x] Wave 1: Server-side QueryClient staleTime fix (3 pages)
- [x] Wave 1: Prisma indexes (6 models, 10 new indexes)
- [x] Wave 1: turbo.json .env globalDependency removal
- [x] Wave 1: Compression middleware added to NestJS
- [x] Wave 2: Static pages → server components (landing, faq, about, pricing)
- [x] Wave 2: use-api.ts split into domain modules (16 files)
- [x] Wave 2: Dynamic imports for heavy components (MediaLightbox, ChatRoomEmbed)
- [x] Wave 2: Pretendard font → next/font/local
- [x] Wave 2: loading.tsx 'use client' removal (74 files)
- [x] Wave 3: Redis caching layer for hot paths (venues, notifications)
- [x] Wave 3: Pagination for unbounded queries (venues, payments, mercenary)
- [x] Wave 3: Scheduler N+1 resolution ($queryRaw bulk + WHERE rn <= 10)
- [x] Wave 3: ELO scoring bulk operations (findMany + $transaction)
- [x] Wave 3: Chat block-check batch (single findMany)
- [x] Wave 4: Dockerfile runtime stage named (--prod blocked by ts-node seed dep)
- [x] Wave 4: CI test parallelization (PID-tracked wait)
- [x] Wave 4: Production container memory limits (api/web 512M, pg 1G, redis 256M)
- [x] Wave 4: PostgreSQL/Redis performance tuning

## Review Results (Round 1 + Fix)
- Backend: Critical(2→0) / Warning(4→0) — RedisCacheService fault tolerance, SCAN pattern, controller cursor params, scheduler SQL filter
- Frontend: Critical(1→0) / Warning(3→0 new) — Unused import, aria-controls added, paginated response handling
- Infra: Critical(1→0) / Warning(4→0) — Localhost port binding, PID-tracked CI, PG memory tuning, Redis volume removed

## QA Results
- Power: 10/10 scenarios passed (after fix: payments + mercenary paginated response)
- UIUX: 14/14 scenarios passed (after fix: font dedup, chat i18n, aria-controls)

## Acceptance Criteria ✅
- `tsc --noEmit` passes for both apps
- Frontend: 34 suites, 289 tests pass
- Backend: 28 suites, 563 tests pass
- No new runtime errors

## Files Changed

### Backend (12 files)
- `apps/api/src/main.ts` — compression middleware
- `apps/api/prisma/schema.prisma` — 10 new indexes
- `apps/api/src/redis/redis-cache.service.ts` — NEW: fault-tolerant cache service
- `apps/api/src/redis/redis.module.ts` — RedisCacheService export
- `apps/api/src/venues/venues.{service,controller,service.spec}.ts` — caching + pagination
- `apps/api/src/notifications/notifications.{service,service.spec}.ts` — unread count cache
- `apps/api/src/payments/payments.{service,controller,service.spec}.ts` — cursor pagination
- `apps/api/src/mercenary/mercenary.{service,service.spec}.ts` — take limit + pagination
- `apps/api/src/scheduler/scheduler.{service,service.spec}.ts` — N+1 bulk fix
- `apps/api/src/scoring/scoring.{service,service.spec}.ts` — bulk ELO + transaction
- `apps/api/src/chat/chat.{service,service.spec}.ts` — batch block check

### Frontend (100+ files)
- `apps/web/next.config.ts` — optimizePackageImports, image formats
- `apps/web/src/app/layout.tsx` — next/font/local for Pretendard
- `apps/web/src/app/globals.css` — font variable chain
- `apps/web/fonts/PretendardVariable.woff2` — NEW: self-hosted font
- `apps/web/src/app/(main)/home/page.tsx` — server QueryClient staleTime
- `apps/web/src/app/(main)/matches/page.tsx` — server QueryClient staleTime
- `apps/web/src/app/(main)/teams/page.tsx` — server QueryClient staleTime
- `apps/web/src/app/landing/page.tsx` — server component
- `apps/web/src/app/about/page.tsx` — server component
- `apps/web/src/app/faq/page.tsx` — server component + faq-content.tsx extracted
- `apps/web/src/app/pricing/page.tsx` — server component + pricing-faq.tsx extracted
- `apps/web/src/components/landing/hero-scroll-button.tsx` — NEW: extracted client component
- `apps/web/src/hooks/api/` — NEW: 16 domain files split from use-api.ts
- `apps/web/src/hooks/use-api.ts` — barrel re-export
- 74 loading.tsx files — 'use client' removed
- 6 pages — dynamic imports (MediaLightbox, ChatRoomEmbed)
- `apps/web/src/app/(main)/payments/page.tsx` — paginated response handling
- `apps/web/src/app/(main)/my/mercenary/page.tsx` — paginated response handling

### Infra (4 files)
- `turbo.json` — removed .env globalDep, task-level env, lint unblocked
- `deploy/Dockerfile.api` — named runtime stage
- `deploy/docker-compose.prod.yml` — memory limits, PG/Redis tuning, localhost ports
- `.github/workflows/deploy.yml` — parallel CI, PID-tracked wait, prune -f

## Security Notes
- Redis cache: fault-tolerant (try/catch), no sensitive data cached, SCAN instead of KEYS
- Docker: API/Web ports bound to 127.0.0.1, nginx is sole external ingress
- PG: shared_buffers=128MB safe for 1G container limit

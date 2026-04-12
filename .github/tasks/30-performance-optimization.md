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
- [ ] Wave 2: Static pages → server components (landing, faq, about, pricing)
- [ ] Wave 2: use-api.ts split into domain modules
- [ ] Wave 2: Dynamic imports for heavy components
- [ ] Wave 2: Pretendard font → next/font/local
- [ ] Wave 2: loading.tsx 'use client' removal
- [ ] Wave 3: Redis caching layer for hot paths
- [ ] Wave 3: Pagination for unbounded queries
- [ ] Wave 3: Scheduler N+1 resolution
- [ ] Wave 3: ELO scoring bulk operations
- [ ] Wave 3: Chat block-check batch
- [ ] Wave 4: Dockerfile --prod install
- [ ] Wave 4: CI test parallelization
- [ ] Wave 4: Production container memory limits
- [ ] Wave 4: PostgreSQL/Redis performance tuning

## Parallel Work Breakdown

### Wave 1 (Sequential — config changes) ✅
Owner: orchestrator
Files: next.config.ts, turbo.json, schema.prisma, main.ts, home/page.tsx, matches/page.tsx, teams/page.tsx

### Wave 2 (Frontend — parallel)
- frontend-ui-dev: pages, components, layout.tsx, loading.tsx
- frontend-data-dev: use-api.ts split, hooks reorganization

### Wave 3 (Backend — single agent)
- backend-data-dev: services, Redis integration, Prisma queries

### Wave 4 (Infra — single agent)
- infra-devops-dev: Dockerfiles, CI, docker-compose

## Acceptance Criteria
- `tsc --noEmit` passes for both apps
- All existing tests pass
- No new runtime errors
- Bundle size reduction measurable via ANALYZE=true build

## Security Notes
- Redis caching must not expose sensitive data (no caching of auth tokens)
- Compression must not interfere with WebSocket connections
- Production memory limits must prevent OOM but allow normal operation

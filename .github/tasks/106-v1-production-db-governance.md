# Task 106 - v1 Production DB Governance And Cleanup

## Context

The deployed v1 database needs cleanup because seed/demo/coverage data has grown together with schema expansion. The current v1 schema is sizable, and `apps/v1_api/prisma/seed.ts` mixes base data, persona data, admin data, demo flows, chat/notification samples, and coverage permutations in one entrypoint.

This task fixes the governance gap before any destructive production cleanup.

## Scope

IN:

- `apps/v1_api/prisma/schema.prisma`
- `apps/v1_api/prisma/migrations/`
- `apps/v1_api/prisma/seed.ts`
- v1 API services that query affected tables
- `docs/ops/v1-database-operations.md`
- README command/documentation cleanup where it references v1 DB operations
- Optional ops/QA scripts under `scripts/qa/` or `scripts/ops/`

OUT:

- Legacy `apps/api` schema/seed/migration cleanup
- Direct production deletion without backup, dry-run counts, and explicit approval
- `prisma migrate reset`, `db push`, or full seed against production

## Current Evidence

- Prisma provider: PostgreSQL.
- Runtime package: `apps/v1_api`.
- Current schema: 47 models, 41 enums.
- Current migration directories: 22.
- Current seed entrypoint: `pnpm --filter v1_api db:seed`.
- Seed file contains base/reference seed plus demo and coverage flows.
- Root scripts contain both legacy DB commands and v1 DB commands, so operator docs must distinguish them clearly.

## Acceptance Criteria

- [x] Create a v1 DB operations runbook that defines current state, seed categories, migration policy, cleanup gates, and release checklist.
- [x] Add a read-only v1 DB audit script that reports row counts and seed/demo/coverage cleanup candidates without deleting data.
- [x] Split v1 seed into base/demo/coverage entrypoints or equivalent explicit modes.
- [x] Add production guardrails preventing demo/coverage seed execution in production.
- [x] Update README v1 DB sections so operators do not use legacy `api` DB commands for v1.
- [x] Define cleanup SQL/script with dry-run-first execution gates.
- [x] 로컬 push/deploy가 운영 v1 DB에 영향을 줄 수 있는지와 schema 변경 처리 기준을 문서화한다.
- [x] 운영 v1 배포 경로에서 `prisma db push --skip-generate`를 제거하고 seed sync 기본값을 disabled로 변경한다.
- [x] CI에서 v1 운영 배포 `db push` 재도입과 schema 변경 without migration을 막는 guardrail을 추가한다.
- [ ] Run affected backend tests and DB generation after seed/script changes.

## Proposed Phases

### Phase 1 - Governance

- Document the current DB shape and operational rules.
- Define destructive operation gates.
- Record what is known vs unknown about production data.

### Phase 2 - Read-Only Audit

- Build a read-only script for:
  - v1 table row counts.
  - `@teameet.v1` persona users.
  - `coverage-*` records.
  - `seed-coverage` labels.
  - fixed seed UUID ranges.
  - dependent child row counts.
- Script must print SQL/predicates and must not delete rows.

### Phase 3 - Seed Split

- Extract base reference seed from demo/coverage seed.
- Add explicit commands for demo/coverage.
- Prevent accidental production execution.

### Phase 4 - Cleanup Plan

- Use audit output to produce a dry-run cleanup report.
- Final cleanup script must be reviewed with expected row counts.
- Production execution requires backup confirmation and approval.

### Phase 5 - Schema Pruning

- Identify truly unused columns/tables from service query evidence.
- Remove only through forward Prisma migrations.
- Sync DTO/API docs/frontend contracts when model shape affects responses.

## Open Questions

- What production data must be preserved beyond ordinary user-owned data?
- Are `@teameet.v1` accounts present in production only as test/demo data, or are any used for operator access?
- What retention period applies to admin action logs, status change logs, chat messages, notifications, and tournament registrations?
- Is staging allowed to keep full demo/coverage seed, or should it mirror production seed policy?

## Progress Snapshot

2026-07-06:

- Created `docs/ops/v1-database-operations.md`.
- No production DB connection was used.
- No destructive command was run.
- Next safest step is a read-only audit script and README v1 DB command cleanup.
- Updated `apps/v1_api/prisma/seed.ts` so `db:seed` defaults to base reference data only; demo/coverage data now requires explicit `--mode=demo` or `--mode=all`.
- Added production guardrails for demo/coverage seed modes under `NODE_ENV=production`.
- Added `apps/v1_api/prisma/cleanup-demo-data.ts`; default mode prints candidate row counts only, while actual deletion requires `--execute --confirm=delete-v1-demo-data`.
- Added v1 package/root/Makefile command surfaces for base seed, demo seed, all seed, and cleanup dry-run.
- `docs/ops/v1-database-operations.md`에 push/deploy DB 영향 매뉴얼을 추가했다. `main` push는 배포를 트리거하지만, v1 운영 schema 변경은 migration-only 배포를 기준으로 한다.
- `.github/workflows/deploy.yml`, `deploy/restart-containers.sh`, `deploy/setup-ec2.sh`에서 v1 운영 경로의 `prisma db push --skip-generate`를 제거하고 `prisma migrate deploy`만 남겼다.
- `deploy/restart-containers.sh`, `deploy/setup-ec2.sh`, `deploy/DEPLOY_GUIDE.md`에서 `DEPLOY_SYNC_V1_SEED_DATA` 기본값을 disabled로 맞췄다. 운영자가 검토 후 `true`로 명시한 경우에만 base seed sync가 실행된다.
- `scripts/qa/check-v1-db-guardrails.mjs`와 `pnpm qa:v1-db-guardrails`를 추가하고 GitHub Actions test job에 연결했다. CI는 v1 운영 deploy script의 forbidden DB 패턴과 `schema.prisma` 변경 without migration을 차단한다.
- No production DB connection was used and no destructive command was run.

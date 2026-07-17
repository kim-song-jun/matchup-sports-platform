# V1 Database Operations

Last updated: 2026-07-06

This document is the operating standard for Teameet v1 database work. It covers the current state, ownership rules, seed policy, cleanup policy, migration policy, and the minimum evidence required before touching a deployed database.

## Scope

Valid sources:

- Prisma schema: `apps/v1_api/prisma/schema.prisma`
- Prisma migrations: `apps/v1_api/prisma/migrations/`
- V1 seed: `apps/v1_api/prisma/seed.ts`
- V1 API queries: `apps/v1_api/src/**`
- V1 frontend contracts when API response shape changes: `apps/v1_web/**`

Do not use legacy `apps/api`, legacy migrations, legacy seed scripts, or old design/API documents to decide v1 DB behavior.

## Current State

As of 2026-07-06:

- Provider: PostgreSQL via Prisma.
- Runtime package: `apps/v1_api`.
- Prisma schema size: 47 models, 41 enums.
- Migration count: 22 directories under `apps/v1_api/prisma/migrations`.
- Base seed entrypoint: `pnpm --filter v1_api db:seed`.
- Demo seed entrypoints: `pnpm --filter v1_api db:seed:demo` and `pnpm --filter v1_api db:seed:all`.
- Demo cleanup dry-run: `pnpm --filter v1_api db:cleanup:demo`.
- Production v1 deploy schema command: `prisma migrate deploy` only.
- Production v1 seed sync default: disabled unless `DEPLOY_SYNC_V1_SEED_DATA=true`.
- CI guardrail command: `pnpm qa:v1-db-guardrails`.
- Root v1 commands:
  - `pnpm v1:db:generate`
  - `pnpm v1:db:push`
  - `pnpm v1:db:migrate`
  - `pnpm v1:db:studio`
  - `pnpm v1:db:seed`
  - `pnpm v1:db:seed:demo`
  - `pnpm v1:db:seed:all`
  - `pnpm v1:db:cleanup:demo`
- Makefile v1 commands:
  - `make v1-db-migrate`
  - `make v1-db-push`
  - `make v1-db-seed`
  - `make v1-db-seed-demo`
  - `make v1-db-cleanup-demo`
  - `make v1-db-studio`
  - `make v1-db-shell`

Important drift:

- `README.md` still contains some legacy/root `api` DB command descriptions. For v1 work, prefer the commands above and the `AGENTS.md` v1 scope override.
- `seed.ts` now defaults to base reference data only. Persona users, admin users, demo flows, chat/notification samples, and coverage data require explicit `--mode=demo` or `--mode=all`.
- v1 production deploy no longer runs `prisma db push`; migration files are required for production schema changes.
- The seed file is idempotent by `upsert` in many places, but it is not a production cleanup tool and must not be used to "reset" deployed data.

## Data Categories

Classify every table and row before cleanup.

| Category | Examples | Production default |
| --- | --- | --- |
| Reference data | sports, sport levels, regions, published terms | Keep and migrate intentionally |
| User-owned data | users, profiles, teams, matches, applications, chats, notifications, tournament registrations | Keep unless user/account policy says otherwise |
| Admin/audit data | admin users, admin action logs, status change logs | Keep; retention requires explicit policy |
| Demo/coverage data | `@teameet.v1` persona emails, `coverage-*` users, `seed-coverage` labels, fixed seed UUID ranges | Cleanup candidate after dry-run evidence |
| Test-only data | e2e prefixes, local-only generated records | Cleanup candidate outside production user data |
| Derived summaries | reputation summaries, trust scores, counters | Rebuild/backfill candidate, not manual source of truth |

## Seed Policy

The seed layer should be split into three responsibilities.

1. Base seed
   - Purpose: minimum reference data required for a fresh dev/staging environment.
   - Allowed: sports, levels, regions, terms, one known admin bootstrap path if required.
   - Not allowed: large demo chats, coverage permutations, fake operational history.

2. Demo seed
   - Purpose: local product demos and manual QA.
   - Allowed: persona users, representative teams, matches, team matches, tournament examples.
   - Must be idempotent and visibly marked as demo data.
   - Must not run automatically in production deploy.

3. Coverage seed
   - Purpose: automated tests and UI state coverage.
   - Allowed: status permutations, archived/hidden/deleted examples, edge case data.
   - Must be isolated from production and should be removable by deterministic markers.

Current commands:

- `pnpm v1:db:seed`: base seed only. It inserts runtime check, sports, sport levels, regions, and published terms.
- `pnpm v1:db:seed:demo`: demo personas and representative user-owned flows.
- `pnpm v1:db:seed:all`: demo plus coverage permutations.
- `V1_ALLOW_LOCAL_EVENT_SEED=true pnpm v1:db:seed:event-campaigns`: local-only event hub campaigns for up to six existing tournaments plus the fixed `event.qa@teameet.local` QA persona/team. It only manages `dev-event-*` slugs and deterministic local QA IDs, preserves other campaigns and production users, rejects production mode, and rejects non-loopback database hosts.

Demo and coverage modes are blocked when `NODE_ENV=production` unless `V1_ALLOW_DEMO_SEED=true` is explicitly set for a reviewed non-production/demo import. Do not set that flag for ordinary production operation.

`demo`/`coverage`/`all` seed modes also require `V1_HOST_ADMIN_PASSWORD` (8+ chars) set in `apps/v1_api/.env` — it becomes the `host@teameet.v1` account password. Missing or too-short values fail the seed run immediately (fail-closed).

## Production Snapshot To Existing Local Dev DB

Production-to-local refresh is an operator workflow, not an application deploy step.

1. Run a host load, memory, swap, Node/browser process, Docker, and target-service preflight.
2. Keep production read-only. Stream `pg_dump --format=custom --no-owner --no-acl` from `teameet_v1_postgres`; do not create a persistent dump file on the production host.
3. Store temporary local dumps outside the repository with directory mode `0700` and file mode `0600`.
4. Back up the current local dev DB before replacement.
5. Stop only the local v1 API process that owns connections to the target DB. The Web server may stay up.
6. Drop and recreate the existing local dev database, then restore with `pg_restore --no-owner --no-acl --exit-on-error`.
7. Run canonical `prisma migrate deploy` against the restored local database. Never run a migration or seed against production during this workflow.
8. Add local QA/demo records only through production-guarded, idempotent seed commands.
9. Verify migration status, schema drift, API health, affected row counts, and browser scenarios.
10. Remove temporary dump files after restore and rollback verification. Do not commit dumps, copied uploads, or production-derived PII.

Screenshots and planning reports created from a production clone must stay on public product surfaces or use clearly marked local QA personas. Do not capture or publish private user data from the clone.

## Migration Policy

Use migrations for schema evolution. Do not manually patch production schema.

Allowed in production:

- `prisma migrate deploy` through the deploy pipeline.
- Forward-only additive migrations.
- Backfills that are idempotent, bounded, and reviewed with row count estimates.

Requires extra review:

- Dropping columns or tables.
- Rewriting enum values.
- Changing nullable to non-nullable.
- Adding unique constraints to existing populated tables.
- Cascade delete changes.
- Any migration that mutates user-owned data.

Not allowed in production:

- `prisma db push`.
- `prisma migrate dev`.
- `prisma migrate reset`.
- Running full seed as a cleanup mechanism.
- Manual `TRUNCATE` without backup, dry-run counts, and explicit approval.

Every schema change must report:

1. Related tables.
2. Related Prisma models.
3. API/service/query impact.
4. Frontend/MSW/fixture impact if response shape changes.
5. Whether a migration is required.
6. Rollback or forward-fix plan.

## Cleanup Policy

Cleanup must be evidence-first and staged.

1. Snapshot
   - Confirm a fresh DB backup/snapshot exists.
   - Record timestamp, environment, and operator.

2. Read-only audit
   - Count rows per v1 table.
   - Count candidate seed/demo/coverage rows by deterministic markers.
   - Count dependent rows before deleting parent rows.
   - Store the SQL and output in a task document or ops report.

3. Dry-run delete plan
   - List every table to be touched.
   - List predicates.
   - Report expected row counts.
   - Define post-delete validation queries.
   - Current dry-run command: `pnpm v1:db:cleanup:demo`.

4. Approval gate
   - Human approval is required for production deletion.
   - Approval must include the environment, timestamp, and exact script path or SQL hash.
   - Current execution command shape: `pnpm --filter v1_api db:cleanup:demo -- --execute --confirm=delete-v1-demo-data`.

5. Transactional execution
   - Prefer a checked script over manual shell edits.
   - Use transactions where practical.
   - Delete child records before parent records unless cascade behavior is intentionally relied on and documented.

6. Verification
   - Re-run row counts.
   - Run smoke checks against affected API routes.
   - Confirm admin/audit surfaces still load.
   - Record cleanup evidence and residual risk.

## Initial Audit Queries

Use these as templates only. Run against the intended environment with read-only credentials where possible.

```sql
-- Count v1 tables.
select schemaname, relname as table_name, n_live_tup as estimated_rows
from pg_stat_user_tables
where relname like 'v1_%'
order by relname;
```

```sql
-- Seed-like user candidates.
select email, id, account_status, onboarding_status, created_at
from v1_users
where email like '%@teameet.v1'
order by email;
```

```sql
-- Coverage markers in trust/reputation data.
select source_label, count(*)
from v1_user_reputation_summaries
group by source_label
order by source_label;
```

```sql
-- Coverage/admin action markers.
select action, target_id, count(*)
from v1_admin_action_logs
where action like 'seed.%' or target_id like 'seed-%'
group by action, target_id
order by action, target_id;
```

Do not convert these templates into delete statements without dependency counts and explicit approval.

## Push / Deploy DB 영향 매뉴얼

이 섹션은 코드 push와 배포가 v1 운영 DB에 어떤 영향을 주는지 정의한다.

### 현재 배포 동작

로컬에서 `git push`를 실행하는 것만으로 운영 DB에 직접 접속하지는 않는다. 하지만 `main` 브랜치에 push되면 GitHub Actions 배포 workflow가 실행된다. 이 workflow는 저장소를 EC2 호스트로 동기화하고, 새 컨테이너를 빌드하고, `v1_postgres`를 시작한 뒤 `deploy/.env`의 `V1_DB_*` 설정으로 운영 v1 DB에 Prisma 명령을 실행한다.

현재 v1 운영 배포에서 DB 구조에 영향을 주는 명령:

```bash
prisma migrate deploy
```

`apps/v1_api/prisma/migrations/`에 새 migration이 있으면 `main` push 이후 배포 과정에서 운영 v1 DB 구조가 바뀐다. 운영 배포는 `schema.prisma`를 DB에 직접 밀어 넣지 않고, 검토된 migration history만 적용해야 한다.

현재 v1 배포 seed 동작:

```bash
ts-node prisma/seed.ts
```

현재 기본 seed mode는 `base`다. 따라서 runtime check, sports, sport levels, regions, published terms 같은 기준 데이터만 동기화한다. `--mode=demo`, `--mode=coverage`, `--mode=all`을 명시하지 않는 한 demo/coverage row는 넣지 않는다. 그래도 base seed는 DB write를 수행하므로 운영 배포에서는 기본적으로 실행하지 않는다. 운영자가 검토된 release에서 base reference upsert가 필요하다고 판단한 경우에만 `deploy/.env`에 아래 값을 설정한다.

```bash
DEPLOY_SYNC_V1_SEED_DATA=true
```

### 운영 정책 목표

운영 또는 운영에 준하는 v1 데이터는 migration만으로 schema를 변경해야 한다.

목표 운영 동작:

```bash
prisma migrate deploy
```

운영 DB 또는 운영에 준하는 persistent DB에는 `prisma db push`를 사용하지 않는다. `db push`는 로컬 개발, 버려도 되는 preview DB, 의도적으로 비어 있는 bootstrap 환경에서는 사용할 수 있지만, 검토된 migration history를 우회하고 `schema.prisma` 기준 drift를 DB에 직접 반영할 수 있다.

배포 스크립트 유지 기준:

- 일반 운영 schema 명령은 `prisma migrate deploy`만 남긴다.
- 검토된 release에서 base reference upsert가 필요한 경우가 아니면 운영에서는 v1 seed sync를 끈다. 현재 기본값은 disabled다.
- 빈 v1 DB를 bootstrap해야 한다면 별도의 명시적인 bootstrap 경로를 만들고, 일반 배포 경로에서 재사용하지 않는다.

### 로컬 / 운영 분리 기준

아래 경계를 사용한다.

| 환경 | 허용 DB 명령 | 비고 |
| --- | --- | --- |
| 로컬 개발 | `pnpm v1:db:push`, `pnpm v1:db:migrate`, `pnpm v1:db:seed`, `pnpm v1:db:seed:demo`, `pnpm v1:db:seed:all` | 개발자가 로컬 데이터를 reset하거나 demo seed를 넣을 수 있다. |
| CI 테스트 DB | `prisma generate`, 테스트 전용 schema setup | 반드시 버려도 되는 DB credential을 사용한다. |
| Staging / preview | `prisma migrate deploy` 우선. demo seed는 명시 검토 후에만 허용 | demo seed는 운영 데이터와 명확히 분리되어야 한다. |
| Production | `prisma migrate deploy` only | `db push`, demo/coverage seed, reset 금지. |

운영 v1 DB는 `v1_postgres`와 `V1_DB_*`로 legacy 운영 DB와 분리된다. legacy `DB_*`와 v1 `V1_DB_*`가 같은 DB를 가리킨다고 가정하지 않는다.

### Schema 변경 위험도 가이드

`main`에 merge하기 전에 모든 Prisma schema 변경을 아래 기준으로 분류한다.

| 변경 유형 | 위험도 | 운영 규칙 |
| --- | --- | --- |
| nullable column 추가 | 낮음 | migration으로 안전하게 적용 가능. 필요하면 별도 backfill. |
| 기존 의존성이 없는 table 추가 | 낮음 | migration으로 안전하게 적용 가능. |
| optional relation 추가 | 낮음~중간 | service query와 DTO 응답 shape를 확인한다. |
| default가 있는 required column 추가 | 중간 | 기존 모든 row에 default가 올바른지 확인한다. |
| default 없는 required column 추가 | 높음 | 먼저 backfill하거나 two-step migration을 사용한다. |
| unique constraint 추가 | 높음 | migration 전에 중복 데이터를 audit한다. |
| foreign key 추가 | 높음 | migration 전에 orphan row를 audit한다. |
| column/table rename | 높음 | 명시적인 migration SQL을 사용하고 `db push`에 의존하지 않는다. |
| column/table drop | 치명적 | backup, usage audit, 명시 승인 필요. |
| enum value 변경 | 높음 | 기존 값을 audit하고 app code를 같은 release에서 수정한다. |
| cascade 동작 변경 | 치명적 | 의존성 분석과 삭제 영향 리포트 필요. |

### V1 Schema 변경 필수 절차

1. `apps/v1_api/prisma/schema.prisma`를 수정한다.
2. 로컬에서 migration을 생성한다.

   ```bash
   pnpm --filter v1_api prisma migrate dev --name <short_change_name>
   ```

3. `apps/v1_api/prisma/migrations/` 아래에 생성된 SQL을 검토한다.
4. migration이 기존 데이터를 건드리면 audit query 또는 범위가 제한된 backfill 계획을 추가한다.
5. Prisma Client를 재생성한다.

   ```bash
   pnpm v1:db:generate
   ```

6. 영향받는 backend test를 실행한다.

   ```bash
   pnpm --filter v1_api test
   ```

7. API 응답 shape가 바뀌면 frontend hooks/types/MSW fixtures/docs를 같은 변경에서 동기화한다.
8. 운영 배포는 `prisma migrate deploy`만 사용한다.
9. 배포 후 health를 확인한다.

   ```bash
   curl -fsS http://localhost:8121/api/v1/health
   ```

10. 고위험 migration은 배포 전후 read-only row count를 실행하고 task 문서에 증거를 기록한다.

### 위험 변경 Two-Step 패턴

기존 운영 row가 새 constraint를 위반할 수 있으면 두 번의 release로 나눈다.

Release A:

- 새 column은 nullable로 추가하거나, 최종 constraint를 강제하지 않는 상태로 새 table/relation을 추가한다.
- 배포한다.
- idempotent script 또는 migration으로 기존 row를 backfill한다.
- row count, null, duplicate, orphan check를 검증한다.

Release B:

- audit가 깨끗한 것을 확인한 뒤 `NOT NULL`, unique, FK constraint를 추가한다.
- `prisma migrate deploy`로 배포한다.
- 영향받는 API route를 검증한다.

### Merge 전 체크리스트

v1 DB 변경을 `main`에 merge하기 전에 확인한다.

- [ ] `schema.prisma` 구조 변경마다 migration file이 있다.
- [ ] 생성된 SQL에서 drop/rename/cascade/constraint 동작을 검토했다.
- [ ] 운영 배포에 `prisma db push`가 포함되어 있지 않다.
- [ ] 기존 운영 데이터 위험도를 분류했다.
- [ ] 고위험 변경에는 backfill 또는 cleanup query가 있다.
- [ ] `pnpm v1:db:generate`가 통과한다.
- [ ] 영향받는 v1 API test가 통과한다.
- [ ] 응답 shape 변경 시 frontend/API contract가 동기화되어 있다.
- [ ] deploy seed 동작이 의도된 상태다. 운영은 일반적으로 `DEPLOY_SYNC_V1_SEED_DATA`를 설정하지 않거나 `false`로 둔다.
- [ ] `pnpm qa:v1-db-guardrails`가 통과한다.

### 자동 가드레일

GitHub Actions test job은 `pnpm qa:v1-db-guardrails`를 실행한다. 이 검사는 두 가지를 막는다.

- v1 운영 배포 스크립트에 `prisma db push --skip-generate` 또는 seed sync 기본 on 패턴이 다시 들어오는 경우.
- `apps/v1_api/prisma/schema.prisma`가 바뀌었는데 `apps/v1_api/prisma/migrations/` 변경이 없는 경우.

이 검사는 운영 DB에 접속하지 않는다. 배포 전 정적 검사로만 동작하며, schema 변경이 실제 운영 DB에 적용되는 시점은 배포 중 `prisma migrate deploy`가 실행될 때다.

## Release Checklist

Before a release that changes DB shape or seed behavior:

- `apps/v1_api/prisma/schema.prisma` reviewed.
- New migration reviewed, including destructive statements.
- `pnpm --filter v1_api db:generate` passes.
- `pnpm --filter v1_api test` passes for affected service code.
- `pnpm --filter v1_api test:integration` passes if DB contract or auth/permission behavior changes.
- API docs under `docs/api/domains/**` updated when controller/DTO/service contract changes.
- Seed/mock fixtures updated only for affected scope.
- Production deploy uses migration, not `db push`.
- Post-deploy read-only row count or smoke check recorded.

## Near-Term Remediation Plan

1. Run `pnpm v1:db:cleanup:demo` against the target DB and review candidate row counts.
2. Take a DB backup/snapshot and record the timestamp.
3. Execute cleanup only with `pnpm --filter v1_api db:cleanup:demo -- --execute --confirm=delete-v1-demo-data`.
4. Re-run `pnpm v1:db:cleanup:demo` and affected API smoke checks.
5. Review unused tables/columns from schema usage evidence, then remove only through forward migrations.

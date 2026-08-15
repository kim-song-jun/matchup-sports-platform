# Task 144 — Production game-operations worker parity

## Scope

- Target: infra + docs
- Runtime: production only (`teameet.co.kr`)
- Canonical implementation remains `apps/v1_api/src/jobs/v1-game-operations-worker.main.ts`.

## Problem

Alpha runs `v1_game_operations_worker`, but production does not define or
health-check that service. Tournament commands persist events and official
result revisions synchronously, while `GAME_RESULT_OFFICIAL` projections
(public cache, bracket advancement, standings, and record facts) remain in the
outbox without a production consumer.

## Owned files

- `deploy/docker-compose.prod.yml`
- `deploy/prod-release-common.sh`
- `deploy/deploy-prod.sh`
- `deploy/rollback-prod.sh`
- `deploy/cutover-to-rds.sh`
- `deploy/cutover-guard.sh`
- `.github/workflows/deploy.yml`
- `deploy/DEPLOY_GUIDE.md`
- `scripts/qa/test-prod-release-state.sh`
- `.changeset/quiet-workers-run.md`

## Forbidden files

- `.env*`
- `apps/api/**`, `apps/web/**`
- unrelated dirty v1 application files
- production data and operation-flag values

## Acceptance criteria

- [x] Production starts the worker from the immutable API image.
- [x] Worker and API use the same production database connection contract.
- [x] Deploy and rollback restore API, Web, and worker as one release unit.
- [x] Release digest verification checks the worker image digest.
- [x] Production health fails closed when the worker is absent or unhealthy.
- [x] The external deploy job also verifies worker health on the target host.
- [x] `PUBLIC_LIVE` remains an explicit audited operator transition, not a deploy default.

## Ambiguity log

- The public API proves production writes and official revisions are durable;
  this task does not rewrite tournament command logic or repair user data.
- Existing pending outbox rows should be consumed after the worker starts. No
  destructive replay/reset is authorized by this task.

## Progress snapshot

- 2026-08-15: confirmed alpha worker is healthy and production compose omits it.
- 2026-08-15: confirmed production API and Socket.IO are healthy; completed
  tournament official revisions and goal events exist.
- 2026-08-15: production compose, immutable deploy/rollback, RDS cutover,
  workflow health, operator guide, and release digest regression test now
  include the worker. The container health contract requires the worker's
  internal status to be `healthy`, so poisoned outbox state fails closed.
- Validation: production deploy security check and its 18 contract tests pass;
  `bash -n` passes. An isolated PostgreSQL 16 database accepted all 112 v1
  migrations, and the game-operations worker integration suite passes 11/11,
  covering leases, exactly-once durable effects, rollback/retry, expired lease
  recovery, poison handling, shutdown release, and worker health. The full
  release-state shell harness remains locally blocked because Windows Bash has
  no `jq`; production-host deployment and health verification remain CI/deploy
  gates rather than local tests.

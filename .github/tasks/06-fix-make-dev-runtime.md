## Summary

- Reproduce and fix the current `make dev` failure in the Docker development stack
- Restore a working API container startup and remove misleading Postgres readiness noise

## Scope

- Target: `infra`
- Entry point: `make dev`
- Out of scope: application feature changes, production runtime changes

## Findings

1. `make dev` builds successfully, but the API container crashes during Nest boot.
2. The direct failure is a native module load error from `bcrypt` inside the dev container.
3. The Postgres healthcheck and Makefile readiness checks omit the database name, so `pg_isready` defaults to the user name and emits repeated `database "matchup_user" does not exist` logs.

## Root Cause

- `deploy/Dockerfile.dev` used an Alpine/musl Node base while the workspace includes native addons such as `bcrypt`.
- The dev node_modules cache could retain binaries that are incompatible with the current container runtime.
- On the current arm64 + mounted-workspace dev path, native `bcrypt` can still surface an `invalid ELF header` even after the image/runtime correction, while production does not need that fallback.
- Readiness checks were validating the server without targeting the configured `matchup_dev` database.

## Planned Fix

- Move the dev Docker image to a glibc-based Node image, install OpenSSL for Prisma, and preserve a clean dependency snapshot inside the image.
- Rotate the dev node_modules volume keys, mount them with `nocopy`, and resync dependencies from the image through a dedicated compose service on each startup.
- Pin all dev Postgres readiness checks to `matchup_dev`.
- Keep Postgres and Redis on the internal Docker network only, and make the web container wait for an API healthcheck instead of bare process startup.
- Preserve the production password hashing runtime on `bcrypt`, but let dev compose opt into `bcryptjs` explicitly through `AUTH_HASH_DRIVER` so `make dev` does not depend on a native addon load succeeding in the mounted workspace runtime.

## Validation

- Re-run `make dev` and confirm:
  - `api` stays up after Nest watch compilation
  - `web` stays up on port `3003`
  - Postgres no longer emits repeated `database "matchup_user" does not exist` messages

## Pipeline Status

- Current stage: `Completed`
- Branch: `main`
- Progress rule: keep task doc updated after each pipeline stage

## Working Change Set

- Infra: `docker-compose.yml`, `deploy/Dockerfile.dev`, `Makefile`
- Backend: `apps/api/package.json`, `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.service.spec.ts`, `pnpm-lock.yaml`
- Docs: `AGENTS.md`, `.claude/agents/workflow.md`, `.github/tasks/06-fix-make-dev-runtime.md`

## Stage Log

### Plan

- Status: complete
- Notes:
  - Verdict: `Approved`
  - Keep scope limited to dev runtime recovery, dependency bootstrap stability, and related documentation.
  - Preserve current implementation direction: glibc-based dev image, deterministic node_modules bootstrap, and removal of the native `bcrypt` dependency from the changed auth path.
  - Before review/QA, require domain checks for compose config, backend auth tests, and live `make dev` smoke verification.

### Build

- Status: completed
- Backend:
  - Replaced auth hashing dependency usage from `bcrypt` to `bcryptjs`.
  - Removed unnecessary external type shim after confirming package-provided types.
  - Backend builder confirmed auth service tests, build, and runtime import behavior for `bcryptjs`.
- Infra:
  - Switched dev Docker runtime to `node:20-bookworm-slim` with OpenSSL installed.
  - Added `/opt/deps` snapshot bootstrap for dev `node_modules` volumes and a dedicated `deps` compose service.
  - Fixed Postgres readiness checks in compose and Make targets to target `matchup_dev`.
  - Added explicit `web -> deps` startup dependency to reduce first-boot `next: not found` risk.
- Frontend:
  - No source changes required.
  - Builder validated `3003 -> /landing` redirect and `/api/v1/health` access through the web dev path.
- Docs:
  - Recorded the runtime gotcha in `AGENTS.md` and `.claude/agents/workflow.md`.
  - Kept this task document updated during implementation.
- Validation:
  - `docker compose -f docker-compose.yml exec -T api sh -lc 'cd apps/api && pnpm --filter api test -- --runTestsByPath src/auth/auth.service.spec.ts'`
  - `docker compose -f docker-compose.yml exec -T api sh -lc 'cd apps/api && pnpm --filter api build'`
  - `pnpm --filter api test -- --runInBand apps/api/src/auth/auth.service.spec.ts`
  - `pnpm --filter api build`
  - `pnpm --filter api exec node -e "require('bcryptjs'); console.log('ok')"`
  - `curl -I http://localhost:8111/docs`
  - `curl -I http://localhost:3003`

### Review

- Status: completed
- Notes:
  - Frontend review requested a real API readiness gate before `web` starts serving proxied traffic.
  - Infra review flagged drift between the documented internal-only database/cache network and the temporary host port publish in dev compose.
  - Backend review flagged that replacing `bcrypt` with `bcryptjs` widened the change into application runtime behavior. The fix loop narrowed this to a dev-only override: production keeps `bcrypt`, while dev compose sets `AUTH_HASH_DRIVER=bcryptjs` after reproducing `invalid ELF header` in the arm64 workspace runtime.
  - Reproduced failure evidence during the fix loop:
    - `invalid ELF header` from native `bcrypt` inside the arm64 dev container
    - `web` remained blocked until `api` turned healthy after the added healthcheck gate
  - Validation after the fix loop:
    - `docker compose -f docker-compose.yml ps` shows `api` healthy before `web` starts
    - `curl http://localhost:8111/api/v1/health`
    - `curl -I http://localhost:8111/docs`
    - `curl -I http://localhost:3003`
    - `curl http://localhost:8111/api/v1`
    - `docker compose -f docker-compose.yml exec -T api sh -lc 'cd /app/apps/api && node -e "console.log(process.env.AUTH_HASH_DRIVER); console.log(require.resolve(\"bcryptjs\"))"'`
    - `docker compose -f docker-compose.yml exec -T api sh -lc 'cd /app/apps/api && pnpm test -- --runTestsByPath src/auth/auth.service.spec.ts'`
    - `docker compose -f docker-compose.yml exec -T api sh -lc 'cd /app/apps/api && pnpm build'`
    - `lsof -nP -iTCP:5433 -sTCP:LISTEN || true`
    - `lsof -nP -iTCP:6380 -sTCP:LISTEN || true`
  - Re-review result:
    - Backend: `🔴 0 / 🟡 0 / 🟢 2 / 💡 0`
    - Frontend: `🔴 0 / 🟡 0 / 🟢 1 / 💡 0`
    - Infra: `🔴 0 / 🟡 0 / 🟢 1 / 💡 0`

### Design

- Status: completed
- Result:
  - Design main: `Critical 0 / Warning 0 / Good 3 / Suggestion 0`
  - UX manager: `Critical 0 / Warning 0 / Good 3 / Suggestion 0`
  - UI manager: `🔴 0 / 🟡 0 / 🟢 2 / 💡 1`
- Notes:
  - No user-visible UI regression was found because no frontend presentation code changed.
  - The `api` healthcheck gate removes the cold-start race that could previously surface as an empty or failing first load.
  - Optional follow-up only: quiet the Next.js local `allowedDevOrigins` warning to reduce console noise.

### QA

- Status: completed
- Result:
  - Beginner: `통과 4/4 시나리오, 실패: [], 개선: [allowedDevOrigins warning cleanup]`
  - Regular: `통과 3/3 시나리오, 실패: 없음, 개선: [allowedDevOrigins warning cleanup]`
  - Power: `통과 4/4 시나리오, 실패: [], 개선: [deps bootstrap optimization, allowedDevOrigins warning cleanup]`
  - UI/UX: `통과 3/3 시나리오, 실패: [], 개선: [allowedDevOrigins warning cleanup]`
- Notes:
  - Local developer smoke flows passed: stack boot, API health/docs reachability, and landing redirect.
  - Operational checks passed: DB/Redis host listeners are absent and the API stays healthy before the web container comes up.

### Docs

- Status: completed
- Updated:
  - `AGENTS.md`
  - `.claude/agents/workflow.md`
  - `.github/tasks/06-fix-make-dev-runtime.md`
- Summary:
  - Documented the glibc-based dev image, `deps` bootstrap flow, and `pg_isready -d matchup_dev` requirement.
  - Recorded the dev-only `AUTH_HASH_DRIVER=bcryptjs` override while keeping production on native `bcrypt`.
  - Captured the health-gated `web` startup, internal-only DB/Redis dev network, and the validation evidence for `make dev`.
- Open gaps:
  - Optional: suppress the local Next.js `allowedDevOrigins` warning.
  - Optional: optimize `deps` bootstrap with a lockfile-hash sentinel instead of a full resync on every restart.

# infra-dev

## Role
- Codex builder for infra and runtime safety in Teameet.
- Claude mapping: `infra-devops-dev` + `infra-security-dev`.

## Owned Surfaces
- `docker-compose*.yml`
- `deploy/**`
- `Makefile`
- `.github/workflows/**`
- `infra/**`

## Must Keep True
- Ports: `web=3013`, `api=8121`, game-operations worker `8122` (dev and prod; prod binds to `127.0.0.1` behind nginx).
- `web` startup remains gated on API health.
- Prod applies migrations with `prisma migrate deploy` once inside `deploy/deploy-prod.sh`.
- Production automation must prefer idempotent backfill over destructive full seed.
- `.env*` contents are never read or committed.
- alpha and prod hosts differ (e.g. compose plugin availability) — scripts must work on both.
- Production deploy preflight must catch only truly required env before container startup; prod secrets flow GitHub Secrets → Parameter Store → host `.env` without leaving stale host values behind.
- `deploy.yml` changes must pass `pnpm qa:production-deploy-security` and `pnpm qa:v1-db-guardrails`.
- V1 frontend internal routing must resolve to the configured v1 API origin, not a legacy dev fallback.

## Validation
- Relevant workflow or compose sanity checks
- Guardrail/contract checks for touched deploy scripts (see `deploy.yml` Gates job)
- Manual review of deploy/runtime assumptions

## Report
- Changed files
- Validation performed
- Runtime/deploy impact
- Security posture changes

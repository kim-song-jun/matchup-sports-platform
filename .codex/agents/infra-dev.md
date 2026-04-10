# infra-dev

## Role
- Codex builder for infra and runtime safety in MatchUp.
- Claude mapping: `infra-devops-dev` + `infra-security-dev`.

## Owned Surfaces
- `docker-compose*.yml`
- `deploy/**`
- `Makefile`
- `.github/workflows/**`
- `infra/**`

## Must Keep True
- Dev ports: `web=3003`, `api=8111`.
- Prod ports: `web=3000`, `api=8100`.
- `web` startup remains gated on API health.
- Production automation must prefer idempotent backfill over destructive full seed.
- `.env*` contents are never read or committed.
- EC2 / Amazon Linux flows consider both `docker compose` and standalone `docker-compose`.
- Production deploy preflight must catch only truly required env before container startup. Toss payment secrets stay optional, and GitHub repo secrets must converge EC2 `deploy/.env` without leaving stale host values behind.
- Production web internal routing must resolve to `http://api:8100`, not the dev fallback `http://localhost:8111`.

## Validation
- Relevant workflow or compose sanity checks
- `pnpm build` when infra change can affect build or runtime boot
- Manual review of deploy/runtime assumptions

## Report
- Changed files
- Validation performed
- Runtime/deploy impact
- Security posture changes

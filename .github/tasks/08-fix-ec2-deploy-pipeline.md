# 08. Fix EC2 Deploy Pipeline

## Context

- User requested a live deployment audit using the repository `ec2-info` entry.
- Live checks on 2026-04-08 showed the production EC2 host at `52.78.228.77` accepts `ec2-user`, not `ubuntu`.
- Live checks on 2026-04-10 showed the latest `CI / Deploy` run (`24235621836`) builds images successfully but still fails at the final health check.
- The production EC2 host was in an API crash loop because `TOSS_SECRET_KEY` was treated as required at boot in production even though the payment services already support mock mode.
- The production web image also baked `localhost:8111` into rewrites because `INTERNAL_API_ORIGIN` was not passed at build time.
- Follow-up live validation on 2026-04-11 showed the production `web` container also needs `HOSTNAME=0.0.0.0`; otherwise Next standalone can bind only to the container IP and fail the localhost healthcheck even while logging `Ready`.
- Follow-up live validation on 2026-04-11 also confirmed `deploy/docker-compose.prod.yml` is image-only for `web`/`api`, so manual recovery must rebuild `matchup-web:latest` with `deploy/Dockerfile.web` directly before `compose up`.

## Goal

- Restore the current GitHub Actions deploy pipeline on `main`.
- Keep deploy blocked only on truly required runtime env, while leaving Toss payment integration optional.
- Restore production web-to-api routing for server-side rewrites and SSR fetches.
- Align EC2 access info and deployment documentation with the audited production host.

## Original Conditions

- `ec2-info` pointed to `User ubuntu`.
- `.github/workflows/deploy.yml` specified pnpm in both the action input and root `package.json`.
- The deploy job assumed `sudo docker compose`, but the audited EC2 host only has `sudo docker-compose`.
- Deployment docs still described `git pull` on the server even though the production checkout behaves as an `rsync` mirror and may not contain `.git`.
- The deploy readiness check only verified `pidof node`, so a boot-time Nest crash still looked "running" until the trailing health step failed.
- `deploy/docker-compose.prod.yml` did not pass `TOSS_SECRET_KEY` into the API container.
- `deploy/Dockerfile.web` did not receive `INTERNAL_API_ORIGIN`, so production rewrites defaulted to `http://localhost:8111`.

## User Scenarios

- Operator reads `ec2-info` and connects to the real EC2 host without trial-and-error.
- A push to `main` completes `CI / Deploy` and redeploys the latest code without leaving `matchup_api` in a restart loop.
- An operator can understand manual recovery steps without assuming unsupported Docker Compose commands or a Git worktree on the host.
- The deploy job fails immediately when truly required env is missing, but still succeeds when Toss payment secrets are intentionally unset.
- If the operator manages Toss secrets in GitHub Actions, the deploy job syncs them into the protected EC2 `deploy/.env` before preflight and clears stale host values when the repo secret is empty.

## Test Scenarios

- Confirm the workflow YAML parses after the change.
- Confirm the deploy workflow no longer pins a second pnpm version in the action setup step.
- Confirm the deploy workflow no longer treats `TOSS_SECRET_KEY` as a blocking env but still checks real API health rather than `pidof node`.
- Confirm the deploy workflow can hydrate `TOSS_*` values from GitHub repo secrets into EC2 `deploy/.env` before preflight and blank them when the repo secrets are unset.
- Confirm the web Docker build receives a production-safe internal API origin.
- Confirm deploy documentation references `ec2-user`, compose-command compatibility, and the optional payment-secret behavior.

## Parallel Work Breakdown

- Infra: fix GitHub Actions deploy workflow and EC2 access entry.
- Docs: update deployment guide, README, and agent runtime notes.
- Frontend: make mock payment checkout/detail/refund flows explicitly disclose `테스트 결제/환불` and block legacy real-payment refund when the integration is unavailable.

## Acceptance Criteria

- `ec2-info` uses the working SSH user from the audited host.
- `CI / Deploy` test job does not fail on pnpm version duplication.
- Deploy job supports both `docker compose` and `docker-compose` on the EC2 target.
- Deploy job fails fast only when truly required env such as DB/JWT is missing.
- Deploy job can source `TOSS_SECRET_KEY` from GitHub repo secrets and persist or blank it in EC2 `deploy/.env` before starting containers according to the repo secret state.
- `deploy/docker-compose.prod.yml` passes payment secrets into `matchup_api` when present without making them mandatory.
- `deploy/docker-compose.prod.yml` pins `HOSTNAME=0.0.0.0` for the standalone Next runtime so localhost healthchecks and nginx dependency gates succeed.
- The web production build uses `INTERNAL_API_ORIGIN=http://api:8100` unless explicitly overridden.
- Mock payment checkout/detail/refund surfaces visibly disclose that charges and refunds are simulated, and legacy real-payment refund CTAs stay blocked when provider state is unavailable.
- Docs no longer instruct operators to `git pull` from a host checkout that may not be a Git repository.

## Tech Debt Resolved

- Removed drift between bootstrap/runtime assumptions and the deploy workflow.
- Removed drift between actual EC2 access and repository operator docs.
- Removed drift between the payment services' mock-mode contract and compose/workflow/bootstrap scripts.
- Removed drift between the web build-time API origin and the production Docker network topology.
- Removed drift between standalone Next runtime binding behavior and the compose localhost healthcheck contract.
- Removed drift between backend mock-mode behavior and user-facing payment/refund disclosure in the frontend.

## Security Notes

- No secret values are copied into the repository.
- Deployment docs continue to reference secret names only, not contents.

## Risks

- The workflow change is static until it is pushed and exercised by GitHub Actions.
- The EC2 host is still on standalone `docker-compose`; a future host image change should be re-verified before assuming plugin availability.
- If payment secrets are intentionally absent, payment flows remain in mock mode until the operator provides real Toss credentials.

## Ambiguity Log

- 2026-04-08: Verified whether the production host should use `ubuntu` or `ec2-user`; live SSH authentication confirmed `ec2-user`.

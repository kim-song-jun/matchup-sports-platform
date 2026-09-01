# Task 159 — Alpha runtime node-tar remediation

## Scope

- Remove unused bundled npm/npx from the final v1 API and Web runtime images.
- Keep Node, Corepack-managed pnpm for API deploy operations, and the Web standalone server contract intact.
- Do not weaken or bypass the ECR Critical finding gate.

## Incident evidence

- Alpha deploy run `33462656896` stopped before manifest/deploy with `teameet-alpha-v1-api critical=1 high=7`.
- The pulled `node:22-alpine` digest `sha256:c610fcdf...` reports Node 22.23.2, npm 10.9.8, and bundled `tar@7.5.11`.
- CVE-2026-59873 affects node-tar `<=7.5.18`; the patched version is 7.5.19.
- `pnpm --filter v1_api why tar` finds no v1 API application dependency on tar. The vulnerable copy belongs to the unused npm CLI bundled in the runtime base image.

## Acceptance criteria

- [x] Final v1 API and Web images contain no `/usr/local/lib/node_modules/npm`, `npm`, or `npx` command.
- [x] API image still runs `node` and Corepack-managed `pnpm`; Web image still starts the standalone server.
- [x] Docker images build successfully.
- [ ] ECR Critical gate reports zero Critical findings and Alpha deployment succeeds.
- [ ] Task 158 live API returns seven appearances and silver after deployment.

## Progress snapshot

- 2026-09-01: Local Docker verification passed: both images built; API returned Node 22.23.2 and pnpm 9.15.4 with npm/npx absent; Web returned HTTP 200 from the standalone server with npm/npx absent.
- 2026-09-01: Docker Scout required an external Docker ID and was not used as evidence. The repository's fail-closed ECR gate remains the authoritative remote scan.
- 2026-09-01: Root cause reproduced from the current public base image. Runtime-only removal selected because npm/npx are not part of either service startup contract and upgrading an unused package would preserve unnecessary attack surface.

# backend-dev

## Role
- Codex builder for all backend work in Teameet.
- Claude mapping: `backend-api-dev` + `backend-data-dev`.

## Owned Surfaces
- `apps/v1_api/src/**`
- `apps/v1_api/prisma/**`
- `apps/v1_api/test/**`

## Must Keep True
- API prefix stays `/api/v1`.
- Response envelope stays `{ status: "success", data, timestamp }`; errors `{ statusCode, code, message }`.
- DTO validation uses `class-validator` with strict `ValidationPipe`.
- Permission checks keep `V1AuthGuard`, `AdminContextService.getActiveAdmin()`, and service-layer team role rules (owner > manager > member).
- Every schema change ships a migration in `apps/v1_api/prisma/migrations/`.
- `passwordHash` never leaks to API responses.
- Schema/API contract changes sync `apps/v1_api/test/fixtures/`, `apps/v1_web/src/test/msw/`, seeds in `apps/v1_api/prisma/`, inline mocks.

## Validation
- `pnpm --filter v1_api test`
- `pnpm --filter v1_api lint`
- `pnpm --filter v1_api test:integration` when endpoint or persistence changes (needs a DB; CI runs it)
- DTO/query changes: verify the live response via integration spec or on alpha after merge

## Report
- Changed files
- Tests run
- Fixture/MSW sync status
- Runtime contract checks performed

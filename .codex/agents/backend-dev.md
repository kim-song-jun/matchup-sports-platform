# backend-dev

## Role
- Codex builder for all backend work in Teameet.
- Claude mapping: `backend-api-dev` + `backend-data-dev`.

## Owned Surfaces
- `apps/api/src/**`
- `apps/api/prisma/**`
- `apps/api/test/**`

## Must Keep True
- API prefix stays `/api/v1`.
- Response envelope stays `{ status, data, timestamp }`.
- DTO validation uses `class-validator` with strict `ValidationPipe`.
- Permission checks keep `JwtAuthGuard`, `AdminGuard`, `TeamMembershipService.assertRole(...)`.
- `passwordHash` never leaks to API responses.
- Schema/API contract changes sync `apps/api/test/fixtures/`, `apps/web/src/test/msw/`, `e2e/fixtures/`, inline mocks.

## Validation
- `pnpm --filter api test`
- `pnpm --filter api test:integration` when endpoint or persistence changes
- DTO/query changes require live response check on `http://localhost:8111/api/v1`

## Report
- Changed files
- Tests run
- Fixture/MSW/E2E sync status
- Runtime contract checks performed

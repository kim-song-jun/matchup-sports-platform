# Task 79 - Implementation Summary

Date: 2026-04-23
Related task: [79-team-match-management-history-contracts.md](/D:/dev/projects/matchup-sports/matchup-sports-platform/.github/tasks/79-team-match-management-history-contracts.md)

## Implemented

### Backend

- `PATCH /team-matches/:id` endpoint added
  - file: `apps/api/src/team-matches/team-matches.controller.ts`
- team-match update/cancel service logic added
  - file: `apps/api/src/team-matches/team-matches.service.ts`
- update DTO now accepts optional `status`
  - file: `apps/api/src/team-matches/dto/update-team-match.dto.ts`
- list query now supports comma-separated status filters
  - file: `apps/api/src/team-matches/dto/team-match-query.dto.ts`
  - file: `apps/api/src/team-matches/team-matches.service.ts`
- duplicate apply now returns normalized `409 Conflict`
  - file: `apps/api/src/team-matches/team-matches.service.ts`

### Frontend

- team-match status meta centralized
  - file: `apps/web/src/lib/team-match-operations.ts`
- team-match card now uses canonical status vocabulary
  - file: `apps/web/src/components/match/team-match-card.tsx`
- `/my/team-matches` now queries explicit history statuses and renders canonical status badges
  - file: `apps/web/src/app/(main)/my/team-matches/page.tsx`
- `/teams/:id/matches` now queries explicit history statuses
  - file: `apps/web/src/app/(main)/teams/[id]/matches/page.tsx`
- edit page now reflects backend contract
  - recruiting only: edit
  - recruiting/scheduled: cancel
  - file: `apps/web/src/app/(main)/team-matches/[id]/edit/page.tsx`
- admin team-match list/detail now use canonical history status vocabulary
  - files:
    - `apps/web/src/app/admin/team-matches/page.tsx`
    - `apps/web/src/app/admin/team-matches/[id]/page.tsx`
- admin team detail now renders recent team-match status via shared helper
  - file: `apps/web/src/app/admin/teams/[id]/page.tsx`
- update mutation hook added
  - file: `apps/web/src/hooks/api/use-team-matches.ts`
- API types updated for update payload and applicant-side team-match status
  - file: `apps/web/src/types/api.ts`

### Mock / Docs / Tests

- MSW handlers updated for history list and patch update/cancel
  - file: `apps/web/src/test/msw/handlers/team-matches.ts`
- team-match fixtures updated with canonical status data
  - file: `apps/web/src/test/fixtures/team-matches.ts`
- backend integration coverage extended
  - update recruiting match
  - cancel scheduled match
  - duplicate apply conflict
  - status-filtered history query
  - file: `apps/api/test/integration/team-matches.e2e-spec.ts`
- API docs synced
  - file: `docs/api/domains/team-matches.md`
- scenario notes synced
  - file: `docs/scenarios/05-team-match-flows.md`
  - file: `tests/ui-scenarios/scenarios/06-team-matches.md`
- helper test refreshed for canonical status labels and history filter
  - file: `apps/web/src/lib/__tests__/team-match-operations.test.ts`

## Contract Decisions Applied

- edit allowed only when `status === recruiting`
- cancel allowed only when `status in [recruiting, scheduled]`
- history pages use explicit status list instead of backend default
- canonical user-facing status vocabulary:
  - `recruiting`
  - `scheduled`
  - `checking_in`
  - `in_progress`
  - `completed`
  - `cancelled`

## Verification Attempted

- `pnpm --filter api test:integration -- --runInBand test/integration/team-matches.e2e-spec.ts`
  - blocked by missing Prisma test datasource env (`DATABASE_URL` not configured in current shell)
- `pnpm --filter api exec tsc --noEmit --pretty false`
  - blocked before task-specific files by existing `@nestjs/throttler` module resolution issue
- `pnpm --filter web exec tsc --noEmit --pretty false`
  - blocked before task-specific files by existing `src/hooks/__tests__/use-realtime.test.tsx` type errors

## Files Changed By This Task

- `apps/api/src/team-matches/dto/team-match-query.dto.ts`
- `apps/api/src/team-matches/dto/update-team-match.dto.ts`
- `apps/api/src/team-matches/team-matches.controller.ts`
- `apps/api/src/team-matches/team-matches.service.ts`
- `apps/api/test/integration/team-matches.e2e-spec.ts`
- `apps/web/src/app/(main)/my/team-matches/page.tsx`
- `apps/web/src/app/(main)/team-matches/[id]/edit/page.tsx`
- `apps/web/src/app/(main)/teams/[id]/matches/page.tsx`
- `apps/web/src/app/admin/team-matches/page.tsx`
- `apps/web/src/app/admin/team-matches/[id]/page.tsx`
- `apps/web/src/app/admin/teams/[id]/page.tsx`
- `apps/web/src/components/match/team-match-card.tsx`
- `apps/web/src/hooks/api/use-team-matches.ts`
- `apps/web/src/lib/team-match-operations.ts`
- `apps/web/src/lib/__tests__/team-match-operations.test.ts`
- `apps/web/src/test/fixtures/team-matches.ts`
- `apps/web/src/test/msw/handlers/team-matches.ts`
- `apps/web/src/types/api.ts`
- `docs/api/domains/team-matches.md`
- `docs/scenarios/05-team-match-flows.md`
- `tests/ui-scenarios/scenarios/06-team-matches.md`

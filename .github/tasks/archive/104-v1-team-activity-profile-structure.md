# 104 V1 Team Activity Profile Structure

## Scope

- Backend: `apps/v1_api`
- Frontend: `apps/v1_web`
- Docs: `docs/api/domains/teams.md`, `docs/api/v1/domains/teams.md`

## Goal

Replace free-text-only team activity input with structured activity profile fields while keeping existing `activity_note` data as memo/fallback.

## Planned Contract

- `activityDays: string[]`
- `activityFrequency: string | null`
- `activityTimeSlots: string[]`
- `activityTypes: string[]`
- `activityMemo: string | null`
- `activitySummary: string | null`

## Acceptance Criteria

- Team create/edit can save structured activity values.
- Team detail/list/my-teams use one activity summary presentation.
- Existing teams with only old activity text still display that text.
- API docs and frontend types stay in sync.
- V1 tests/checks and browser smoke are run or blockers are recorded.

## Progress Snapshot

- 2026-06-29: Started implementation. PostgreSQL supports Prisma `String[]`; use array columns for structured choices.
- 2026-06-29: Added Prisma columns/migration for `activityDays`, `activityFrequency`, `activityTimeSlots`, `activityTypes`; kept `activity_note` as memo/fallback.
- 2026-06-29: Updated team create/update DTO, service selects/mappers, list/detail/my-teams response summary, seed data, frontend API types, form draft, edit hydrate, submit payload, cache update, team list/detail presentation, and API docs.
- 2026-06-29: Replaced team create/edit free-text-only activity field with structured controls: weekday presets, day chips, frequency select, time-slot chips, activity-type chips, memo, and live preview.
- 2026-06-29: Browser smoke passed on `/v1/teams/00000000-0000-4000-8000-000000000101/edit` with owner persona. Evidence screenshot: `output/playwright/team-activity-profile-20260629/team-edit-activity-profile.png`.
- 2026-06-29: Local full validation is blocked by the current workspace toolchain: `prisma`, `jest`, and `next` command shims are not resolvable; direct Prisma CLI also fails to load `@prisma/engines`. Static syntax/pattern checks passed where possible.

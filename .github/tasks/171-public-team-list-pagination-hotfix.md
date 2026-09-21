# Task 171: Public Team List Pagination Hotfix

## Scope

- Targets: `apps/v1_api`, `apps/v1_web`, `docs/api/domains/teams.md`
- Release branches: `fix/dev-team-list-pagination-20260921`, `hotfix/main-team-list-pagination-20260921`
- Route: public `/teams`

## Problem

`GET /teams` returns at most 50 rows and a next cursor, but the public team page uses a one-shot query and ignores that cursor. The page therefore stops at 50 teams and calculates the header total from the loaded array, presenting the first page count as the full result count.

## Acceptance Criteria

- [x] `GET /teams` reports the total number of teams matching the active filters.
- [x] `/teams` accumulates cursor pages and exposes an explicit `팀 더 보기` action while another page exists.
- [x] The header uses the server total and clearly distinguishes it from the number currently rendered.
- [x] Counts derived only from loaded rows are not presented as full-result counts.
- [x] Search, sport, level, gender, join-policy, and sort changes restart pagination from the first page.
- [x] API docs and focused backend/frontend tests cover the contract.
- [x] The same behavior is delivered from independently based main and dev hotfix branches.

## Owned Files

- `apps/v1_api/src/teams/teams.service.ts`
- `apps/v1_api/src/teams/teams.service.spec.ts`
- `apps/v1_web/src/hooks/use-v1-api.ts`
- `apps/v1_web/src/components/teams/**`
- `docs/api/domains/teams.md`

## Forbidden Scope

- Admin team pagination
- Team detail/create/edit behavior
- Prisma schema or migrations
- Direct pushes to `main` or `dev`

## Progress Snapshot

- 2026-09-21: Confirmed on `origin/main` and `origin/dev`: frontend requests `limit=50`, renders `visibleTeams.length` as total, and ignores `pageInfo.nextCursor`; backend caps at 50.
- 2026-09-21: Created isolated main/dev worktrees from current remote heads.
- 2026-09-21: Main validation passed: API focused suite 77/77, Web focused suite 1/1, API/Web `tsc --noEmit`.
- 2026-09-21: Dev validation passed: API focused suite 89/89, Web focused suites 18/18, API/Web `tsc --noEmit`.
- 2026-09-21: Browser screenshot QA could not be started because the Windows CUA sandbox failed while applying read ACLs. The visible change is covered by rendered component tests; runtime screenshot verification remains a deployment follow-up.

## Ambiguity Log

- Public discovery keeps the repository's cursor + explicit `더 보기` pattern. Numbered pagination remains limited to admin/data-table surfaces.
- This hotfix does not increase the server cap. It consumes the existing cursor and adds an exact filtered total.

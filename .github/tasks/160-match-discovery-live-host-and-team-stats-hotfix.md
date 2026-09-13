# Match discovery live host and team stats hotfix

## Context

- Production still exposes the legacy personal-match fallback host while `dev` already maps `GET /matches` items to the creator profile.
- Home discovery orders personal matches before team matches.
- Team-match cards contain mock manner/win values in the fallback view model, while the public list/detail API only returns `trustState`.

## Goal

- Put team matches before personal matches on the home quick actions.
- Preserve the existing `dev` fix that returns the creator nickname for personal-match list items.
- Return live, public team manner score and official win count from both team-match list and detail endpoints.
- Never substitute mock statistics when live values are unavailable.

## Scope

Owned: `apps/v1_api/src/team-matches/**`, `apps/v1_web/src/components/home/**`, `apps/v1_web/src/components/team-matches/**`, `apps/v1_web/src/types/api.ts`, `docs/api/domains/{matches,team-matches}.md`, and this task document.

Forbidden: Prisma schema/migrations, deploy/workflow files, and unrelated tournament work.

## Acceptance Criteria

- [x] Home quick actions render team match before personal match.
- [x] Personal-match list host comes from `hostUser.profile.nickname`, then `displayName`, never the sample view model when the API succeeds.
- [x] `GET /team-matches` and `GET /team-matches/:id` return `hostTeam.mannerScore` and `hostTeam.wins`.
- [x] Manner score uses revealed team reviews only.
- [x] Wins count only current official result facts where `result = 'WON'`.
- [x] Missing live values render as `-`, not mock numbers.

## Validation

- Backend service unit tests for list/detail live stats.
- Frontend mapper and home ordering tests.
- Narrow typecheck/test, then committed-tree diff checks.

## Security Notes

- Public endpoints only expose aggregate statistics already intended for public team surfaces.
- No private user fields or draft/unofficial results are exposed.

## Progress Snapshot

- Branch: `hotfix/match-discovery-live-stats` from `origin/dev` at `5150d34ed`.
- Personal list host mapping already exists on `dev` in commit `6215b43aa`; production needs normal user-owned promotion.
- Backend team-match service tests: 57 passed.
- Frontend focused tests: 42 passed.
- Backend and frontend TypeScript checks: passed.
- Headed browser visual verification was unavailable in this session; component rendering and ordering are covered by focused tests.

## Ambiguity Log

- `wins` is the count of the team's current official record facts with result `WON`, across all supported team game sources.

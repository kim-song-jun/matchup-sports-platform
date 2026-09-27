# 91. Match Create And Team Match UX Polish

Date: 2026-06-04
Owner: codex
Status: complete

## Scope

- Frontend: `apps/v1_web/src/components/matches`, `apps/v1_web/src/components/team-matches`
- Scenario docs: `docs/scenarios/03-match-flows.md`, `docs/scenarios/05-team-match-flows.md`
- API docs: `docs/api/v1/domains/team-matches.md`

## Requirements

- [x] Match create region selection must be available and initialized from v1 district regions.
- [x] Match create image selection must update the representative image preview and payload state.
- [x] Team match detail team-info CTA should use the real host team route and a cleaner button treatment.
- [x] Team match applicant-team section is visible only to the team match host side.
- [x] Team match host can navigate to the existing management surface.
- [x] Team match bottom chat entry is available only after participation is approved.
- [x] Team match create must list current user's creatable teams, not fixed mock teams.
- [x] Team match create must be limited to teams where the user can create a team match.

## Validation

- [x] `pnpm --filter v1_api exec tsc --noEmit`
- [x] `pnpm --filter v1_web exec tsc --noEmit`
- [x] Focused browser smoke for `/matches/new/*`, `/team-matches/:id`, and `/team-matches/new/*` when local runtime is available.

## Progress Snapshot

- 2026-06-04: Implemented user feedback for match create image/region flow and team match detail/create authorization UX.
- 2026-06-05: Responsive route smoke covered `/matches/new/*`, `/team-matches/team-match-1`, and `/team-matches/new/*` at 320/390/430 widths with 0 issues. Report: `output/playwright/v1-responsive-smoke/responsive-rerun-match-320/report.md`.

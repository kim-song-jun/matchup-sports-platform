# Task 178 - Team Match Public Recent History

Status: Implementation and local QA complete; Alpha deployment pending
Target: backend + frontend + docs
Branch: `fix/v1-team-match-weekly-history` -> `dev`

## Context

The public `/team-matches` list drops a team match as soon as its raw status changes to `completed`. Personal matches already keep recently completed matches visible for seven days, so the two discovery surfaces behave inconsistently.

## Contract

- `GET /api/v1/team-matches` without an explicit `status` includes completed team matches for seven days from `completedAt`.
- Legacy completed rows without `completedAt` use `startAt` as the compatibility fallback.
- The seven-day window is inclusive at the query boundary (`gte`).
- Explicit `status=completed` remains a full-history query and is not limited to seven days.
- `sort=recommended` remains focused on recruiting or live matched games and does not include completed matches.
- A completed list card says `경기 종료`, not `신청 마감`, while retaining the existing closed-card visual treatment and disabled application behavior.

## Acceptance Criteria

- [x] Default public list query includes recent completed rows and excludes completed rows older than seven days.
- [x] Recruiting/recommended behavior is unchanged.
- [x] Explicit completed history remains available without the public-window limit.
- [x] Completed cards are visibly distinguished as `경기 종료`.
- [x] API contract docs and the team-match scenario ledger describe the rule.
- [x] Focused API and web tests pass.
- [x] Responsive headed-browser QA passes at mobile, tablet, and desktop widths with no overflow, console errors, or failed API requests.
- [ ] A changeset is present and the change is merged/deployed only to `dev`/Alpha.

## Progress Snapshot

- [x] Root and `.codex` instructions reviewed.
- [x] Current `dev` service, UI mapping, tests, and API docs inspected.
- [x] Root cause confirmed: default team-match discovery only admits `recruiting`, `closed`, and `matched`.
- [x] RED tests added and observed failing before implementation.
- [x] Implementation complete.
- [x] Focused API tests: 71 passed.
- [x] Focused web tests: 100 passed.
- [x] API and web TypeScript checks passed.
- [x] API and web production builds passed.
- [x] Headed Chrome QA passed at 390, 768, and 1440 px. Evidence: `output/playwright/visual-audit/task178-team-match-history/after-report.json` and matching screenshots.
- [ ] Alpha deployment complete.

## Ambiguity Log

- "일주일" is interpreted as the rolling 7 x 24-hour window already used by personal-match discovery, anchored to `completedAt` because that is the canonical team-match completion transition timestamp.
- Cancelled matches are not included: the request is specifically for completed/ended matches.

# 89 · V1 Level Range Filter Contract

## Scope

- Backend: `apps/v1_api`
- Frontend: `apps/v1_web`
- Docs: `docs/api/domains/{matches,team-matches,teams}.md`

## Goal

Use the canonical four sport levels (`beginner`, `novice`, `intermediate`, `advanced`) as a real min/max range contract for matches, team matches, and teams. Filters must query this normalized range instead of relying on display text.

## Acceptance Criteria

- [x] Match, team match, and team records can store min/max sport level references.
- [x] `min=max` is valid and displays as a single level.
- [x] `min > max` is rejected by service validation.
- [x] List APIs accept `levelCodes=beginner,novice,intermediate,advanced`.
- [x] Frontend filter URLs use level codes and render Korean labels.
- [x] Existing text fields remain available as display/notes fallback.

## Progress Snapshot

- 2026-06-01: Created from runtime request after confirming current frontend filters look for `levelLabel` while v1 APIs return only free-text notes.
- 2026-06-01: Implemented v1 Prisma min/max sport-level FKs, API filter/mutation contract, frontend `levelCodes` filters, seed/MSW sync, and docs sync. Verified with `pnpm --filter v1_api build` and `pnpm --filter v1_web exec tsc --noEmit`.

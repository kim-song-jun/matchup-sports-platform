# Task 145 — Tournament lineup roster two-column layout

Status: implementation complete; browser visual verification pending local runtime
Target: v1 frontend

## Request

Show two registered players per row in the tournament fixture lineup roster where width permits.

## Contract

- Mobile, tablet, and desktop use two equal columns.
- Each card splits selection/name and goalkeeper/jersey controls into two rows so 44px targets remain usable.
- Roster order, starter toggles, goalkeeper controls, jersey inputs, and save payload behavior do not change.
- Each player remains one semantic card; no decorative accent rail or dense nested border treatment.

## Owned files

- `apps/v1_web/src/app/tournaments/[id]/matches/[fixtureId]/lineup/lineup-client.tsx`
- `apps/v1_web/src/app/tournaments/[id]/matches/[fixtureId]/lineup/lineup-client.test.tsx`
- `apps/v1_web/src/app/globals.css`

## Acceptance criteria

- [x] The roster container exposes a responsive two-column class.
- [x] Two player cards render per row at every supported viewport.
- [x] Existing lineup TypeScript contract remains green.

## Validation

- `pnpm --filter v1_web exec tsc --noEmit --pretty false`: PASS
- Focused Vitest process exited without a failure report, but this host did not emit the normal
  test summary; do not count it as conclusive runtime evidence.
- Headed browser verification remains pending because the local Docker QA runtime is unavailable.

# Task 144 — Tournament lineup side-scoped version CAS

Status: implementation complete; live DB integration verification pending local Docker runtime
Target: v1 backend + v1 frontend + API docs

## Problem

Tournament home and away lineups are independent resources, but both save and submit currently
compare `expectedVersion` against the shared `V1Game.version`. A successful command by one team
therefore makes the other team's already-open editor stale even though the two sides did not edit
the same lineup.

## Contract

- For `PUT /games/:gameId/lineups/:sideId`, `expectedVersion` means the latest revision of that
  side's lineup (`0` when none exists).
- For `POST /games/:gameId/lineups/:lineupId/submit`, `expectedVersion` means that lineup's revision.
- Home and away may save or submit from editors opened at the same time without cross-side
  `VERSION_CONFLICT`.
- Two writers editing the same side from the same base revision still receive
  `409 VERSION_CONFLICT`, including `details.expectedVersion/currentVersion`.
- `V1Game.version` continues to increment after every successful command for aggregate ordering,
  realtime, audit, and other game mutations; it is no longer the lineup editor's CAS token.
- Idempotency, authorization, roster validation, lineup-size validation, and kickoff gates remain
  unchanged.

## Owned files

- `apps/v1_api/src/games/games.service.ts`
- `apps/v1_api/test/games/game-lifecycle.integration-spec.ts`
- existing generic-lineup integration specs updated for the scoped `expectedVersion` meaning
- `apps/v1_web/src/app/tournaments/[id]/matches/[fixtureId]/lineup/fixture-lineup.view-model.ts`
- `apps/v1_web/src/app/tournaments/[id]/matches/[fixtureId]/lineup/fixture-lineup.test.ts`
- `apps/v1_web/src/app/tournaments/[id]/matches/[fixtureId]/lineup/lineup-client.tsx`
- `apps/v1_web/src/hooks/use-v1-api.ts`
- `docs/api/domains/games.md`
- `docs/api/domains/tournament-operations.md`

## Acceptance criteria

- [x] Given home and away editors both start at revision `0`, when home saves first and away saves
      second, then both saves succeed.
- [x] Given two editors for the same side start at the same revision, when one saves first, then
      the second receives `VERSION_CONFLICT`.
- [x] A saved lineup can be submitted after the opposing side has saved or submitted.
- [x] The frontend hydrates, saves, and submits using the current side's lineup revision.
- [x] API documentation states the lineup-specific meaning of `expectedVersion`.

## Ambiguity log

- No Prisma change is required: `V1GameLineup.revision` and unique `(gameId, sideId, revision)`
  already provide the side-scoped version.

## Progress snapshot

- 2026-08-15: Root cause confirmed in the generic tournament-fixture lineup path. Implementation
  started from current `dev` HEAD.
- 2026-08-15: Backend and frontend type checks passed; focused frontend lineup suite passed 23/23.
  The existing lifecycle integration scenario now proves cross-side success and same-side stale
  rejection, but it could not be executed because Docker Desktop/local QA Postgres was unavailable.

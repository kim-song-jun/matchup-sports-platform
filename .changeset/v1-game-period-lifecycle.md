---
"v1_api": minor
"v1_web": minor
---

Drive the `V1GamePeriod` lifecycle from game commands so recorded events carry a real period and clock instead of always freezing at `period = <last period>, clockMs ≈ 0`.

Nothing ever updated `V1GamePeriod` — the whole API only ever ran `createMany` and `findFirst` on it, so `state` stayed `SCHEDULED` and `startedAt` stayed null forever. The live console then failed to find a LIVE period, fell back to the highest-numbered one, and (because `startedAt` was null) anchored the clock to `Date.now()`, producing `clockMs ≈ 0` for every captured event.

`start` now opens period 1 (`LIVE` + `startedAt`) inside the same transaction that flips the game state; a new `next-period` command closes the current period and opens the next one (`409 NO_NEXT_PERIOD` past the last); `end` closes whichever period is still live. Event appends now reject a period that has not started or has already ended (`409 PERIOD_NOT_STARTED` / `409 PERIOD_ALREADY_ENDED`). The console drops its `Date.now()` fallback entirely — with no anchor it blocks player taps and says so — and gains explicit 전반 시작 / 전반 종료 / 후반 시작 / 경기 종료 controls.

Includes a one-time backfill migration (`20260807000000_v1_period_live_backfill`) for games that were already `LIVE` or `PAUSED` when this ships, since the new guard would otherwise lock them out of recording permanently. It opens the game's already-recorded `MAX(event.period)` — not a hardcoded period 1 — because pre-deploy events were all written at the last period number, and opening period 1 would collide with the pre-existing `EVENT_LATE` guard and leave the very games it rescues still unrecordable. Idempotent by construction and a no-op on a fresh database.

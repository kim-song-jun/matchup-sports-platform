---
"v1_api": minor
---

Implement live tournament-fixture game operations for Task 20: an exclusive, expiring takeover-token grant (`GameTakeoverService`, 90s TTL, one holder per game, renew/reacquire) enforced on every exclusive game command/event/lineup-submit mutation instead of the prior any-non-empty-string stub; realtime `game.takeover.request`/`game.takeover.renew` socket handlers; a 30-second server-clock-drift check (`422 CLOCK_DRIFT`) on game commands and event appends; tournament required-scorer-policy enforcement at event-append time (`422 SCORER_REQUIRED`); a period-regression ("late event") guard (`422 EVENT_LATE`); an explicit `409 EVENT_ALREADY_REVERSED` guard on double-reversal attempts; and the `POST /api/v1/games/:gameId/result-recovery/derive-and-submit` route for recovering a pre-existing ended-without-revision tournament game (restricted to tournament_director/platform_ops).

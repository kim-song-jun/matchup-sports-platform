-- D-21 (design doc, T1-0 blocker B7): one-time repair for games that were
-- already V1Game.state='LIVE' OR 'PAUSED' before this deploy. Before T1-0's
-- fix to executeCommand, NEITHER `start` NOR `pause` ever touched
-- V1GamePeriod -- only V1Game.state was flipped -- so any game that reached
-- LIVE, or LIVE-then-PAUSED, under the old code still has every period
-- SCHEDULED. Once T1-0's PERIOD_NOT_STARTED gate ships in the same deploy,
-- those games could never receive another event again without this
-- backfill: a PAUSED game left this way stays permanently stuck even after
-- `resume`, because `resume` (by design, both before and after T1-0) never
-- touches V1GamePeriod either -- only `start` does. (Fix round 1: the first
-- cut of this migration only matched state='LIVE' and missed exactly this
-- start-then-pause case under the old code -- see the T1-0 report's Fix
-- round 1 section for the full causal chain that was found in review.)
--
-- Fix round 2 (task review, confirmed in code): the old console's
-- `currentPeriod` picked "the highest period number" whenever no period was
-- ever LIVE (see operate-console.tsx before T1-0's frontend fix) -- for a
-- 2-period sport that means every event captured pre-deploy was recorded at
-- period=2, never period=1. The first cut of this migration always opened
-- period 1 regardless of what was already recorded. That collided with the
-- PRE-EXISTING (not touched by T1-0) EVENT_LATE guard in
-- `assertEventReferences` (games.service.ts), which rejects any event whose
-- `period` is less than `MAX(period)` already recorded for that game: a
-- game with prior period=2 events, "fixed" by opening period 1, would
-- accept `start`/`resume` but reject with 422 EVENT_LATE the moment
-- anyone tried to actually record the next event at period=1 -- the exact
-- game this backfill exists to rescue would stay unrescuable. Opening
-- MAX(recorded period, defaulting to 1 when the game has no events yet)
-- instead of a hardcoded 1 keeps continuity with whatever was already
-- captured, so the next event's period can never regress behind it.
--
-- Idempotent by construction: the NOT EXISTS clause excludes any game that
-- already has at least one non-SCHEDULED period -- which includes games
-- this statement already backfilled and games that started normally
-- through the old OR new code path. Re-running this file (e.g. on a fresh
-- DB during migration replay, where no game is ever LIVE/PAUSED with
-- untouched periods) is a no-op.
UPDATE "v1_game_periods" AS "p"
SET "state" = 'LIVE', "started_at" = now()
FROM "v1_games" AS "g"
WHERE "p"."game_id" = "g"."id"
  AND "g"."state" IN ('LIVE', 'PAUSED')
  AND "p"."number" = COALESCE(
    (SELECT MAX("e"."period") FROM "v1_game_events" AS "e" WHERE "e"."game_id" = "g"."id"),
    1
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "v1_game_periods" AS "p2"
    WHERE "p2"."game_id" = "g"."id"
      AND "p2"."state" <> 'SCHEDULED'
  );

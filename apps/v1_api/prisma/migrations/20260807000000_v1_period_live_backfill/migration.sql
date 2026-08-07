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
-- Idempotent by construction: the NOT EXISTS clause excludes any game that
-- already has at least one non-SCHEDULED period -- which includes games
-- this statement already backfilled (their period 1 is now LIVE) and games
-- that started normally through the old OR new code path. Re-running this
-- file (e.g. on a fresh DB during migration replay, where no game is ever
-- LIVE/PAUSED with untouched periods) is a no-op.
UPDATE "v1_game_periods" AS "p"
SET "state" = 'LIVE', "started_at" = now()
FROM "v1_games" AS "g"
WHERE "p"."game_id" = "g"."id"
  AND "g"."state" IN ('LIVE', 'PAUSED')
  AND "p"."number" = 1
  AND NOT EXISTS (
    SELECT 1
    FROM "v1_game_periods" AS "p2"
    WHERE "p2"."game_id" = "g"."id"
      AND "p2"."state" <> 'SCHEDULED'
  );

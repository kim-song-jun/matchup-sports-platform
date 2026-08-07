-- D-21 (design doc, T1-0 blocker B7): one-time repair for games that were
-- already V1Game.state='LIVE' before this deploy. Before T1-0's fix to
-- executeCommand, `start` only flipped V1Game.state and never touched
-- V1GamePeriod, so those games' periods are still all SCHEDULED. Once
-- T1-0's PERIOD_NOT_STARTED gate ships in the same deploy, those games
-- could never receive another event again without this backfill.
--
-- Idempotent by construction: the NOT EXISTS clause excludes any game that
-- already has at least one non-SCHEDULED period -- which includes games
-- this statement already backfilled (their period 1 is now LIVE) and games
-- that started normally through the old OR new code path. Re-running this
-- file (e.g. on a fresh DB during migration replay, where no game is ever
-- LIVE with untouched periods) is a no-op.
UPDATE "v1_game_periods" AS "p"
SET "state" = 'LIVE', "started_at" = now()
FROM "v1_games" AS "g"
WHERE "p"."game_id" = "g"."id"
  AND "g"."state" = 'LIVE'
  AND "p"."number" = 1
  AND NOT EXISTS (
    SELECT 1
    FROM "v1_game_periods" AS "p2"
    WHERE "p2"."game_id" = "g"."id"
      AND "p2"."state" <> 'SCHEDULED'
  );

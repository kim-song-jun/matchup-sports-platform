ALTER TYPE "V1GameEventType" ADD VALUE IF NOT EXISTS 'OWN_GOAL';

ALTER TABLE "v1_game_result_revisions"
ADD COLUMN "goal_events" JSONB;

-- AlterEnum
ALTER TYPE "V1GameEventType" ADD VALUE 'FOUL';

-- AlterTable
ALTER TABLE "v1_game_events"
  ADD COLUMN "assist_participant_id" TEXT;

-- AlterTable
ALTER TABLE "v1_game_result_participants"
  ADD COLUMN "assists" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "fouls" INTEGER NOT NULL DEFAULT 0;

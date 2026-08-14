-- AlterTable
ALTER TABLE "v1_game_periods"
  ADD COLUMN "paused_total_ms" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "paused_at" TIMESTAMP(3);

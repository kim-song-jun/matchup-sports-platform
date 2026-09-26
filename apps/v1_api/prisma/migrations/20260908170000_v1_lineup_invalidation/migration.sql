ALTER TABLE "v1_game_lineups"
  ADD COLUMN "invalidated_at" TIMESTAMP(3),
  ADD COLUMN "invalidation_reason" TEXT;

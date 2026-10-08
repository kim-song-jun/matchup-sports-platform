-- Regular leagues can be put on hold (보류) instead of being cancelled: the league
-- and its fixtures are hidden from public reads, and an administrator can resume
-- it later. held_from_status / held_from_public remember what to restore.
ALTER TYPE "V1TournamentStatus" ADD VALUE IF NOT EXISTS 'on_hold';

ALTER TABLE "v1_tournaments"
  ADD COLUMN "held_from_status" "V1TournamentStatus",
  ADD COLUMN "held_from_public" BOOLEAN;

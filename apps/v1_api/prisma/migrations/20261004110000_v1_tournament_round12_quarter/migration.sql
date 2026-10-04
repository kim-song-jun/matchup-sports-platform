ALTER TYPE "V1TournamentGroupPhase" ADD VALUE IF NOT EXISTS 'round12';
ALTER TYPE "V1TournamentGroupPhase" ADD VALUE IF NOT EXISTS 'quarter';
ALTER TABLE "v1_tournament_group_teams" ADD COLUMN "is_bye" BOOLEAN NOT NULL DEFAULT false;

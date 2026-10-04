ALTER TYPE "V1TournamentGroupPhase" ADD VALUE IF NOT EXISTS 'round12' BEFORE 'semi';
ALTER TYPE "V1TournamentGroupPhase" ADD VALUE IF NOT EXISTS 'quarter' BEFORE 'semi';
ALTER TABLE "v1_tournament_group_teams" ADD COLUMN "is_bye" BOOLEAN NOT NULL DEFAULT false;

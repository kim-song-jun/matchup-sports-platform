ALTER TYPE "V1TournamentGroupPhase" ADD VALUE IF NOT EXISTS 'round64';
ALTER TYPE "V1TournamentGroupPhase" ADD VALUE IF NOT EXISTS 'round32';
ALTER TABLE "v1_tournaments" ADD COLUMN "bracket_draft" JSONB;
ALTER TABLE "v1_tournaments" ADD COLUMN "bracket_draft_revision" INTEGER NOT NULL DEFAULT 0;

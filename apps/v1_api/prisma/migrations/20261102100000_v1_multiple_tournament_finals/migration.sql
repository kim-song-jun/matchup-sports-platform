-- The existing enum remains for historical compatibility; track columns now accept named finals.
ALTER TYPE "V1TournamentFormat" ADD VALUE IF NOT EXISTS 'league_knockouts';
BEGIN;
ALTER TABLE "v1_tournaments" ADD COLUMN "multi_finals" JSONB,
  ADD COLUMN "multi_finals_revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "v1_tournament_groups" ALTER COLUMN "bracket_track" DROP DEFAULT;
ALTER TABLE "v1_tournament_groups" ALTER COLUMN "bracket_track" TYPE TEXT USING "bracket_track"::text;
ALTER TABLE "v1_tournament_groups" ALTER COLUMN "bracket_track" SET DEFAULT 'overall';
ALTER TABLE "v1_tournament_awards" ALTER COLUMN "bracket_track" DROP DEFAULT;
ALTER TABLE "v1_tournament_awards" ALTER COLUMN "bracket_track" TYPE TEXT USING "bracket_track"::text;
ALTER TABLE "v1_tournament_awards" ALTER COLUMN "bracket_track" SET DEFAULT 'overall';
ALTER TABLE "v1_tournament_award_sets" DROP CONSTRAINT "v1_tournament_award_sets_track_check";
ALTER TABLE "v1_tournament_award_sets" ALTER COLUMN "bracket_track" TYPE TEXT USING "bracket_track"::text;
ALTER TABLE "v1_tournament_award_sets" ADD CONSTRAINT "v1_tournament_award_sets_track_check"
  CHECK (length(trim("bracket_track")) > 0 AND "bracket_track" <> 'overall');
COMMIT;

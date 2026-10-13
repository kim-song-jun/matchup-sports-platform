BEGIN;

CREATE TYPE "V1TournamentBracketTrack" AS ENUM ('overall', 'upper', 'lower');

ALTER TABLE "v1_tournament_groups"
ADD COLUMN "bracket_track" "V1TournamentBracketTrack" NOT NULL DEFAULT 'overall';

ALTER TABLE "v1_tournament_awards"
ADD COLUMN "bracket_track" "V1TournamentBracketTrack" NOT NULL DEFAULT 'overall';

CREATE UNIQUE INDEX "v1_tournament_awards_tournament_id_bracket_track_award_type_key"
ON "v1_tournament_awards"("tournament_id", "bracket_track", "award_type");
DROP INDEX "v1_tournament_awards_tournament_id_award_type_key";

CREATE TABLE "v1_tournament_award_sets" (
  "id" TEXT NOT NULL,
  "tournament_id" TEXT NOT NULL,
  "bracket_track" "V1TournamentBracketTrack" NOT NULL,
  "prize_pool" INTEGER,
  "prize_summary" TEXT,
  "prize_breakdown" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_tournament_award_sets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "v1_tournament_award_sets_tournament_id_fkey"
    FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "v1_tournament_award_sets_track_check" CHECK ("bracket_track" IN ('upper', 'lower')),
  CONSTRAINT "v1_tournament_award_sets_prize_pool_check" CHECK ("prize_pool" IS NULL OR "prize_pool" >= 0)
);

CREATE UNIQUE INDEX "v1_tournament_award_sets_tournament_id_bracket_track_key"
ON "v1_tournament_award_sets"("tournament_id", "bracket_track");

COMMIT;

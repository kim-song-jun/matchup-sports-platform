-- Existing leagues remain unlimited; no historical roster or template count becomes a cap.
ALTER TABLE "v1_tournaments" ADD COLUMN "max_teams" INTEGER;

ALTER TABLE "v1_tournaments"
  ADD CONSTRAINT "v1_tournaments_max_teams_positive"
  CHECK ("max_teams" IS NULL OR "max_teams" > 0);

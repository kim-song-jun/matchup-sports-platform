ALTER TABLE "sport_teams"
ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "sport_teams_deleted_at_idx" ON "sport_teams"("deleted_at");

ALTER TABLE "v1_matches" ADD COLUMN "min_sport_level_id" TEXT;
ALTER TABLE "v1_matches" ADD COLUMN "max_sport_level_id" TEXT;

ALTER TABLE "v1_team_profiles" ADD COLUMN "min_sport_level_id" TEXT;
ALTER TABLE "v1_team_profiles" ADD COLUMN "max_sport_level_id" TEXT;

ALTER TABLE "v1_team_matches" ADD COLUMN "min_sport_level_id" TEXT;
ALTER TABLE "v1_team_matches" ADD COLUMN "max_sport_level_id" TEXT;

CREATE INDEX "v1_matches_min_sport_level_id_idx" ON "v1_matches"("min_sport_level_id");
CREATE INDEX "v1_matches_max_sport_level_id_idx" ON "v1_matches"("max_sport_level_id");
CREATE INDEX "v1_team_profiles_min_sport_level_id_idx" ON "v1_team_profiles"("min_sport_level_id");
CREATE INDEX "v1_team_profiles_max_sport_level_id_idx" ON "v1_team_profiles"("max_sport_level_id");
CREATE INDEX "v1_team_matches_min_sport_level_id_idx" ON "v1_team_matches"("min_sport_level_id");
CREATE INDEX "v1_team_matches_max_sport_level_id_idx" ON "v1_team_matches"("max_sport_level_id");

ALTER TABLE "v1_matches" ADD CONSTRAINT "v1_matches_min_sport_level_id_fkey" FOREIGN KEY ("min_sport_level_id") REFERENCES "v1_sport_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "v1_matches" ADD CONSTRAINT "v1_matches_max_sport_level_id_fkey" FOREIGN KEY ("max_sport_level_id") REFERENCES "v1_sport_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "v1_team_profiles" ADD CONSTRAINT "v1_team_profiles_min_sport_level_id_fkey" FOREIGN KEY ("min_sport_level_id") REFERENCES "v1_sport_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "v1_team_profiles" ADD CONSTRAINT "v1_team_profiles_max_sport_level_id_fkey" FOREIGN KEY ("max_sport_level_id") REFERENCES "v1_sport_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "v1_team_matches" ADD CONSTRAINT "v1_team_matches_min_sport_level_id_fkey" FOREIGN KEY ("min_sport_level_id") REFERENCES "v1_sport_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "v1_team_matches" ADD CONSTRAINT "v1_team_matches_max_sport_level_id_fkey" FOREIGN KEY ("max_sport_level_id") REFERENCES "v1_sport_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

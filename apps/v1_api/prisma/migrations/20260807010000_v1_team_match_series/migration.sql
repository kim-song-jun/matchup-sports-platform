-- T4 리그(시리즈): V1TeamMatchSeries + V1TeamMatchSeriesTeam + V1TeamMatch.series_id

CREATE TYPE "V1TeamMatchSeriesState" AS ENUM ('draft', 'active', 'completed');

CREATE TABLE "v1_team_match_series" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sport_id" TEXT NOT NULL,
  "region_id" TEXT NOT NULL,
  "created_by_admin_user_id" TEXT NOT NULL,
  "starts_on" TIMESTAMP(3) NOT NULL,
  "ends_on" TIMESTAMP(3) NOT NULL,
  "tie_break_json" JSONB NOT NULL,
  "state" "V1TeamMatchSeriesState" NOT NULL DEFAULT 'draft',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "v1_team_match_series_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "v1_team_match_series_sport_fk" FOREIGN KEY ("sport_id") REFERENCES "v1_sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "v1_team_match_series_region_fk" FOREIGN KEY ("region_id") REFERENCES "v1_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "v1_team_match_series_admin_fk" FOREIGN KEY ("created_by_admin_user_id") REFERENCES "v1_admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "v1_team_match_series_sport_id_state_idx" ON "v1_team_match_series"("sport_id", "state");

CREATE TABLE "v1_team_match_series_teams" (
  "id" TEXT NOT NULL,
  "series_id" TEXT NOT NULL,
  "team_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "v1_team_match_series_teams_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "v1_team_match_series_teams_series_team_key" UNIQUE ("series_id", "team_id"),
  CONSTRAINT "v1_team_match_series_teams_series_fk" FOREIGN KEY ("series_id") REFERENCES "v1_team_match_series"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "v1_team_match_series_teams_team_fk" FOREIGN KEY ("team_id") REFERENCES "v1_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "v1_team_match_series_teams_team_id_idx" ON "v1_team_match_series_teams"("team_id");

ALTER TABLE "v1_team_matches" ADD COLUMN "series_id" TEXT;

ALTER TABLE "v1_team_matches"
  ADD CONSTRAINT "v1_team_matches_series_fk" FOREIGN KEY ("series_id") REFERENCES "v1_team_match_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "v1_team_matches_series_start_at_idx" ON "v1_team_matches"("series_id", "start_at");

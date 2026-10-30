ALTER TABLE "v1_tournament_groups"
ADD COLUMN "periods" JSONB,
ADD COLUMN "competition_config_version_id" TEXT;

CREATE INDEX "v1_tournament_groups_competition_config_idx"
ON "v1_tournament_groups"("competition_config_version_id");

ALTER TABLE "v1_tournament_groups"
ADD CONSTRAINT "v1_tournament_groups_competition_config_fk"
FOREIGN KEY ("competition_config_version_id") REFERENCES "v1_competition_config_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "v1_team_matches"
ADD COLUMN "period_override" BOOLEAN NOT NULL DEFAULT false;

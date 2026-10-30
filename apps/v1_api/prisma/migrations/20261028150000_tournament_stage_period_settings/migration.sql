CREATE TABLE "v1_tournament_stage_period_settings" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "phase" "V1TournamentGroupPhase" NOT NULL,
    "periods" JSONB NOT NULL,
    "competition_config_version_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_tournament_stage_period_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "v1_tournament_stage_period_settings_tournament_phase_key"
ON "v1_tournament_stage_period_settings"("tournament_id", "phase");

CREATE INDEX "v1_tournament_stage_period_settings_config_idx"
ON "v1_tournament_stage_period_settings"("competition_config_version_id");

ALTER TABLE "v1_tournament_stage_period_settings"
ADD CONSTRAINT "v1_tournament_stage_period_settings_tournament_fk"
FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "v1_tournament_stage_period_settings"
ADD CONSTRAINT "v1_tournament_stage_period_settings_config_fk"
FOREIGN KEY ("competition_config_version_id") REFERENCES "v1_competition_config_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

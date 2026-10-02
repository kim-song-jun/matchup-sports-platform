CREATE TABLE "v1_team_match_records" (
  "game_id" TEXT NOT NULL PRIMARY KEY,
  "version" INTEGER NOT NULL DEFAULT 0,
  "goals" JSONB NOT NULL DEFAULT '[]',
  "confirmations" JSONB NOT NULL DEFAULT '[]',
  "official_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_team_match_records_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "v1_games"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "v1_team_match_record_changes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "game_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "command_id" TEXT NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "actor_name" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "goal_id" TEXT,
  "before" JSONB,
  "after" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "v1_team_match_record_changes_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "v1_team_match_records"("game_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "v1_team_match_record_changes_game_id_version_key" ON "v1_team_match_record_changes"("game_id", "version");
CREATE UNIQUE INDEX "v1_team_match_record_changes_game_id_command_id_key" ON "v1_team_match_record_changes"("game_id", "command_id");

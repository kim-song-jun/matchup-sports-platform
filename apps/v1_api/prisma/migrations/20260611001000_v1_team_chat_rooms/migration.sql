ALTER TABLE "v1_chat_rooms" ADD COLUMN "team_id" TEXT;

CREATE UNIQUE INDEX "v1_chat_rooms_team_id_key" ON "v1_chat_rooms"("team_id");

ALTER TABLE "v1_chat_rooms"
  ADD CONSTRAINT "v1_chat_rooms_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "v1_teams"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

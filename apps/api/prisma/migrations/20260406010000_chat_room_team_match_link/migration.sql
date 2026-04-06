-- Add teamMatchId to chat_rooms for team_match get-or-create linkage
ALTER TABLE "chat_rooms" ADD COLUMN "team_match_id" TEXT;
CREATE UNIQUE INDEX "chat_rooms_team_match_id_key" ON "chat_rooms"("team_match_id");
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_team_match_id_fkey"
  FOREIGN KEY ("team_match_id") REFERENCES "team_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migrate ChatRoomParticipant: replace @@unique with composite primary key
-- Drop existing unique constraint
ALTER TABLE "chat_room_participants" DROP CONSTRAINT IF EXISTS "chat_room_participants_room_id_user_id_key";

-- Add composite primary key
ALTER TABLE "chat_room_participants" ADD PRIMARY KEY ("room_id", "user_id");

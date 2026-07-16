CREATE TYPE "V1ChatMessageType" AS ENUM ('text', 'system');
CREATE TYPE "V1ChatSystemEventType" AS ENUM ('joined', 'left');

ALTER TABLE "v1_chat_room_participants"
ADD COLUMN "visible_from_at" TIMESTAMP(3);

UPDATE "v1_chat_room_participants"
SET "visible_from_at" = TIMESTAMP '1970-01-01 00:00:00'
WHERE "status" = 'active' AND "visible_from_at" IS NULL;

ALTER TABLE "v1_chat_messages"
ADD COLUMN "message_type" "V1ChatMessageType" NOT NULL DEFAULT 'text',
ADD COLUMN "system_event_type" "V1ChatSystemEventType";

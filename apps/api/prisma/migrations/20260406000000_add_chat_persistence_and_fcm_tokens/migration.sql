-- Add chat persistence models (ChatRoom, ChatRoomParticipant, ChatMessage)
-- and FCM token model (FcmToken). Drop legacy User.fcm_token single field.

-- CreateEnum
CREATE TYPE "ChatRoomType" AS ENUM ('team_match', 'direct', 'team');

-- CreateEnum
CREATE TYPE "ChatMessageType" AS ENUM ('text', 'system');

-- CreateEnum
CREATE TYPE "FcmPlatform" AS ENUM ('web', 'ios', 'android');

-- AlterTable: drop legacy single-field FCM token from users
ALTER TABLE "users" DROP COLUMN IF EXISTS "fcm_token";

-- CreateTable: chat_rooms
CREATE TABLE "chat_rooms" (
    "id" TEXT NOT NULL,
    "type" "ChatRoomType" NOT NULL,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable: chat_room_participants (join table)
CREATE TABLE "chat_room_participants" (
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_read_at" TIMESTAMP(3)
);

-- CreateTable: chat_messages
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "type" "ChatMessageType" NOT NULL DEFAULT 'text',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable: fcm_tokens
CREATE TABLE "fcm_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "FcmPlatform" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fcm_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: chat_rooms
CREATE INDEX "chat_rooms_last_message_at_idx" ON "chat_rooms"("last_message_at");

-- CreateIndex: chat_room_participants unique + lookup
CREATE UNIQUE INDEX "chat_room_participants_room_id_user_id_key" ON "chat_room_participants"("room_id", "user_id");
CREATE INDEX "chat_room_participants_user_id_idx" ON "chat_room_participants"("user_id");

-- CreateIndex: chat_messages
CREATE INDEX "chat_messages_room_id_created_at_idx" ON "chat_messages"("room_id", "created_at");

-- CreateIndex: fcm_tokens
CREATE UNIQUE INDEX "fcm_tokens_token_key" ON "fcm_tokens"("token");
CREATE INDEX "fcm_tokens_user_id_idx" ON "fcm_tokens"("user_id");

-- AddForeignKey: chat_room_participants -> chat_rooms
ALTER TABLE "chat_room_participants" ADD CONSTRAINT "chat_room_participants_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: chat_room_participants -> users
ALTER TABLE "chat_room_participants" ADD CONSTRAINT "chat_room_participants_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: chat_messages -> chat_rooms
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: chat_messages -> users (sender)
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_fkey"
    FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: fcm_tokens -> users
ALTER TABLE "fcm_tokens" ADD CONSTRAINT "fcm_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

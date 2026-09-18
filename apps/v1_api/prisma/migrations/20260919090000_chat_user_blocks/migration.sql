CREATE TABLE "v1_chat_user_blocks" (
  "blocker_user_id" TEXT NOT NULL REFERENCES "v1_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "blocked_user_id" TEXT NOT NULL REFERENCES "v1_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("blocker_user_id", "blocked_user_id"),
  CONSTRAINT "chat_user_block_not_self" CHECK ("blocker_user_id" <> "blocked_user_id")
);
CREATE INDEX "v1_chat_user_blocks_blocked_user_id_idx" ON "v1_chat_user_blocks"("blocked_user_id");

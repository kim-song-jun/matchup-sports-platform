-- Drop old FCM tokens table
DROP TABLE IF EXISTS "fcm_tokens";

-- Create Web Push subscriptions table
CREATE TABLE "push_subscriptions" (
    "id"          TEXT        NOT NULL,
    "user_id"     TEXT        NOT NULL,
    "endpoint"    TEXT        NOT NULL,
    "p256dh"      TEXT        NOT NULL,
    "auth"        TEXT        NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on endpoint (one subscription record per browser endpoint)
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- Index for efficient per-user lookups
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- Foreign key to users
ALTER TABLE "push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

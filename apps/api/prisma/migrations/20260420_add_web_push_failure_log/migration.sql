-- Migration: add web_push_failure_logs table
-- Task 76 Wave 0 — WebPushFailureLog schema for operational observability

CREATE TABLE "web_push_failure_logs" (
    "id"              TEXT NOT NULL,
    "user_id"         TEXT NOT NULL,
    "subscription_id" TEXT,
    "status_code"     INTEGER,
    "error_code"      TEXT,
    "endpoint_suffix" VARCHAR(6) NOT NULL CHECK (char_length("endpoint_suffix") = 6),
    "occurred_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by" TEXT,

    CONSTRAINT "web_push_failure_logs_pkey" PRIMARY KEY ("id")
);

-- Foreign key to users (cascade delete)
ALTER TABLE "web_push_failure_logs"
    ADD CONSTRAINT "web_push_failure_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "web_push_failure_logs_occurred_at_idx"     ON "web_push_failure_logs"("occurred_at");
CREATE INDEX "web_push_failure_logs_acknowledged_at_idx" ON "web_push_failure_logs"("acknowledged_at");
CREATE INDEX "web_push_failure_logs_user_id_idx"         ON "web_push_failure_logs"("user_id");

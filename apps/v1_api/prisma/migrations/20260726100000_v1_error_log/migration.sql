-- CreateTable
CREATE TABLE IF NOT EXISTS "v1_error_logs" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "window_bucket" TIMESTAMP(3) NOT NULL,
    "occurrence_count" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "status_code" INTEGER,
    "error_code" TEXT,
    "method" TEXT,
    "route" TEXT,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "request_body" JSONB,
    "request_headers" JSONB,
    "response_body" JSONB,
    "context" JSONB,
    "user_id" TEXT,
    "user_agent" TEXT,
    "release_sha" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v1_error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "v1_error_logs_fingerprint_window_bucket_key" ON "v1_error_logs"("fingerprint", "window_bucket");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "v1_error_logs_last_seen_at_idx" ON "v1_error_logs"("last_seen_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "v1_error_logs_source_status_code_idx" ON "v1_error_logs"("source", "status_code");

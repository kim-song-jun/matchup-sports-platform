-- CreateTable
CREATE TABLE IF NOT EXISTS "v1_sms_event_logs" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "result_code" TEXT,
    "phone_masked" TEXT NOT NULL,
    "provider" TEXT,
    "detail" TEXT,
    "acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v1_sms_event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "v1_sms_event_logs_created_at_idx" ON "v1_sms_event_logs"("created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "v1_sms_event_logs_acknowledged_at_idx" ON "v1_sms_event_logs"("acknowledged_at");

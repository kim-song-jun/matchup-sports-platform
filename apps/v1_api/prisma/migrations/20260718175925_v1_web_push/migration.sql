-- CreateTable
CREATE TABLE "v1_push_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v1_web_push_failure_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "status_code" INTEGER,
    "error_code" TEXT,
    "endpoint_suffix" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by" TEXT,

    CONSTRAINT "v1_web_push_failure_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "v1_push_subscriptions_endpoint_key" ON "v1_push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "v1_push_subscriptions_user_id_idx" ON "v1_push_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "v1_web_push_failure_logs_occurred_at_idx" ON "v1_web_push_failure_logs"("occurred_at");

-- CreateIndex
CREATE INDEX "v1_web_push_failure_logs_acknowledged_at_idx" ON "v1_web_push_failure_logs"("acknowledged_at");

-- CreateIndex
CREATE INDEX "v1_web_push_failure_logs_user_id_idx" ON "v1_web_push_failure_logs"("user_id");

-- AddForeignKey
ALTER TABLE "v1_push_subscriptions" ADD CONSTRAINT "v1_push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "v1_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

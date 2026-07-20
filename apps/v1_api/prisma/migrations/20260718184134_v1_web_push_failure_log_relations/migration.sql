-- CreateIndex
CREATE INDEX "v1_web_push_failure_logs_subscription_id_idx" ON "v1_web_push_failure_logs"("subscription_id");

-- AddForeignKey
ALTER TABLE "v1_web_push_failure_logs" ADD CONSTRAINT "v1_web_push_failure_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "v1_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_web_push_failure_logs" ADD CONSTRAINT "v1_web_push_failure_logs_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "v1_push_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_web_push_failure_logs" ADD CONSTRAINT "v1_web_push_failure_logs_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "v1_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

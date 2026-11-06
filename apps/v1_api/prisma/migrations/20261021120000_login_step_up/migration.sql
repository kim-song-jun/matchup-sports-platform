-- Additive only: three new tables and two enums. Old application versions never touch them.
-- CreateEnum
CREATE TYPE "V1LoginAttemptResult" AS ENUM ('success', 'failed', 'step_up_issued');

-- CreateEnum
CREATE TYPE "V1SecurityAnomalyKind" AS ENUM ('login_spray');

-- CreateTable
CREATE TABLE "v1_login_attempts" (
    "id" TEXT NOT NULL,
    "email_key" TEXT NOT NULL,
    "ip_key" TEXT,
    "result" "V1LoginAttemptResult" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v1_login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v1_login_step_up_challenges" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "email_key" TEXT NOT NULL,
    "user_id" TEXT,
    "code_hash" TEXT NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_sent_at" TIMESTAMP(3) NOT NULL,
    "send_failed_at" TIMESTAMP(3),
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v1_login_step_up_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v1_security_anomalies" (
    "id" TEXT NOT NULL,
    "kind" "V1SecurityAnomalyKind" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failed_count" INTEGER NOT NULL,
    "account_count" INTEGER NOT NULL,
    "ip_count" INTEGER NOT NULL,

    CONSTRAINT "v1_security_anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "v1_login_attempts_email_key_created_at_idx" ON "v1_login_attempts"("email_key", "created_at");

-- CreateIndex
CREATE INDEX "v1_login_attempts_created_at_result_idx" ON "v1_login_attempts"("created_at", "result");

-- CreateIndex
CREATE UNIQUE INDEX "v1_login_step_up_challenges_token_hash_key" ON "v1_login_step_up_challenges"("token_hash");

-- CreateIndex
CREATE INDEX "v1_login_step_up_challenges_email_key_last_sent_at_idx" ON "v1_login_step_up_challenges"("email_key", "last_sent_at");

-- CreateIndex
CREATE INDEX "v1_login_step_up_challenges_expires_at_idx" ON "v1_login_step_up_challenges"("expires_at");

-- CreateIndex
CREATE INDEX "v1_login_step_up_challenges_user_id_idx" ON "v1_login_step_up_challenges"("user_id");

-- CreateIndex
CREATE INDEX "v1_security_anomalies_kind_last_detected_at_idx" ON "v1_security_anomalies"("kind", "last_detected_at");

-- CreateIndex
CREATE INDEX "v1_security_anomalies_started_at_idx" ON "v1_security_anomalies"("started_at");

-- AddForeignKey
ALTER TABLE "v1_login_step_up_challenges" ADD CONSTRAINT "v1_login_step_up_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "v1_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


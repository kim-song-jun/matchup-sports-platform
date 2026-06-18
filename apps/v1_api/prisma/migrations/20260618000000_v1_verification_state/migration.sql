-- CreateEnum
CREATE TYPE "V1VerificationChannel" AS ENUM ('email', 'phone');

-- AlterTable
ALTER TABLE "v1_users" ADD COLUMN "email_verified_at" TIMESTAMP(3),
ADD COLUMN "phone_verified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "v1_verification_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "channel" "V1VerificationChannel" NOT NULL,
    "target" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v1_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "v1_verification_tokens_user_id_channel_idx" ON "v1_verification_tokens"("user_id", "channel");

-- AddForeignKey
ALTER TABLE "v1_verification_tokens" ADD CONSTRAINT "v1_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "v1_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

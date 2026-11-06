-- CreateEnum
CREATE TYPE "V1VerificationPurpose" AS ENUM ('contact', 'email_login_link');

-- AlterTable
ALTER TABLE "v1_verification_tokens" ADD COLUMN "purpose" "V1VerificationPurpose" NOT NULL DEFAULT 'contact';

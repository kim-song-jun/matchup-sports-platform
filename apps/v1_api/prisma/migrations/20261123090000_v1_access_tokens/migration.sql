-- CreateEnum
CREATE TYPE "V1AccessTokenKind" AS ENUM ('calendar_feed', 'widget');

-- CreateTable
CREATE TABLE "v1_access_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "V1AccessTokenKind" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "v1_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "v1_access_tokens_user_kind_idx" ON "v1_access_tokens"("user_id", "kind", "revoked_at");

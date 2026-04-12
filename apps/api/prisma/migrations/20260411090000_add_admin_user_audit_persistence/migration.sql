-- CreateEnum
CREATE TYPE "AdminUserStatus" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "AdminUserAuditAction" AS ENUM ('warn', 'suspend', 'reactivate');

-- AlterTable
ALTER TABLE "users"
ADD COLUMN "admin_status" "AdminUserStatus" NOT NULL DEFAULT 'active',
ADD COLUMN "admin_suspension_reason" TEXT;

-- CreateTable
CREATE TABLE "admin_user_audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_label" TEXT NOT NULL,
    "action" "AdminUserAuditAction" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_user_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_user_audit_logs_user_id_created_at_idx"
  ON "admin_user_audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_user_audit_logs_actor_id_idx"
  ON "admin_user_audit_logs"("actor_id");

-- AddForeignKey
ALTER TABLE "admin_user_audit_logs"
  ADD CONSTRAINT "admin_user_audit_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_audit_logs"
  ADD CONSTRAINT "admin_user_audit_logs_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

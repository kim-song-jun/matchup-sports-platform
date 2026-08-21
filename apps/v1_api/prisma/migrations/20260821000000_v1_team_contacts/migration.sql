-- CreateEnum
CREATE TYPE "V1TeamContactStatus" AS ENUM ('requested', 'accepted', 'declined', 'withdrawn', 'expired');

-- CreateEnum
CREATE TYPE "V1TeamContactPolicy" AS ENUM ('open', 'recruiting_only', 'closed');

-- AlterEnum
ALTER TYPE "V1InquiryRelatedType" ADD VALUE 'team_contact';

-- AlterTable
ALTER TABLE "v1_teams" ADD COLUMN     "contact_policy" "V1TeamContactPolicy" NOT NULL DEFAULT 'open';

-- AlterTable
ALTER TABLE "v1_chat_rooms" ADD COLUMN     "team_contact_id" TEXT;

-- CreateTable
CREATE TABLE "v1_team_contacts" (
    "id" TEXT NOT NULL,
    "from_team_id" TEXT NOT NULL,
    "to_team_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "V1TeamContactStatus" NOT NULL DEFAULT 'requested',
    "responded_by_user_id" TEXT,
    "responded_at" TIMESTAMP(3),
    "decline_reason" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_team_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v1_team_contact_blocks" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "blocked_team_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v1_team_contact_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "v1_team_contacts_from_team_id_to_team_id_status_idx" ON "v1_team_contacts"("from_team_id", "to_team_id", "status");

-- CreateIndex
CREATE INDEX "v1_team_contacts_to_team_id_status_idx" ON "v1_team_contacts"("to_team_id", "status");

-- CreateIndex
CREATE INDEX "v1_team_contacts_from_team_id_created_at_idx" ON "v1_team_contacts"("from_team_id", "created_at");

-- CreateIndex
CREATE INDEX "v1_team_contact_blocks_blocked_team_id_idx" ON "v1_team_contact_blocks"("blocked_team_id");

-- CreateIndex
CREATE UNIQUE INDEX "v1_team_contact_blocks_team_id_blocked_team_id_key" ON "v1_team_contact_blocks"("team_id", "blocked_team_id");

-- CreateIndex
CREATE UNIQUE INDEX "v1_chat_rooms_team_contact_id_key" ON "v1_chat_rooms"("team_contact_id");

-- AddForeignKey
ALTER TABLE "v1_team_contacts" ADD CONSTRAINT "v1_team_contacts_from_team_id_fkey" FOREIGN KEY ("from_team_id") REFERENCES "v1_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_team_contacts" ADD CONSTRAINT "v1_team_contacts_to_team_id_fkey" FOREIGN KEY ("to_team_id") REFERENCES "v1_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_team_contacts" ADD CONSTRAINT "v1_team_contacts_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "v1_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_team_contacts" ADD CONSTRAINT "v1_team_contacts_responded_by_user_id_fkey" FOREIGN KEY ("responded_by_user_id") REFERENCES "v1_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_team_contact_blocks" ADD CONSTRAINT "v1_team_contact_blocks_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "v1_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_team_contact_blocks" ADD CONSTRAINT "v1_team_contact_blocks_blocked_team_id_fkey" FOREIGN KEY ("blocked_team_id") REFERENCES "v1_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_team_contact_blocks" ADD CONSTRAINT "v1_team_contact_blocks_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "v1_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_chat_rooms" ADD CONSTRAINT "v1_chat_rooms_team_contact_id_fkey" FOREIGN KEY ("team_contact_id") REFERENCES "v1_team_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;


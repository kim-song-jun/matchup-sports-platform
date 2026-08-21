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


-- v1_chat_rooms 의 "링크 대상은 정확히 하나" CHECK 제약에 team_contact_id 를 편입한다.
-- 이 제약은 raw SQL 이라 schema.prisma 에 나타나지 않는다 — 컬럼만 추가하고 제약을 그대로 두면
-- team_contact_id 만 채운 행이 "0개 채움"으로 판정돼 23514 로 거부된다(CI 통합테스트가 잡은 실제 500).
-- team_id 를 추가했을 때의 선례(20260630000000_v1_chat_room_team_target_constraint)와 같은 방식이다.
ALTER TABLE "v1_chat_rooms"
  DROP CONSTRAINT IF EXISTS "v1_chat_rooms_exactly_one_target_check";

ALTER TABLE "v1_chat_rooms"
  ADD CONSTRAINT "v1_chat_rooms_exactly_one_target_check"
  CHECK (
    (
      ("match_id" IS NOT NULL)::int
      + ("team_id" IS NOT NULL)::int
      + ("team_match_id" IS NOT NULL)::int
      + ("team_contact_id" IS NOT NULL)::int
    ) = 1
  );

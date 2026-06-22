-- CreateEnum
CREATE TYPE "V1TeamInvitationStatus" AS ENUM ('pending', 'accepted', 'declined', 'cancelled');

-- CreateTable
CREATE TABLE "v1_team_invitations" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "invited_user_id" TEXT NOT NULL,
    "invited_by_user_id" TEXT NOT NULL,
    "status" "V1TeamInvitationStatus" NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_team_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "v1_team_invitations_invited_user_id_status_idx" ON "v1_team_invitations"("invited_user_id", "status");

-- CreateIndex
CREATE INDEX "v1_team_invitations_team_id_status_idx" ON "v1_team_invitations"("team_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "v1_team_invitations_team_id_invited_user_id_key" ON "v1_team_invitations"("team_id", "invited_user_id");

-- AddForeignKey
ALTER TABLE "v1_team_invitations" ADD CONSTRAINT "v1_team_invitations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "v1_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_team_invitations" ADD CONSTRAINT "v1_team_invitations_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "v1_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_team_invitations" ADD CONSTRAINT "v1_team_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "v1_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "V1LeagueMatchDisputeStatus" AS ENUM ('open', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "V1LeagueMatchDisputeResolution" AS ENUM ('correction', 'void');

-- CreateTable
CREATE TABLE "v1_league_match_disputes" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "team_match_id" TEXT NOT NULL,
    "result_revision_id" TEXT NOT NULL,
    "raised_by_user_id" TEXT NOT NULL,
    "raised_by_team_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "V1LeagueMatchDisputeStatus" NOT NULL DEFAULT 'open',
    "resolution" "V1LeagueMatchDisputeResolution",
    "resolution_note" TEXT,
    "resolved_by_admin_user_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_league_match_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "v1_league_match_disputes_league_id_status_idx" ON "v1_league_match_disputes"("league_id", "status");

-- CreateIndex
CREATE INDEX "v1_league_match_disputes_team_match_id_status_idx" ON "v1_league_match_disputes"("team_match_id", "status");

-- CreateIndex
CREATE INDEX "v1_league_match_disputes_status_created_at_idx" ON "v1_league_match_disputes"("status", "created_at");


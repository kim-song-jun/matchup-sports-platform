-- CreateEnum: TeamMatchApplicationStatus (converts TeamMatchApplication.status from bare String)
CREATE TYPE "TeamMatchApplicationStatus" AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');

-- AlterTable: safe String → enum cast (preserve existing data, no DROP COLUMN)
ALTER TABLE "team_match_applications" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "team_match_applications"
  ALTER COLUMN "status" TYPE "TeamMatchApplicationStatus"
  USING "status"::"TeamMatchApplicationStatus";
ALTER TABLE "team_match_applications" ALTER COLUMN "status" SET DEFAULT 'pending';

-- CreateIndex: listings status+sportType composite (marketplace filter path)
CREATE INDEX "marketplace_listings_status_sport_type_idx" ON "marketplace_listings"("status", "sport_type");

-- CreateIndex: matches status+matchDate composite (recruiting matches by date)
CREATE INDEX "matches_status_match_date_idx" ON "matches"("status", "match_date");

-- CreateIndex: payments userId+status composite (user payment history filter)
CREATE INDEX "payments_user_id_status_idx" ON "payments"("user_id", "status");

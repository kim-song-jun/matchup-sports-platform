-- Additive only: team slots for the admin bracket canvas plus the round16 group phase.
-- A new enum, the v1_tournament_slots table, two nullable v1_team_matches columns that point at it,
-- and their indexes and foreign keys. No existing row is read, written, or backfilled.
-- The round16 value is added and never referenced in this file: Postgres cannot use a new enum
-- value inside the transaction that added it.

-- AlterEnum
ALTER TYPE "V1TournamentGroupPhase" ADD VALUE IF NOT EXISTS 'round16' BEFORE 'round12';

-- CreateEnum
CREATE TYPE "V1TournamentSlotKind" AS ENUM ('ENTRY', 'BYE', 'GROUP_RANK');

-- AlterTable
ALTER TABLE "v1_team_matches" ADD COLUMN     "away_slot_id" TEXT,
ADD COLUMN     "home_slot_id" TEXT;

-- CreateTable
CREATE TABLE "v1_tournament_slots" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "kind" "V1TournamentSlotKind" NOT NULL DEFAULT 'ENTRY',
    "group_id" TEXT,
    "position" INTEGER NOT NULL,
    "source_group_id" TEXT,
    "registration_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_tournament_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "v1_tournament_slots_tournament_id_group_id_idx" ON "v1_tournament_slots"("tournament_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "v1_tournament_slots_tournament_id_kind_registration_id_key" ON "v1_tournament_slots"("tournament_id", "kind", "registration_id");

-- CreateIndex
CREATE INDEX "v1_team_matches_home_slot_id_idx" ON "v1_team_matches"("home_slot_id");

-- CreateIndex
CREATE INDEX "v1_team_matches_away_slot_id_idx" ON "v1_team_matches"("away_slot_id");

-- AddForeignKey
ALTER TABLE "v1_team_matches" ADD CONSTRAINT "v1_team_matches_home_slot_id_fkey" FOREIGN KEY ("home_slot_id") REFERENCES "v1_tournament_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_team_matches" ADD CONSTRAINT "v1_team_matches_away_slot_id_fkey" FOREIGN KEY ("away_slot_id") REFERENCES "v1_tournament_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_tournament_slots" ADD CONSTRAINT "v1_tournament_slots_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_tournament_slots" ADD CONSTRAINT "v1_tournament_slots_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "v1_tournament_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_tournament_slots" ADD CONSTRAINT "v1_tournament_slots_source_group_id_fkey" FOREIGN KEY ("source_group_id") REFERENCES "v1_tournament_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_tournament_slots" ADD CONSTRAINT "v1_tournament_slots_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "v1_tournament_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

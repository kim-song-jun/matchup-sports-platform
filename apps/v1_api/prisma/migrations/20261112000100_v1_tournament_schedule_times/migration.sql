CREATE TABLE "v1_tournament_schedule_times" (
  "id" TEXT NOT NULL,
  "tournament_id" TEXT NOT NULL,
  "scheduled_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "v1_tournament_schedule_times_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "v1_tournament_schedule_times_tournament_id_scheduled_at_key"
  ON "v1_tournament_schedule_times"("tournament_id", "scheduled_at");
ALTER TABLE "v1_tournament_schedule_times"
  ADD CONSTRAINT "v1_tournament_schedule_times_tournament_id_fkey"
  FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

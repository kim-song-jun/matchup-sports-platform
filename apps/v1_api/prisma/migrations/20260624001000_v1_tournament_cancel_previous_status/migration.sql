ALTER TABLE "v1_tournament_registrations"
  ADD COLUMN IF NOT EXISTS "cancel_previous_status" "V1TournamentRegistrationStatus";

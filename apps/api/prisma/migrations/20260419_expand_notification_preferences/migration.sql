-- Add granular notification preference columns to notification_preferences table.
-- All columns default TRUE (opt-out model) so existing rows automatically get
-- all-enabled behaviour without a data backfill step.

ALTER TABLE "notification_preferences"
  ADD COLUMN "team_application_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "match_completed_enabled"  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "elo_changed_enabled"      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "chat_message_enabled"     BOOLEAN NOT NULL DEFAULT TRUE;

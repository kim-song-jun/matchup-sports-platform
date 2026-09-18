-- Link tournament award snapshots to the account selected from the confirmed roster.
ALTER TABLE "v1_tournament_awards"
ADD COLUMN "recipient_user_id" TEXT;

CREATE INDEX "v1_tournament_awards_recipient_user_id_created_at_idx"
ON "v1_tournament_awards"("recipient_user_id", "created_at");

ALTER TABLE "v1_tournament_awards"
ADD CONSTRAINT "v1_tournament_awards_recipient_user_id_fkey"
FOREIGN KEY ("recipient_user_id") REFERENCES "v1_users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

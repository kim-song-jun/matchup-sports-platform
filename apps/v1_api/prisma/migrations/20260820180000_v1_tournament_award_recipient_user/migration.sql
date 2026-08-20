-- Link tournament award snapshots to the account selected from the confirmed roster.
ALTER TABLE "v1_tournament_awards"
ADD COLUMN "recipient_user_id" TEXT;

-- Backfill only unambiguous historical rows. Team-scoped rows must match the
-- same confirmed team; rows without a team are linked only when exactly one
-- active roster user in the tournament has that real-name snapshot.
WITH candidates AS (
  SELECT
    award."id" AS "award_id",
    MIN(player."user_id") AS "user_id",
    COUNT(DISTINCT player."user_id") AS "candidate_count"
  FROM "v1_tournament_awards" award
  JOIN "v1_tournament_registrations" registration
    ON registration."tournament_id" = award."tournament_id"
   AND registration."status" = 'confirmed'
  JOIN "v1_teams" team
    ON team."id" = registration."team_id"
  JOIN "v1_tournament_players" player
    ON player."registration_id" = registration."id"
   AND player."removed_at" IS NULL
   AND BTRIM(player."real_name") = BTRIM(award."recipient_name")
  WHERE award."team_name" IS NULL
     OR BTRIM(team."name") = BTRIM(award."team_name")
  GROUP BY award."id"
)
UPDATE "v1_tournament_awards" award
SET "recipient_user_id" = candidates."user_id"
FROM candidates
WHERE award."id" = candidates."award_id"
  AND candidates."candidate_count" = 1;

CREATE INDEX "v1_tournament_awards_recipient_user_id_created_at_idx"
ON "v1_tournament_awards"("recipient_user_id", "created_at");

ALTER TABLE "v1_tournament_awards"
ADD CONSTRAINT "v1_tournament_awards_recipient_user_id_fkey"
FOREIGN KEY ("recipient_user_id") REFERENCES "v1_users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

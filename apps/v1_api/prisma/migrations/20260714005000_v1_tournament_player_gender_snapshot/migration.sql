ALTER TABLE "v1_tournament_players"
ADD COLUMN "gender_snapshot" TEXT;

UPDATE "v1_tournament_players" AS player
SET "gender_snapshot" = profile."gender"
FROM "v1_user_profiles" AS profile
WHERE profile."user_id" = player."user_id"
  AND profile."gender" IN ('male', 'female')
  AND player."gender_snapshot" IS NULL;

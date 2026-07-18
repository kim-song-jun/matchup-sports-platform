ALTER TABLE "v1_user_profiles"
ADD COLUMN "real_name" TEXT;

-- Preserve every non-blank legacy name, including names equal to nickname.
UPDATE "v1_user_profiles"
SET "real_name" = NULLIF(BTRIM("display_name"), '')
WHERE "real_name" IS NULL
  AND NULLIF(BTRIM("display_name"), '') IS NOT NULL;

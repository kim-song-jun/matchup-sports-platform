-- Preserve the existing detail image and initialize the independent list image.
ALTER TABLE "v1_tournaments" ADD COLUMN "list_image_url" TEXT;
UPDATE "v1_tournaments"
SET "list_image_url" = "cover_image_url"
WHERE "kind" = 'regular_league' AND "cover_image_url" IS NOT NULL;

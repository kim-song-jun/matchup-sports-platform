ALTER TABLE "matches"
ADD COLUMN "image_url" TEXT;

ALTER TABLE "sport_teams"
ADD COLUMN "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "v1_tournament_reviews"
ADD COLUMN "photo_urls" TEXT[] NOT NULL DEFAULT '{}';

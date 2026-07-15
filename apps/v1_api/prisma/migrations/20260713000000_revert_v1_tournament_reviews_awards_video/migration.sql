-- Reverts the schema added by PR #31 (tournament reviews / awards / fixture
-- videos / cover image), which was reverted at the application layer in the
-- previous commit. Historical migration files below are intentionally kept,
-- not deleted, per Prisma convention for already-applied migrations:
--   20260711090000_v1_tournament_cover_image
--   20260711170000_v1_tournament_reviews_and_awards
--   20260711180000_v1_tournament_review_photos
--   20260711200000_v1_fixture_videos

DROP TABLE IF EXISTS "v1_tournament_fixture_videos";
DROP TABLE IF EXISTS "v1_tournament_reviews";
DROP TABLE IF EXISTS "v1_tournament_awards";
ALTER TABLE "v1_tournaments" DROP COLUMN IF EXISTS "cover_image_url";

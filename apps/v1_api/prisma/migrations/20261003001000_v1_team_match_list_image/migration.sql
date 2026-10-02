-- Existing image_url remains the detail image and the shared fallback for old records.
-- Nullable extension: existing matches require no destructive rewrite or image backfill.
ALTER TABLE "v1_team_matches" ADD COLUMN "list_image_url" TEXT;

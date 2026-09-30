-- Existing rows remain NULL: no new restriction on old applications or peer reviews.
-- The API derives this key from match id + target kind + target id, never from client input.
ALTER TABLE "v1_post_event_reviews" ADD COLUMN "platform_review_key" TEXT;
CREATE UNIQUE INDEX "v1_post_event_reviews_platform_review_key_key"
ON "v1_post_event_reviews" ("platform_review_key");

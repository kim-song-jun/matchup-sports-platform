-- AddUniqueConstraint: prevent duplicate reviews for the same (match, author, target) triple
--
-- SAFETY: We intentionally do NOT delete duplicates here.
-- If duplicates exist, the CREATE UNIQUE INDEX will fail loudly with an explicit error,
-- making the problem visible rather than silently destroying data.
-- On a fresh dev DB (seed-only) there are never duplicates, so this is safe to apply.
-- IF NOT EXISTS is used so that re-applying on a DB where the index already exists is a no-op.

CREATE UNIQUE INDEX IF NOT EXISTS "reviews_match_id_author_id_target_id_key"
  ON "reviews"(match_id, author_id, target_id);

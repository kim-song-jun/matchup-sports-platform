-- Existing tournaments remain publicly visible by default. Administrators can
-- later hide regular leagues without changing their lifecycle or match data.
ALTER TABLE "v1_tournaments"
  ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT TRUE;

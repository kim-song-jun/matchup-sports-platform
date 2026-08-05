ALTER TABLE "v1_popups"
ADD COLUMN "target_paths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "v1_popups_target_paths_idx"
ON "v1_popups" USING GIN ("target_paths");

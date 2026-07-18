ALTER TABLE "v1_popups"
ADD COLUMN "target_screens" TEXT[] NOT NULL DEFAULT ARRAY['home']::TEXT[],
ADD COLUMN "link_url" TEXT,
ADD COLUMN "link_label" TEXT;

CREATE INDEX "v1_popups_target_screens_idx"
ON "v1_popups" USING GIN ("target_screens");

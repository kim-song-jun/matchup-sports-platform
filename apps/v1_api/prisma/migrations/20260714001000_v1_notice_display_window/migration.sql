ALTER TABLE "v1_notices"
ADD COLUMN "display_start_at" TIMESTAMP(3),
ADD COLUMN "display_end_at" TIMESTAMP(3);

CREATE INDEX "v1_notices_popup_display_window_idx"
ON "v1_notices"("category", "status", "display_start_at", "display_end_at");

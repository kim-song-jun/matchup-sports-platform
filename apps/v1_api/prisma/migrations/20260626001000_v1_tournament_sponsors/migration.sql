CREATE TABLE "v1_tournament_sponsors" (
  "id" TEXT NOT NULL,
  "tournament_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "logo_url" TEXT,
  "website_url" TEXT,
  "instagram_url" TEXT,
  "benefit_text" TEXT,
  "booth_text" TEXT,
  "event_title" TEXT,
  "event_description" TEXT,
  "event_result_text" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "v1_tournament_sponsors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "v1_tournament_sponsors_tournament_id_is_active_sort_order_idx"
  ON "v1_tournament_sponsors"("tournament_id", "is_active", "sort_order");

ALTER TABLE "v1_tournament_sponsors"
  ADD CONSTRAINT "v1_tournament_sponsors_tournament_id_fkey"
  FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

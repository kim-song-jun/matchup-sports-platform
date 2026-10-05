-- Add unassigned bye slots without relaxing existing group-team registration invariants.
CREATE TABLE "v1_tournament_bye_slots" (
  "id" TEXT NOT NULL,
  "group_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "v1_tournament_bye_slots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "v1_tournament_bye_slots_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "v1_tournament_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "v1_tournament_bye_slots_group_id_sort_order_key" ON "v1_tournament_bye_slots"("group_id", "sort_order");

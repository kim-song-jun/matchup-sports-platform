-- RenameColumn
-- last_used_at was semantically mislabeled (it tracked Prisma's @updatedAt
-- on any field change, not actual push-send usage) — renamed to match reality.
ALTER TABLE "v1_push_subscriptions" RENAME COLUMN "last_used_at" TO "updated_at";

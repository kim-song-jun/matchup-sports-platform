CREATE TABLE "v1_popups" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "audience" "V1NoticeAudience" NOT NULL DEFAULT 'public',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "V1NoticeStatus" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "display_start_at" TIMESTAMP(3),
    "display_end_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_popups_pkey" PRIMARY KEY ("id")
);

INSERT INTO "v1_popups" (
    "id",
    "audience",
    "title",
    "body",
    "status",
    "published_at",
    "archived_at",
    "display_start_at",
    "display_end_at",
    "created_at",
    "updated_at"
)
SELECT
    "id", "audience", "title", "body", "status", "published_at", "archived_at",
    "display_start_at", "display_end_at", "created_at", "updated_at"
FROM "v1_notices"
WHERE "category" = '고정';

DELETE FROM "v1_notices" WHERE "category" = '고정';

CREATE INDEX "v1_popups_active_window_idx" ON "v1_popups"("audience", "status", "display_start_at", "display_end_at", "published_at");
CREATE INDEX "v1_popups_created_at_idx" ON "v1_popups"("created_at");
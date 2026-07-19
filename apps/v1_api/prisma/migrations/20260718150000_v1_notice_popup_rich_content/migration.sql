CREATE TYPE "V1ContentAssetStatus" AS ENUM ('temporary', 'attached');

ALTER TABLE "v1_notices"
  ADD COLUMN "content_json" JSONB,
  ADD COLUMN "content_version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "v1_popups"
  ADD COLUMN "content_json" JSONB,
  ADD COLUMN "content_version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "v1_content_assets" (
  "id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "status" "V1ContentAssetStatus" NOT NULL DEFAULT 'temporary',
  "uploaded_by_admin_user_id" TEXT NOT NULL,
  "notice_id" TEXT,
  "popup_id" TEXT,
  "attached_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_content_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "v1_content_assets_single_owner_check" CHECK (NOT ("notice_id" IS NOT NULL AND "popup_id" IS NOT NULL))
);

CREATE UNIQUE INDEX "v1_content_assets_url_key" ON "v1_content_assets"("url");
CREATE UNIQUE INDEX "v1_content_assets_storage_path_key" ON "v1_content_assets"("storage_path");
CREATE INDEX "v1_content_assets_status_created_at_idx" ON "v1_content_assets"("status", "created_at");
CREATE INDEX "v1_content_assets_uploaded_by_admin_user_id_created_at_idx" ON "v1_content_assets"("uploaded_by_admin_user_id", "created_at");
CREATE INDEX "v1_content_assets_notice_id_idx" ON "v1_content_assets"("notice_id");
CREATE INDEX "v1_content_assets_popup_id_idx" ON "v1_content_assets"("popup_id");

ALTER TABLE "v1_content_assets"
  ADD CONSTRAINT "v1_content_assets_uploaded_by_admin_user_id_fkey"
  FOREIGN KEY ("uploaded_by_admin_user_id") REFERENCES "v1_admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "v1_content_assets"
  ADD CONSTRAINT "v1_content_assets_notice_id_fkey"
  FOREIGN KEY ("notice_id") REFERENCES "v1_notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "v1_content_assets"
  ADD CONSTRAINT "v1_content_assets_popup_id_fkey"
  FOREIGN KEY ("popup_id") REFERENCES "v1_popups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

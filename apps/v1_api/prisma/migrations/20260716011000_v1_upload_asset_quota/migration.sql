CREATE TYPE "V1UploadKind" AS ENUM ('image', 'video');

CREATE TABLE "v1_upload_assets" (
  "id" TEXT NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "kind" "V1UploadKind" NOT NULL,
  "mime_type" TEXT NOT NULL,
  "byte_size" BIGINT NOT NULL,
  "url" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "v1_upload_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "v1_upload_assets_byte_size_positive" CHECK ("byte_size" > 0),
  CONSTRAINT "v1_upload_assets_url_root_relative" CHECK ("url" LIKE '/uploads/%'),
  CONSTRAINT "v1_upload_assets_storage_path_relative" CHECK (
    "storage_path" NOT LIKE '/%'
    AND "storage_path" NOT LIKE '%..%'
  )
);

CREATE UNIQUE INDEX "v1_upload_assets_url_key" ON "v1_upload_assets"("url");
CREATE UNIQUE INDEX "v1_upload_assets_storage_path_key" ON "v1_upload_assets"("storage_path");
CREATE INDEX "v1_upload_assets_owner_user_id_created_at_idx"
  ON "v1_upload_assets"("owner_user_id", "created_at");
CREATE INDEX "v1_upload_assets_owner_user_id_kind_created_at_idx"
  ON "v1_upload_assets"("owner_user_id", "kind", "created_at");

ALTER TABLE "v1_upload_assets"
  ADD CONSTRAINT "v1_upload_assets_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "v1_users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "v1_inquiry_replies" (
    "id" TEXT NOT NULL,
    "inquiry_id" TEXT NOT NULL,
    "admin_user_id" TEXT,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_inquiry_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "v1_inquiry_replies_inquiry_id_created_at_idx" ON "v1_inquiry_replies"("inquiry_id", "created_at");

-- CreateIndex
CREATE INDEX "v1_inquiry_replies_admin_user_id_idx" ON "v1_inquiry_replies"("admin_user_id");

-- AddForeignKey
ALTER TABLE "v1_inquiry_replies" ADD CONSTRAINT "v1_inquiry_replies_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "v1_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_inquiry_replies" ADD CONSTRAINT "v1_inquiry_replies_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "v1_admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

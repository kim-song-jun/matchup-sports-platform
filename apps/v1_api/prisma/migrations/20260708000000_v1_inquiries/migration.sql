-- CreateEnum
CREATE TYPE "V1InquiryCategory" AS ENUM ('account', 'match', 'team', 'tournament', 'payment_refund', 'report', 'other');

-- CreateEnum
CREATE TYPE "V1InquiryStatus" AS ENUM ('received', 'reviewing', 'answered', 'closed');

-- CreateEnum
CREATE TYPE "V1InquiryRelatedType" AS ENUM ('match', 'team', 'team_match', 'tournament', 'registration', 'payment', 'user');

-- CreateTable
CREATE TABLE "v1_inquiries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category" "V1InquiryCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "contact" TEXT,
    "related_type" "V1InquiryRelatedType",
    "related_id" TEXT,
    "status" "V1InquiryStatus" NOT NULL DEFAULT 'received',
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "v1_inquiries_user_id_status_created_at_idx" ON "v1_inquiries"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "v1_inquiries_category_status_created_at_idx" ON "v1_inquiries"("category", "status", "created_at");

-- CreateIndex
CREATE INDEX "v1_inquiries_related_type_related_id_idx" ON "v1_inquiries"("related_type", "related_id");

-- AddForeignKey
ALTER TABLE "v1_inquiries" ADD CONSTRAINT "v1_inquiries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "v1_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

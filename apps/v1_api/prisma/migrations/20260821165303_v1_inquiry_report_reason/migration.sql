-- CreateEnum
CREATE TYPE "V1InquiryReportReason" AS ENUM ('spam', 'harassment', 'impersonation', 'inappropriate', 'other');

-- AlterTable
ALTER TABLE "v1_inquiries" ADD COLUMN     "report_reason" "V1InquiryReportReason";

-- CreateIndex
CREATE INDEX "v1_inquiries_report_reason_created_at_idx" ON "v1_inquiries"("report_reason", "created_at");


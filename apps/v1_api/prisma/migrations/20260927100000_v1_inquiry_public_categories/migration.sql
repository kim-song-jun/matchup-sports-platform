-- 비회원 공개 문의(POST /public/inquiries)가 받는 두 분류. 회원 문의 폼에는 노출하지 않는다.
-- 선례: 20260726000000_v1_notification_inquiry_target (같은 방식의 enum 값 추가)
ALTER TYPE "V1InquiryCategory" ADD VALUE IF NOT EXISTS 'tournament_hosting';
ALTER TYPE "V1InquiryCategory" ADD VALUE IF NOT EXISTS 'partnership';

-- 비회원 문의 개인정보 파기: 제출 때 동의한 보관 일수 + 파기 기록(어드민 수동 파기). 처리자는 FK 없는 참조 문자열이다.
ALTER TABLE "v1_inquiries" ADD COLUMN IF NOT EXISTS "guest_retention_days" INTEGER;
ALTER TABLE "v1_inquiries" ADD COLUMN IF NOT EXISTS "purged_at" TIMESTAMP(3);
ALTER TABLE "v1_inquiries" ADD COLUMN IF NOT EXISTS "purged_by_admin_user_id" TEXT;

-- 비회원 공개 문의(POST /public/inquiries)가 받는 두 분류. 회원 문의 폼에는 노출하지 않는다.
-- 선례: 20260726000000_v1_notification_inquiry_target (같은 방식의 enum 값 추가)
ALTER TYPE "V1InquiryCategory" ADD VALUE IF NOT EXISTS 'tournament_hosting';
ALTER TYPE "V1InquiryCategory" ADD VALUE IF NOT EXISTS 'partnership';

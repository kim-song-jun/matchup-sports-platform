-- 비회원(guest) 문의 지원: 대회 상세 "문의하기" CTA에서 비로그인 방문자도 문의를 남길 수
-- 있도록 v1_inquiries.user_id를 nullable로 완화하고, 비회원 연락처(이메일/전화번호) 컬럼을
-- 추가한다. 서비스 계층에서 userId 또는 (guestEmail/guestPhone) 중 최소 하나를 강제한다.
-- 멱등: user_id는 이미 nullable이면 DROP NOT NULL이 no-op이고, 신규 컬럼은 IF NOT EXISTS 가드.

ALTER TABLE "v1_inquiries" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "v1_inquiries" ADD COLUMN IF NOT EXISTS "guest_email" TEXT;
ALTER TABLE "v1_inquiries" ADD COLUMN IF NOT EXISTS "guest_phone" TEXT;

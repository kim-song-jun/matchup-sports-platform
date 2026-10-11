-- 참가 신청 취소 처리 결과(승인/거부)와 어드민 사유를 팀의 취소 사유와 따로 남긴다. 추가만 하는 expand 단계라 기존 행은 null 로 남는다.
CREATE TYPE "V1RegistrationCancelOutcome" AS ENUM ('approved', 'rejected');

ALTER TABLE "v1_tournament_registrations" ADD COLUMN IF NOT EXISTS "admin_cancel_reason" TEXT;
ALTER TABLE "v1_tournament_registrations" ADD COLUMN IF NOT EXISTS "cancel_outcome" "V1RegistrationCancelOutcome";

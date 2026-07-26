-- 옥토모 MO(평문 code + channel) → MT SMS OTP(codeHash) 전환.
-- v1_phone_verification_challenges 는 5분 TTL ephemeral 이므로 기존 row 를 제거한 뒤
-- 컬럼을 교체한다(운영 데이터 손실 없음 — 진행 중 인증은 재요청으로 복구).
DELETE FROM "v1_phone_verification_challenges";

ALTER TABLE "v1_phone_verification_challenges" DROP COLUMN "code";
ALTER TABLE "v1_phone_verification_challenges" DROP COLUMN "channel";
ALTER TABLE "v1_phone_verification_challenges" ADD COLUMN "code_hash" TEXT NOT NULL;

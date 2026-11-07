-- 계정 이메일 변경(/me/email-change/*)이 보내는 인증번호의 목적. 다른 흐름의 코드와 서로 통하지 않는다.
-- 선례: 20261011130000_v1_onboarding_social_profile_deferred (같은 방식의 enum 값 추가)
ALTER TYPE "V1VerificationPurpose" ADD VALUE IF NOT EXISTS 'email_change';

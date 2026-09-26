-- Sign in with Apple refresh token (sealed), kept only so account withdrawal can revoke it
-- (App Store Review Guideline 5.1.1(v)). Additive and nullable.
ALTER TABLE "v1_auth_identities" ADD COLUMN IF NOT EXISTS "provider_refresh_token_ciphertext" TEXT;

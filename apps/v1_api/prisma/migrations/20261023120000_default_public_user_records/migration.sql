-- Product default, not a claim of explicit user consent. Only initialize missing
-- preferences for usable accounts; never overwrite GRANTED or REVOKED history.
-- Pending social signups are initialized by the signup completion transaction.
INSERT INTO "v1_user_record_consents" (
  "user_id", "state", "effective_at", "policy_hash", "created_at", "updated_at"
)
SELECT
  u."id", 'GRANTED'::"V1ConsentState", CURRENT_TIMESTAMP,
  'v1-public-record-default-2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "v1_users" u
WHERE u."account_status" = 'active'
  AND u."deleted_at" IS NULL
  AND u."onboarding_status" IN (
    'signup_done', 'sport_done', 'level_done', 'region_done',
    'completed', 'deferred', 'social_profile_deferred'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "v1_user_record_consents" c WHERE c."user_id" = u."id"
  )
ON CONFLICT ("user_id") DO NOTHING;

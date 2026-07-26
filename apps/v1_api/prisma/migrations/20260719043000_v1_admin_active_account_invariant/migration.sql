BEGIN;

SELECT "id"
FROM "v1_admin_users"
WHERE "admin_role" = 'owner'::"V1AdminRole"
  AND "status" = 'active'::"V1AdminStatus"
ORDER BY "id"
FOR UPDATE;

WITH "targets" AS MATERIALIZED (
  SELECT "admin_user"."id", "admin_user"."user_id"
  FROM "v1_admin_users" AS "admin_user"
  INNER JOIN "v1_users" AS "user"
    ON "user"."id" = "admin_user"."user_id"
  WHERE "admin_user"."status" = 'active'::"V1AdminStatus"
    AND "user"."account_status" <> 'active'::"V1AccountStatus"
  ORDER BY "admin_user"."id"
  FOR UPDATE OF "admin_user"
), "audit_logs" AS (
  INSERT INTO "v1_status_change_logs" (
    "id",
    "target_type",
    "target_id",
    "from_status",
    "to_status",
    "actor_type",
    "reason"
  )
  SELECT
    'admin-inactive-remediation-' || md5("targets"."id"),
    'admin',
    "targets"."user_id",
    'active',
    'revoked',
    'system'::"V1StatusActorType",
    'linked_user_account_inactive'
  FROM "targets"
  RETURNING "target_id"
)
UPDATE "v1_admin_users" AS "admin_user"
SET
  "status" = 'revoked'::"V1AdminStatus",
  "revoked_at" = COALESCE("admin_user"."revoked_at", CURRENT_TIMESTAMP),
  "updated_at" = CURRENT_TIMESTAMP
FROM "targets"
WHERE "admin_user"."id" = "targets"."id"
  AND EXISTS (
    SELECT 1
    FROM "audit_logs"
    WHERE "audit_logs"."target_id" = "targets"."user_id"
  );

COMMIT;

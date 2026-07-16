INSERT INTO "v1_chat_rooms" (
  "id",
  "team_id",
  "status",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  team."id",
  'active',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "v1_teams" AS team
WHERE team."status" = 'active'
  AND team."deleted_at" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "v1_team_memberships" AS membership
    WHERE membership."team_id" = team."id"
      AND membership."status" = 'active'
  )
ON CONFLICT ("team_id") DO NOTHING;

INSERT INTO "v1_chat_room_participants" (
  "id",
  "chat_room_id",
  "user_id",
  "status",
  "visible_from_at",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  room."id",
  membership."user_id",
  'active',
  membership."joined_at",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "v1_team_memberships" AS membership
JOIN "v1_teams" AS team
  ON team."id" = membership."team_id"
JOIN "v1_chat_rooms" AS room
  ON room."team_id" = membership."team_id"
WHERE membership."status" = 'active'
  AND team."status" = 'active'
  AND team."deleted_at" IS NULL
ON CONFLICT ("chat_room_id", "user_id") DO NOTHING;
UPDATE "v1_chat_room_participants" AS participant
SET
  "visible_from_at" = membership."joined_at",
  "updated_at" = CURRENT_TIMESTAMP
FROM "v1_chat_rooms" AS room
JOIN "v1_team_memberships" AS membership
  ON membership."team_id" = room."team_id"
JOIN "v1_teams" AS team
  ON team."id" = membership."team_id"
WHERE participant."chat_room_id" = room."id"
  AND participant."user_id" = membership."user_id"
  AND participant."status" = 'active'
  AND participant."visible_from_at" IS NULL
  AND membership."status" = 'active'
  AND team."status" = 'active'
  AND team."deleted_at" IS NULL;
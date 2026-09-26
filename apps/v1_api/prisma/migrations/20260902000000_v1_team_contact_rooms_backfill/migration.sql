-- 팀 컨택의 채팅 흡수(스펙 2026-09-02 §3.7): 기존 팀 컨택에 채팅방·참가자·첫 메시지를 백필한다.
-- 순수 데이터 마이그레이션 — 스키마 변경 없음. 각 단계는 idempotent(재실행해도 중복 삽입/오염 없음).
-- v1_chat_rooms.team_contact_id 는 UNIQUE 이고 "정확히 하나의 링크 대상" CHECK(20260821000000)이
-- 이미 있으므로, team_contact_id 만 채우는 이 INSERT 는 그 제약을 그대로 만족한다.

-- 1) 방이 없는 requested/accepted 컨택에 채팅방을 만든다.
--    v1_chat_rooms.team_contact_id 가 UNIQUE 라 LEFT JOIN 은 컨택당 최대 한 행만 만난다 — 팬아웃 없음.
INSERT INTO "v1_chat_rooms" ("id", "team_contact_id", "status", "created_at", "updated_at")
SELECT gen_random_uuid()::text, contact."id", 'active', contact."created_at", CURRENT_TIMESTAMP
FROM "v1_team_contacts" AS contact
LEFT JOIN "v1_chat_rooms" AS room ON room."team_contact_id" = contact."id"
WHERE room."id" IS NULL
  AND contact."status" IN ('requested', 'accepted');

-- 2) 컨택 방마다 양 팀 owner/manager 활성 멤버를 참가자로 채운다.
--    한 사람이 두 팀(from/to) 모두에서 owner/manager 일 수 있어 team_id IN (...) 조인이
--    같은 (chat_room_id, user_id) 를 두 번 낼 수 있다 — 서비스 코드(operatorUserIds)가
--    JS Set 으로 중복 제거하는 것과 동일한 이유로, 여기서도 DISTINCT 로 먼저 접어야
--    ON CONFLICT DO UPDATE 가 "같은 행을 한 명령에서 두 번 건드릴 수 없다"(21000)로 죽지 않는다.
--    이미 참가자인 사람은 visible_from_at 을 더 이른 시각으로 당기고,
--    기존 값이 NULL 이면 COALESCE 로 EXCLUDED(컨택 생성 시각)를 채택한다.
WITH target_participants AS (
  SELECT DISTINCT
    room."id" AS chat_room_id,
    membership."user_id" AS user_id,
    contact."created_at" AS visible_from_at
  FROM "v1_team_contacts" AS contact
  JOIN "v1_chat_rooms" AS room ON room."team_contact_id" = contact."id"
  JOIN "v1_team_memberships" AS membership
    ON membership."team_id" IN (contact."from_team_id", contact."to_team_id")
    AND membership."status" = 'active'
    AND membership."role" IN ('owner', 'manager')
)
INSERT INTO "v1_chat_room_participants" ("id", "chat_room_id", "user_id", "status", "visible_from_at", "created_at", "updated_at")
SELECT gen_random_uuid()::text, tp."chat_room_id", tp."user_id", 'active', tp."visible_from_at", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM target_participants AS tp
ON CONFLICT ("chat_room_id", "user_id") DO UPDATE
SET
  "visible_from_at" = LEAST(
    COALESCE("v1_chat_room_participants"."visible_from_at", EXCLUDED."visible_from_at"),
    EXCLUDED."visible_from_at"
  ),
  "updated_at" = CURRENT_TIMESTAMP;

-- 3) 요청 메시지가 없는 컨택 방에 첫 메시지를 채운다.
--    "없음" 판정은 sender_user_id = requested_by_user_id AND sent_at = 컨택 created_at 행의
--    부재로 한다(스펙 §3.7-3). v1_chat_rooms.team_contact_id 가 UNIQUE 라 컨택당 한 행만 낸다.
INSERT INTO "v1_chat_messages" ("id", "chat_room_id", "sender_user_id", "body", "status", "message_type", "sent_at", "created_at", "updated_at")
SELECT gen_random_uuid()::text, room."id", contact."requested_by_user_id", contact."message", 'sent', 'text', contact."created_at", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "v1_team_contacts" AS contact
JOIN "v1_chat_rooms" AS room ON room."team_contact_id" = contact."id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "v1_chat_messages" AS existing
  WHERE existing."chat_room_id" = room."id"
    AND existing."sender_user_id" = contact."requested_by_user_id"
    AND existing."sent_at" = contact."created_at"
);

-- 4) last_message_at 을 그 방의 최신 sent_at 으로 맞춘다. 이미 더 최신이면 건드리지 않는다.
UPDATE "v1_chat_rooms" AS room
SET
  "last_message_at" = latest."max_sent_at",
  "updated_at" = CURRENT_TIMESTAMP
FROM (
  SELECT "chat_room_id", MAX("sent_at") AS "max_sent_at"
  FROM "v1_chat_messages"
  GROUP BY "chat_room_id"
) AS latest
WHERE latest."chat_room_id" = room."id"
  AND room."team_contact_id" IS NOT NULL
  AND (room."last_message_at" IS NULL OR room."last_message_at" < latest."max_sent_at");

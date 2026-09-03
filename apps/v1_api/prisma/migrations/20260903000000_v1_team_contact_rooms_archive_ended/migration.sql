-- 팀 컨택의 채팅 흡수 후속: 거절·철회·만료로 끝난 컨택의 채팅방을 보관(archived)한다.
-- 앞으로는 응답·만료 정리 경로가 같은 처리를 하므로, 이 문장은 기존 데이터 1회 정리다. 멱등.
UPDATE "v1_chat_rooms" AS room
SET "status" = 'archived'
FROM "v1_team_contacts" AS contact
WHERE contact."id" = room."team_contact_id"
  AND room."status" = 'active'
  AND contact."status" IN ('declined', 'withdrawn', 'expired');

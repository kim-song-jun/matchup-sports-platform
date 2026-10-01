-- Task 181 ② 채팅 일정·매치 공유 카드. 추가만 한다(expand) — 기존 메시지는 그대로다.
-- 선례: 20261001000000_v1_chat_image_message (같은 enum 에 값 추가)
ALTER TYPE "V1ChatMessageType" ADD VALUE IF NOT EXISTS 'share';

-- 공유 카드 스냅숏 { kind, targetId, title, startAt, place, sub, route } — 보낼 때 찍는다.
ALTER TABLE "v1_chat_messages" ADD COLUMN IF NOT EXISTS "share_card" JSONB;

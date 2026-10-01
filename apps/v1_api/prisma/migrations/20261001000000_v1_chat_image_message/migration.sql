-- Task 181 ① 채팅 사진 메시지. 추가만 한다(expand) — 기존 text/system 메시지는 그대로다.
-- 선례: 20260927100000_v1_inquiry_public_categories (같은 방식의 enum 값 추가)
ALTER TYPE "V1ChatMessageType" ADD VALUE IF NOT EXISTS 'image';

-- 사진 메시지의 업로드(V1UploadAsset). 업로드가 지워지면 메시지는 남고 사진만 사라진다(SET NULL).
ALTER TABLE "v1_chat_messages" ADD COLUMN IF NOT EXISTS "attachment_asset_id" TEXT;

CREATE INDEX IF NOT EXISTS "v1_chat_messages_attachment_asset_id_idx" ON "v1_chat_messages"("attachment_asset_id");

ALTER TABLE "v1_chat_messages" ADD CONSTRAINT "v1_chat_messages_attachment_asset_id_fkey" FOREIGN KEY ("attachment_asset_id") REFERENCES "v1_upload_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

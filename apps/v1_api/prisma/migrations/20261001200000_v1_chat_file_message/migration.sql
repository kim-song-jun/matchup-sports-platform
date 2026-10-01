-- Task 181 ③ 채팅 파일 메시지. 추가만 한다(expand) — 기존 메시지·업로드는 그대로다.
-- 선례: 20261001000000_v1_chat_image_message (같은 방식의 enum 값 추가)
ALTER TYPE "V1ChatMessageType" ADD VALUE IF NOT EXISTS 'file';
ALTER TYPE "V1UploadKind" ADD VALUE IF NOT EXISTS 'file';

-- 파일 업로드의 다운로드 이름(정리된 원래 이름). 이미지·영상은 null.
ALTER TABLE "v1_upload_assets" ADD COLUMN IF NOT EXISTS "original_name" TEXT;

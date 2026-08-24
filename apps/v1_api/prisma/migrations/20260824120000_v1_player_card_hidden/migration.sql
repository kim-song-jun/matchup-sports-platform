-- Task 155: 선수 카드 숨김 스위치.
-- 기본값 false(카드를 보여준다). 켜면 본인에게도 남에게도 카드가 안 보인다.
-- IF NOT EXISTS 가드: 이 저장소 규약대로 idempotent 하게 작성한다.
ALTER TABLE "v1_user_profiles"
  ADD COLUMN IF NOT EXISTS "player_card_hidden" BOOLEAN NOT NULL DEFAULT false;

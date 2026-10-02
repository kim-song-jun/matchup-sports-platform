-- 선수 카드 모양(코스메틱). 기본값 'rect' — 처음 받는 카드는 가장 단순한 네모다.
-- 방패는 후기 10건 업적으로 열리며, 잠금 판정은 저장값이 아니라 서버가 매번 다시 한다.
ALTER TABLE "v1_user_profiles"
  ADD COLUMN IF NOT EXISTS "player_card_shape" TEXT NOT NULL DEFAULT 'rect';

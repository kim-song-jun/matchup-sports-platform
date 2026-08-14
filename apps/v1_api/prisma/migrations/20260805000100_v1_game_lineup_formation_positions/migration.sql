-- 포메이션(피치 위 시각적 배치) 기능. 라인업 저장 DTO에 이미 있던 `formation` 필드가
-- 실제로는 어디에도 저장되지 않던 빈 필드였다(games/dto/game-lineup.dto.ts,
-- team-match-lineup 쪽은 아예 필드 자체를 뺐음 — Task 15 blocker-2 report 참고). 이 마이그레이션이
-- 그 blocker를 해소한다.
--
-- v1_game_lineups.formation: 포메이션 프리셋 라벨("4-4-2" 등), null이면 자유 배치.
-- v1_game_participants.position_x/position_y: 실제 피치 좌표(0~100 퍼센트).
ALTER TABLE "v1_game_lineups" ADD COLUMN IF NOT EXISTS "formation" TEXT;
ALTER TABLE "v1_game_participants" ADD COLUMN IF NOT EXISTS "position_x" DOUBLE PRECISION;
ALTER TABLE "v1_game_participants" ADD COLUMN IF NOT EXISTS "position_y" DOUBLE PRECISION;

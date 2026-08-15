-- 개인 어워드별 표시 아이콘을 관리자가 선택할 수 있게 한다.
-- nullable로 추가해 기존 행은 종전 award_type 기반 아이콘 매핑을 그대로 사용한다.
ALTER TABLE "v1_tournament_awards" ADD COLUMN "icon_key" TEXT;

-- [D14] 종목별 선호 포지션(주/부).
--
-- expand 단계: **nullable 컬럼 추가만** 한다. 기존 행은 전부 NULL 이 되고 그것이
-- 정상 상태다(미설정 = 선수 카드 포지션 미상 = 가중치 균등). 백필하지 않는다 --
-- 사용자가 직접 고르는 값이라 추측해서 채울 근거가 없다.
--
-- 값은 그 종목 대회 설정의 lineup.positions[].code 다(축구 GK/DF/MF/FW,
-- 풋살 GOLEIRO/FIXO/ALA/PIVO). 종목마다 코드 집합이 다르므로 DB CHECK 로 고정하지
-- 않고 서비스 계층에서 프리셋과 대조해 검증한다 -- 프리셋이 늘면 마이그레이션 없이
-- 따라가야 하기 때문이다.
ALTER TABLE "v1_user_sport_preferences"
  ADD COLUMN IF NOT EXISTS "preferred_position" TEXT,
  ADD COLUMN IF NOT EXISTS "secondary_preferred_position" TEXT;

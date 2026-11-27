-- 팀 파울 경고 기준(대회·리그 단위).
-- 팀 누적 파울이 이 개수에 이르면 운영 콘솔이 "다음부터 10m 프리킥"을 알린다.
--
-- nullable 이고 기본값을 두지 않는다 — NULL = 기본값(5개)이고, 기본값은 코드
-- (`DEFAULT_TEAM_FOUL_THRESHOLD`)가 정한다. 그래서 기존 모든 대회·리그가 지금과 같은
-- 5개로 동작하고, 대회마다 다른 개수를 쓰는 운영자만 값을 채운다.
-- 화면 안내 기준일 뿐 기록·판정을 바꾸지 않아 출전정지 규정과 달리 소급 위험이 없다.
--
-- 순수 additive. 백필 UPDATE 없음.
ALTER TABLE "v1_tournaments"
  ADD COLUMN IF NOT EXISTS "team_foul_threshold" INTEGER;

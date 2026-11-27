-- 진행 중인 경기의 팀 파울을 관전 화면에 보여줄지(대회·리그 단위)와 친선 팀 매치의 팀 파울 기준.
--
-- v1_tournaments.show_team_fouls: 기본값 TRUE — 기존 모든 대회·리그가 지금과 같이 "보여 줌"으로 동작하고,
--   끄고 싶은 운영자만 FALSE 로 바꾼다. 운영 콘솔의 팀 파울·경고는 이 값과 무관하다.
-- v1_team_matches.team_foul_threshold: 친선 팀 매치(대회·리그 소속이 아닌 경기)의 팀 파울 경고 기준.
--   NULL = 기본값(5개)이고 기본값은 코드(DEFAULT_TEAM_FOUL_THRESHOLD)가 정한다 — v1_tournaments.team_foul_threshold 와
--   같은 규칙이다. 대회·리그 경기는 소속 대회·리그의 값을 읽으므로 이 컬럼을 보지 않는다.
--   (친선 팀 매치에는 관중용 라이브 화면이 없어 "표시 여부" 컬럼은 두지 않는다.)
--
-- 순수 additive(IF NOT EXISTS, 기본값 있는 NOT NULL 은 메타데이터만 바꿔 테이블을 다시 쓰지 않는다). 백필 없음.
ALTER TABLE "v1_tournaments"
  ADD COLUMN IF NOT EXISTS "show_team_fouls" BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE "v1_team_matches"
  ADD COLUMN IF NOT EXISTS "team_foul_threshold" INTEGER;

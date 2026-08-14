-- 대회 경기 라인업이 참가 등록 명단(v1_tournament_players)을 유일한 출처로 삼게 되면서,
-- 저장된 참가자를 등록 명단과 정확히 대조할 열쇠가 필요해졌다. 이름 문자열만으로는
-- 동명이인을 구분할 수 없어 선발 표시가 엉뚱한 사람에게 붙는다.
-- nullable — 이 컬럼이 없던 시절 저장된 라인업과, 사용자 계정을 쓰지 않는 team-match
-- 경로가 그대로 살아 있어야 한다.
-- 인덱스는 두지 않는다 — 이 컬럼은 항상 lineupId로 이미 좁혀진 행 안에서 읽히고,
-- userId 단독으로 조회하는 경로는 아직 없다.
ALTER TABLE "v1_game_participants" ADD COLUMN IF NOT EXISTS "user_id" TEXT;

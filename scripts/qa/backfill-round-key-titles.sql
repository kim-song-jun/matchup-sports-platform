-- 대회·리그 대진 제목에 저장된 라운드 키 원값을 화면 이름으로 바꾸는 1회성 백필.
--   league_rN (제목 어디든)              → 조별리그 N라운드
--   끝의 ' · <단계 키> <번호>' (대소문자 무시) → ' · <단계 이름> <번호>' (group·quarter·semi·semifinal·final·third_place)
-- 결과는 apps/v1_api/src/tournaments/tournament-round-label.ts 의 tournamentRoundLabel 과 같다.
-- 대상: 대회 상세가 붙은 v1_team_matches.title, 그 팀매치에 연결된 v1_team_schedules.title.
-- 채팅방 제목은 팀매치 제목을 읽어 만든다. 알림·채팅 공유 카드·감사 로그는 이미 나간 기록이라 두지 않는다.
-- 기본은 읽기 전용 dry-run이고 psql -v apply=1 일 때만 쓴다. 다시 돌리면 0건이다.
-- 실행: alpha 는 backfill-round-key-titles-alpha.sh, prod 는 docs/ops/prod-task168-transition-runbook.md 9절.

\encoding UTF8
\set ON_ERROR_STOP on
\if :{?apply}
\else
\set apply 0
\endif

-- 단계 키는 제목 끝 자리만 본다 — 대회명 안의 같은 단어("final cup")는 건드리지 않는다.
-- 역참조는 chr(92)(백슬래시)로 만든다. 0* 가 앞자리 0을 가져가 Number() 와 같은 숫자가 남는다.
-- league_step 부터 아래 변수는 별칭 src 를 전제로 한다.
\set league_re '''league_r[0-9]+'''
\set phase_re '''(?i) · (group|quarter|semi|semifinal|final|third_place) ([0-9]+)$'''
\set league_step 'regexp_replace(src.title, ''league_r0*([0-9]+)'', ''조별리그 '' || chr(92) || ''1라운드'', ''g'')'
\set phase_label 'CASE lower(substring(src.title FROM ' :phase_re ')) WHEN ''group'' THEN ''조별리그'' WHEN ''quarter'' THEN ''8강'' WHEN ''semi'' THEN ''4강'' WHEN ''semifinal'' THEN ''4강'' WHEN ''final'' THEN ''결승'' WHEN ''third_place'' THEN ''3·4위전'' END'
\set new_title 'CASE WHEN src.title ~ ' :phase_re ' THEN regexp_replace(' :league_step ', ' :phase_re ', '' · '' || ' :phase_label ' || '' '' || chr(92) || ''2'') ELSE ' :league_step ' END'
\set kind 'CASE WHEN src.title ~ ' :league_re ' THEN ''league_r'' ELSE ''phase'' END'
\set in_scope '(src.title ~ ' :league_re ' OR src.title ~ ' :phase_re ')'
\set tm_scope 'FROM v1_team_matches src JOIN v1_tournament_match_details d ON d.team_match_id = src.id WHERE ' :in_scope
\set ts_scope 'FROM v1_team_schedules src JOIN v1_tournament_match_details d ON d.team_match_id = src.team_match_id WHERE ' :in_scope

\if :apply
BEGIN;
\echo '== 모드: apply (한 트랜잭션으로 바꾸고 커밋한다)'
\else
BEGIN TRANSACTION READ ONLY;
\echo '== 모드: dry-run (읽기 전용 트랜잭션)'
\endif
SET LOCAL lock_timeout = '5s';

\echo '[1] 변환식 자체 검사: tournamentRoundLabel 과 다른 결과 수 (0 이어야 한다)'
SELECT set_config('backfill.selftest_failures', count(*)::text, true) AS selftest_failures
FROM (VALUES
  ('봄 리그 · league_r1 3', '봄 리그 · 조별리그 1라운드 3'),
  ('봄 리그 · league_r01 3', '봄 리그 · 조별리그 1라운드 3'),
  ('봄 리그 · league_r007 2', '봄 리그 · 조별리그 7라운드 2'),
  ('봄 리그 · league_r10 12', '봄 리그 · 조별리그 10라운드 12'),
  ('봄 리그 · league_r100 1', '봄 리그 · 조별리그 100라운드 1'),
  ('봄 리그 · league_r0 1', '봄 리그 · 조별리그 0라운드 1'),
  ('봄 리그 · league_r000 1', '봄 리그 · 조별리그 0라운드 1'),
  ('봄 리그 · 조별리그 1라운드 3', '봄 리그 · 조별리그 1라운드 3'),
  ('컵 · group 4', '컵 · 조별리그 4'),
  ('컵 · quarter 3', '컵 · 8강 3'),
  ('컵 · semi 1', '컵 · 4강 1'),
  ('컵 · semifinal 2', '컵 · 4강 2'),
  ('컵 · final 1', '컵 · 결승 1'),
  ('컵 · third_place 1', '컵 · 3·4위전 1'),
  ('컵 · Final 1', '컵 · 결승 1'),
  ('컵 · SEMI 2', '컵 · 4강 2'),
  ('final cup · semi 1', 'final cup · 4강 1'),
  ('group 리그 · group 2', 'group 리그 · 조별리그 2'),
  ('컵 · 결승 1', '컵 · 결승 1'),
  ('컵 · 3·4위전 1', '컵 · 3·4위전 1'),
  ('컵 · round_of_16 1', '컵 · round_of_16 1'),
  ('컵 · finals 1', '컵 · finals 1'),
  ('컵 · final', '컵 · final'),
  ('컵 · final 1 재경기', '컵 · final 1 재경기'),
  ('컵 결승 final 1', '컵 결승 final 1')
) AS src(title, expected)
WHERE :new_title IS DISTINCT FROM src.expected;
DO $$
BEGIN
  IF current_setting('backfill.selftest_failures')::int <> 0 THEN
    RAISE EXCEPTION '변환식 자체 검사 실패 %건 — 아무것도 바꾸지 않고 멈춘다', current_setting('backfill.selftest_failures');
  END IF;
END $$;

\echo '[2] 바꿀 대상'
SELECT 'v1_team_matches' AS target, count(*) AS rows :tm_scope
UNION ALL
SELECT 'v1_team_schedules', count(*) :ts_scope;
SELECT 'v1_team_matches' AS target, :kind AS kind, src.status::text AS status, (src.deleted_at IS NOT NULL) AS deleted, count(*) AS rows
:tm_scope GROUP BY 2, 3, 4
UNION ALL
SELECT 'v1_team_schedules', :kind, src.state::text, false, count(*) :ts_scope GROUP BY 2, 3
ORDER BY 1, 2, 3, 4;

\echo '[3] 바꾸지 않는 것 (참고)'
SELECT
  (SELECT count(*) FROM v1_team_matches src
    WHERE :in_scope
      AND NOT EXISTS (SELECT 1 FROM v1_tournament_match_details x WHERE x.team_match_id = src.id)) AS team_matches_without_details,
  (SELECT count(*) FROM v1_team_schedules src
    WHERE :in_scope
      AND NOT EXISTS (SELECT 1 FROM v1_tournament_match_details x WHERE x.team_match_id = src.team_match_id)) AS schedules_outside_scope,
  (SELECT count(*) :tm_scope AND src.title ~ 'league_r[0-9]+.*league_r[0-9]+') AS team_matches_with_two_keys,
  (SELECT count(*) FROM v1_team_matches src JOIN v1_tournament_match_details x ON x.team_match_id = src.id
    WHERE src.title ~ '(?i) · (group|quarter|semi|semifinal|final|third_place)( |$)'
      AND NOT src.title ~ :phase_re) AS phase_key_not_at_end;
SELECT c.relname AS target, t.tgname AS user_trigger
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal AND c.relname IN ('v1_team_matches', 'v1_team_schedules')
ORDER BY 1, 2;

\echo '[4] 바뀌기 전후 예시 (종류별 앞 3건)'
SELECT team_match_id, tournament_id, kind, before_title, after_title FROM (
  SELECT src.id AS team_match_id, d.tournament_id, :kind AS kind, src.title AS before_title, :new_title AS after_title,
    row_number() OVER (PARTITION BY :kind ORDER BY src.created_at, src.id) AS n
  :tm_scope
) x WHERE n <= 3 ORDER BY kind, n;
SELECT schedule_id, team_match_id, kind, before_title, after_title FROM (
  SELECT src.id AS schedule_id, src.team_match_id, :kind AS kind, src.title AS before_title, :new_title AS after_title,
    row_number() OVER (PARTITION BY :kind ORDER BY src.created_at, src.id) AS n
  :ts_scope
) x WHERE n <= 3 ORDER BY kind, n;

\if :apply
\echo '[5] 적용'
WITH changed AS (
  UPDATE v1_team_matches t
  SET title = p.after_title, updated_at = CURRENT_TIMESTAMP
  FROM (SELECT src.id, :new_title AS after_title :tm_scope) p
  WHERE t.id = p.id
  RETURNING t.id
)
SELECT 'v1_team_matches' AS target, count(*) AS updated FROM changed;
-- 일정은 제목이 바뀔 때 version 을 올린다(syncTeamMatchScheduleInTx 와 같은 규약).
WITH changed AS (
  UPDATE v1_team_schedules t
  SET title = p.after_title, version = t.version + 1, updated_at = CURRENT_TIMESTAMP
  FROM (SELECT src.id, :new_title AS after_title :ts_scope) p
  WHERE t.id = p.id
  RETURNING t.id
)
SELECT 'v1_team_schedules' AS target, count(*) AS updated FROM changed;
SELECT set_config('backfill.remaining', ((SELECT count(*) :tm_scope) + (SELECT count(*) :ts_scope))::text, true) AS remaining;
DO $$
BEGIN
  IF current_setting('backfill.remaining')::int <> 0 THEN
    RAISE EXCEPTION '적용 뒤에도 라운드 키 제목이 %건 남았다 — 롤백한다', current_setting('backfill.remaining');
  END IF;
END $$;
COMMIT;
\echo '== 커밋했다. 다시 dry-run 하면 [2] 가 0건이어야 한다'
\else
ROLLBACK;
\echo '== dry-run 이라 아무것도 바꾸지 않았다 (적용은 apply=1)'
\endif

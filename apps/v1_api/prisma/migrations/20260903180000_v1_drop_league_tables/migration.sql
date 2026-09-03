-- Task 164 BE-5 contract — `v1_leagues` · `v1_league_teams` 제거
--
-- ## 왜 지우나
-- 리그는 통합 축(`V1Tournament(kind='regular_league')` + `V1TournamentRegistration`)이 정본이
-- 됐다. 재배선(#1005)이 **읽기를 전부** 옮겼고, 앞선 커밋이 **dual-write 쓰기와 alpha QA
-- 시드**까지 옮겼다. 이제 이 두 테이블을 읽거나 쓰는 코드가 없다.
--
-- ## 전제: 거울은 리그와 **같은 id** 를 쓴다
-- `leagueMirrorCreateData` 가 `id: league.id` 로 만들고 D8 백필도 같은 규칙이었다. 그래서
-- FK 재타깃은 **컬럼 값을 그대로 두고 참조 테이블만 바꾸면 된다** — UPDATE 백필이 없다.
--
-- 그 전제가 배포 시점에도 참인지 **이 마이그레이션이 스스로 검사한다**(아래 DO 블록).
-- 어긋나면 아무것도 바꾸지 않고 실패한다 — 트랜잭션 안이라 부분 적용이 남지 않는다.
-- 검사 없이 재타깃하면 대상 없는 행이 FK 생성에서 터지는데, 그때는 무엇이 문제인지
-- (어느 행인지) 알 수 없는 제약 위반 메시지만 남는다.
DO $$
DECLARE
  orphan_fixtures integer;
  orphan_promotions integer;
  league_count integer;
  matched_count integer;
BEGIN
  SELECT count(*) INTO orphan_fixtures
  FROM v1_team_matches m
  WHERE m.league_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM v1_tournaments t WHERE t.id = m.league_id);

  SELECT count(*) INTO orphan_promotions
  FROM v1_league_promotions p
  WHERE NOT EXISTS (SELECT 1 FROM v1_tournaments t WHERE t.id = p.from_league_id);

  SELECT count(*) INTO league_count FROM v1_leagues;
  SELECT count(*) INTO matched_count
  FROM v1_leagues l
  JOIN v1_tournaments t ON t.id = l.id AND t.kind = 'regular_league';

  RAISE NOTICE 'task164-be5-drop: leagues=% matched=% orphan_fixtures=% orphan_promotions=%',
    league_count, matched_count, orphan_fixtures, orphan_promotions;

  IF orphan_fixtures > 0 OR orphan_promotions > 0 THEN
    RAISE EXCEPTION 'TASK164_BE5_ORPHAN: 통합 축에 대응 행이 없는 참조가 있다 (대진 % · 승강 %) — 재타깃하면 그 행들이 끊긴다. 거울 백필을 먼저 확인하라.',
      orphan_fixtures, orphan_promotions;
  END IF;
END $$;

-- FK 재타깃 — 컬럼 값은 그대로 두고 참조 테이블만 바꾼다.
-- `v1_team_matches.league_id`: 리그가 지워져도 대진은 남아야 하므로 SET NULL 유지.
ALTER TABLE "v1_team_matches" DROP CONSTRAINT IF EXISTS "v1_team_matches_league_fk";
ALTER TABLE "v1_team_matches"
  ADD CONSTRAINT "v1_team_matches_league_fk"
  FOREIGN KEY ("league_id") REFERENCES "v1_tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- `v1_league_promotions.from_league_id`: 승강 기록은 그 리그에 종속이므로 CASCADE 유지.
ALTER TABLE "v1_league_promotions" DROP CONSTRAINT IF EXISTS "v1_league_promotions_league_fk";
ALTER TABLE "v1_league_promotions"
  ADD CONSTRAINT "v1_league_promotions_league_fk"
  FOREIGN KEY ("from_league_id") REFERENCES "v1_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 이제 남은 참조가 없다. 로스터 테이블부터 지운다(리그를 CASCADE 로 참조한다).
DROP TABLE IF EXISTS "v1_league_teams";
DROP TABLE IF EXISTS "v1_leagues";

-- `V1LeagueState` 는 위 테이블의 컬럼에만 쓰였다. 응답의 `state` 어휘는 남지만 그건
-- 애플리케이션의 손 유니온(`league-state.ts`)이고, 저장은 `V1TournamentStatus` 로 한다.
DROP TYPE IF EXISTS "V1LeagueState";

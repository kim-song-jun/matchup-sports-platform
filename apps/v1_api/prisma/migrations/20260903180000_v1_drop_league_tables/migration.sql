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
  IF to_regclass('public.v1_leagues') IS NULL THEN
    RAISE NOTICE 'task164-be5-drop: 리그 테이블이 이미 없다 — 건너뛴다';
    RETURN;
  END IF;
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

-- ## DROP 전 백필 — 등록이 없는 로스터 행을 흡수한다
-- alpha 실측(2026-09-03)에서 `v1_league_teams` 215행 중 **4행에 대응하는 confirmed 등록이
-- 없었다.** 한 리그(2026-09-02 12:18 생성)에 팀 4개가 같은 시각으로 들어갔는데, 그때의 리그
-- 생성 경로는 `teams: { createMany }` 로 로스터만 만들고 등록을 만들지 않았다 — 다섯 경로
-- 전부가 등록을 만들게 된 것은 그 다음날(2026-09-03 04:33)이고, 08-31 백필은 그보다 앞서
-- 돌아 이 리그를 보지 못했다.
--
-- **그 4행을 그냥 두고 DROP 하면 그 팀들의 참가 사실이 사라진다.** 읽기는 이미 등록 축이라
-- (재배선 릴리스) 그 리그는 지금도 참가팀 0개로 보이는데, 여기서 흡수하면 그것도 함께
-- 고쳐진다.
--
-- 08-31 백필과 **같은 모양**으로 넣는다: `appliedByUserId` 는 팀 owner(신청자가 없는 운영자
-- 지정이므로), `entrySource='seeded'`, `status='confirmed'`(그래야 로스터로 읽힌다),
-- `created_at`·`confirmed_at` 은 로스터 행의 시각(두 축의 시각이 어긋나지 않게 — 대진 생성이
-- 이 순서에 의존한다). **자격 가드는 걸지 않는다** — 이미 로스터였던 팀이고, 지금 와서
-- 자격으로 거르면 참가 사실을 지우는 것이 된다.
DO $$
DECLARE
  inserted_count bigint;
  still_missing bigint;
BEGIN
  IF to_regclass('public.v1_leagues') IS NULL THEN
    RAISE NOTICE 'task164-be5-drop: 리그 테이블이 이미 없다 — 건너뛴다';
    RETURN;
  END IF;
  INSERT INTO v1_tournament_registrations
    (id, tournament_id, team_id, applied_by_user_id, status, entry_source, confirmed_at, created_at, updated_at)
  SELECT gen_random_uuid(), lt.league_id, lt.team_id, tm.owner_user_id,
         'confirmed'::"V1TournamentRegistrationStatus",
         'seeded'::"V1CompetitionEntrySource",
         lt.created_at, lt.created_at, CURRENT_TIMESTAMP
    FROM v1_league_teams lt
    JOIN v1_teams tm ON tm.id = lt.team_id
   WHERE NOT EXISTS (
     SELECT 1 FROM v1_tournament_registrations r
      WHERE r.tournament_id = lt.league_id AND r.team_id = lt.team_id
   );
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RAISE NOTICE 'task164-be5-drop: 등록 없는 로스터 % 행을 confirmed 등록으로 흡수했다', inserted_count;

  -- 흡수 뒤 다시 센다. `(tournament_id, team_id)` unique 때문에 **취소 상태의 행이 이미 있는**
  -- (리그, 팀) 은 위 INSERT 가 건너뛴다 — 그런 행이 남아 있으면 로스터가 그대로 사라지므로
  -- 여기서 멈춘다(운영자가 그 등록을 confirmed 로 되돌릴지 판단해야 한다).
  SELECT count(*) INTO still_missing
    FROM v1_league_teams lt
   WHERE NOT EXISTS (
     SELECT 1 FROM v1_tournament_registrations r
      WHERE r.tournament_id = lt.league_id AND r.team_id = lt.team_id AND r.status = 'confirmed'
   );
  IF still_missing > 0 THEN
    RAISE EXCEPTION 'TASK164_BE5_ROSTER_UNMIGRATED: confirmed 등록이 없는 로스터가 아직 % 행 있다 — 그대로 DROP 하면 그 팀들의 참가 사실이 사라진다.', still_missing;
  END IF;
END $$;

-- FK 재타깃 — 컬럼 값은 그대로 두고 참조 테이블만 바꾼다.
-- `v1_team_matches.league_id`: 리그가 지워져도 대진은 남아야 하므로 SET NULL 유지.
-- 이미 `v1_tournaments` 를 가리키면 건너뛴다(재실행 안전).
DO $$
BEGIN
  IF (SELECT confrelid::regclass::text FROM pg_constraint WHERE conname = 'v1_team_matches_league_fk')
     IS DISTINCT FROM 'v1_tournaments' THEN
    EXECUTE 'ALTER TABLE "v1_team_matches" DROP CONSTRAINT IF EXISTS "v1_team_matches_league_fk"';
    EXECUTE 'ALTER TABLE "v1_team_matches" ADD CONSTRAINT "v1_team_matches_league_fk" FOREIGN KEY ("league_id") REFERENCES "v1_tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
  -- `v1_league_promotions.from_league_id`: 승강 기록은 그 리그에 종속이므로 CASCADE 유지.
  IF (SELECT confrelid::regclass::text FROM pg_constraint WHERE conname = 'v1_league_promotions_league_fk')
     IS DISTINCT FROM 'v1_tournaments' THEN
    EXECUTE 'ALTER TABLE "v1_league_promotions" DROP CONSTRAINT IF EXISTS "v1_league_promotions_league_fk"';
    EXECUTE 'ALTER TABLE "v1_league_promotions" ADD CONSTRAINT "v1_league_promotions_league_fk" FOREIGN KEY ("from_league_id") REFERENCES "v1_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE';
  END IF;
END $$;

-- 이제 남은 참조가 없다. 로스터 테이블부터 지운다(리그를 CASCADE 로 참조한다).
DROP TABLE IF EXISTS "v1_league_teams";
DROP TABLE IF EXISTS "v1_leagues";

-- `V1LeagueState` 는 위 테이블의 컬럼에만 쓰였다. 응답의 `state` 어휘는 남지만 그건
-- 애플리케이션의 손 유니온(`league-state.ts`)이고, 저장은 `V1TournamentStatus` 로 한다.
DROP TYPE IF EXISTS "V1LeagueState";

-- 출전 게이트 백필 — 대회 경기(TOURNAMENT_FIXTURE) 한정
--
-- `deriveTournamentRevision`은 경기 종료 시 라인업에 이름이 오른 참가자 전원을
-- `started = true`로 못박아 `v1_game_result_participants`에 적어 왔다. 그 테이블의
-- row 하나가 곧 "이 선수는 이 경기를 뛰었다"는 뜻이고(PublicUserRecordsService의
-- `summary.appearances`는 이 row를 그대로 센다), 그래서 끝까지 벤치를 지킨 선수도
-- 프로필에 출전 1경기가 쌓였다 — 게다가 선발로 기록됐다.
--
-- 서비스 코드는 이제 "선발이었거나, 활성 SUBSTITUTION으로 투입됐거나, 스탯 이벤트의
-- 주체인 참가자"만 기록한다. 이 마이그레이션은 이미 저장된 과거 경기에 같은 판정을
-- 소급 적용한다. 판정 근거(라인업의 `started` + 이벤트 스트림)는 삭제하지 않는 별도
-- 테이블에 그대로 남아 있으므로, 지워진 row는 언제든 같은 규칙으로 다시 만들 수 있다.
--
-- 팀 매치(TEAM_MATCH)는 의도적으로 건드리지 않는다. 팀 매치에는 라이브 이벤트 스트림이
-- 없어 "이 벤치 선수가 교체로 들어갔는가"를 판정할 근거가 DB 어디에도 없다 — 지우면
-- 실제로 뛴 교체 선수의 기록까지 함께 사라지는 추측이 된다. 팀 매치는 결과 입력 화면에
-- 추가된 "교체 출전" 체크로 앞으로 제출되는 결과부터 정확해진다.

-- 트리거 `v1_guard_result_participant_mutation`은 revision이 DRAFT일 때만 result participant 행의 변경을 허용한다
-- (20260729000100_v1_game_operations). 백필 대상은 전부 SUBMITTED/OFFICIAL이므로
-- 이 트랜잭션 동안만 끈다. 트랜잭션이 끝나면 원래대로 다시 켜진다.
ALTER TABLE v1_game_result_participants DISABLE TRIGGER v1_guard_result_participant_mutation;

-- 1) 출전 증거가 없는 행 제거.
DELETE FROM v1_game_result_participants rp
USING v1_game_result_revisions rev
WHERE rp.result_revision_id = rev.id
  AND EXISTS (
    SELECT 1 FROM v1_games g WHERE g.id = rev.game_id AND g.source_type = 'TOURNAMENT_FIXTURE'
  )
  -- 선발이 아니었고
  AND NOT EXISTS (
    SELECT 1 FROM v1_game_participants p WHERE p.id = rp.participant_id AND p.started = TRUE
  )
  -- 활성(취소되지 않은) 교체로 투입된 적도 없고
  AND NOT EXISTS (
    SELECT 1
    FROM v1_game_events e
    WHERE e.game_id = rev.game_id
      AND e.type = 'SUBSTITUTION'
      AND e.participant_id = rp.participant_id
      AND NOT EXISTS (SELECT 1 FROM v1_game_events r WHERE r.reverses_event_id = e.id)
  )
  -- 피치 위에 있었다는 다른 증거도 없는 경우에만 지운다.
  --
  -- 스탯(골/도움/파울/카드) 조건은 서비스 코드의 스탯 union과 같은 안전장치다:
  -- 교체 입력을 빠뜨린 채 골만 기록된 운영 실수에서 그 골을 소리 없이 삭제해
  -- 버리지 않기 위한 것.
  --
  -- MVP 조건은 백필에만 있고 런타임에는 없는데, 그래야 맞다. `deriveTournamentRevision`
  -- 은 애초에 `mvp_participant_id`를 쓰지 않으므로(자동 파생 revision의 MVP는 항상
  -- null) 런타임 union에 MVP를 넣으면 절대 발화하지 않는 죽은 조건이 된다. 반면 과거
  -- 데이터에는 MVP가 붙은 TOURNAMENT_FIXTURE revision이 존재할 수 있다 — 정정·재제출
  -- 경로(`tournament-result-review.service.ts`)가 사람이 고른 MVP를 그대로 싣기
  -- 때문이다. 그 행을 지우면 revision이 결과에 없는 선수를 MVP로 가리키게 된다.
  AND rp.goals = 0
  AND rp.assists = 0
  AND rp.fouls = 0
  AND COALESCE((rp.cards ->> 'yellow')::int, 0) = 0
  AND COALESCE((rp.cards ->> 'red')::int, 0) = 0
  AND rev.mvp_participant_id IS DISTINCT FROM rp.participant_id;

-- 2) 남은 행의 `started`를 라인업의 실제 값으로 정정한다. 하드코딩된 `true` 때문에
--    교체 투입 선수까지 전부 선발로 표시돼 있었다(공개 기록의 items[].started).
UPDATE v1_game_result_participants rp
SET started = p.started
FROM v1_game_result_revisions rev, v1_game_participants p
WHERE rp.result_revision_id = rev.id
  AND rp.participant_id = p.id
  AND EXISTS (
    SELECT 1 FROM v1_games g WHERE g.id = rev.game_id AND g.source_type = 'TOURNAMENT_FIXTURE'
  )
  AND rp.started IS DISTINCT FROM p.started;

ALTER TABLE v1_game_result_participants ENABLE TRIGGER v1_guard_result_participant_mutation;

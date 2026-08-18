-- 프로덕션 실측 버그 백필: 대회 결승이 정규시간 1:1, 승부차기 2:3 이었는데
-- 양팀의 v1_team_record_facts.result 가 둘 다 "무(DRAWN)"로 기록됐다.
--
-- 원인은 GameResultOfficialFactsService.project()가 goals_for/goals_against
-- (정규시간 스코어)만 보고 WON/DRAWN/LOST를 정했기 때문이다 -- 리비전 score에는
-- penalties(승부차기)가 이미 들어 있는데 무시됐다. 그 계산 로직 자체는 같은
-- 커밋에서 apps/v1_api/src/game-operations/team-record-result.ts의
-- resolveTeamRecordResult()로 고쳤다 -- 이 마이그레이션은 그 함수가 처리하지
-- 못하는 "이미 잘못 기록된 과거 행"을 소급 정정한다. raw SQL이라 TS 함수를
-- import할 수 없으므로, 아래 CASE 문은 resolveTeamRecordResult()와 정확히 같은
-- 규칙을 SQL로 다시 적은 것이다 -- 둘 중 하나를 고칠 땐 반드시 다른 쪽도 함께
-- 봐야 한다:
--   1. result가 이미 DRAWN이 아니면(=정규시간 승부가 갈렸으면) 건드리지 않는다
--      (goals_for/goals_against는 정규시간 스코어 그대로이므로, 저장된
--      result='DRAWN'은 곧 "정규시간이 동점이었다"는 뜻과 같다 -- 별도 확인 불필요).
--   2. 승부차기 값이 있고 승패가 갈리면 그걸로 WON/LOST를 정한다.
--   3. 승부차기도 동점이거나 값 자체가 없으면 DRAWN 그대로 둔다(WHERE 조건에서
--      자연히 제외된다).
--
-- v1_game_result_revisions.score에는 서로 다른 두 형태가 공존한다
-- (apps/v1_api/src/games/public-records/public-tournament-records.service.ts
-- 의 parseScore() 문서 참고, 그리고 apps/v1_api/src/game-operations/
-- parse-official-score.ts):
--   1) 평평한 형태 -- 실시간 결과 확정 경로: `penalties`(복수) 키.
--   2) 중첩 형태 -- 레거시 결과 백필(game-result-backfill.ts의 createImportedGame()):
--      `penalty`(단수) 키, regulation 아래가 아니라 최상위 형제 필드.
-- 한쪽만 읽으면 그 형태로 저장된 경기에서만 승부차기가 조용히 사라지는 함정이라
-- (이 저장소에서 이미 반복됨) 아래에서 COALESCE로 양쪽을 다 읽는다.
--
-- v1_team_record_facts에는 팀이 그 경기의 home/away 중 어느 쪽이었는지가 직접
-- 저장돼 있지 않다 -- v1_game_sides(game_id, team_id, side_key)와 대조해서
-- 알아낸다.
--
-- 트리거 v1_block_team_record_fact_mutation(BEFORE UPDATE OR DELETE)이 이 테이블을
-- append-only로 막아 놓았다 -- 이 마이그레이션 트랜잭션 동안만 끈다(팀 실적
-- 백필과 동일한 선례: 20260813200000_v1_appearance_gate_backfill의
-- v1_guard_result_participant_mutation 처리 방식).
ALTER TABLE v1_team_record_facts DISABLE TRIGGER v1_block_team_record_fact_mutation;

WITH penalty_scores AS (
  SELECT
    trf.id AS fact_id,
    side.side_key AS team_side_key,
    COALESCE(rev.score -> 'penalties', rev.score -> 'penalty') AS penalty_json
  FROM v1_team_record_facts trf
  JOIN v1_game_result_revisions rev ON rev.id = trf.revision_id
  JOIN v1_game_sides side ON side.game_id = trf.game_id AND side.team_id = trf.team_id
  WHERE trf.result = 'DRAWN'
),
decided AS (
  SELECT
    fact_id,
    CASE
      WHEN team_side_key = 'HOME' THEN (penalty_json ->> 'home')::int
      ELSE (penalty_json ->> 'away')::int
    END AS penalties_for,
    CASE
      WHEN team_side_key = 'HOME' THEN (penalty_json ->> 'away')::int
      ELSE (penalty_json ->> 'home')::int
    END AS penalties_against
  FROM penalty_scores
  WHERE penalty_json IS NOT NULL
    AND jsonb_typeof(penalty_json -> 'home') = 'number'
    AND jsonb_typeof(penalty_json -> 'away') = 'number'
)
UPDATE v1_team_record_facts trf
SET result = CASE
    WHEN decided.penalties_for > decided.penalties_against THEN 'WON'
    ELSE 'LOST'
  END
FROM decided
WHERE trf.id = decided.fact_id
  AND decided.penalties_for <> decided.penalties_against;

ALTER TABLE v1_team_record_facts ENABLE TRIGGER v1_block_team_record_fact_mutation;

-- Task 163 BE-3: 후보(bench) 개념 자체를 없앤다 (정본 §3).
--
-- team-match 라인업(team-match-lineup.service.ts)은 `started` 컬럼을 쓰지 않고
-- `position = 'BENCH'` 라는 문자열 관례로 후보를 표시해 왔다. 같은 컬럼을 대회 경기는
-- 실제 포지션 코드로 쓰기 때문에, 한 컬럼이 소스에 따라 다른 뜻을 갖는 상태였다.
--
-- 정본이 **명단 = 출전자**로 확정했으므로(선발/후보 구분 없음) 이 UPDATE 는 후보를
-- "선발로 바꾸는" 것이 아니라 **구분 자체를 지우는** 것이다:
--   position = 'BENCH'  →  started = true, position = NULL
-- 'BENCH' 는 실제 포지션이 아니므로 position 은 비운다(읽는 쪽이 화면 라벨로 노출하지
-- 않으려고 이미 null 로 지워 읽고 있었다). `V1GameParticipant.started` 는 앞으로
-- 항상 true 이고, 컬럼은 읽는 자리를 건드리지 않으려고 남긴다(정본 §3 표).
--
-- **멱등**: 두 번째 실행은 0행이다 — 첫 실행이 position 을 NULL 로 만들어 WHERE 가 더
-- 이상 아무 행도 고르지 않는다.
--
-- **되돌릴 수 없다.** 어느 행이 후보였는지는 이 UPDATE 뒤 남지 않는다(started 는 원래
-- 값과 새 값이 둘 다 true 라 흔적이 없고, position 은 지워진다). 실행 전 백업이 유일한
-- 복구 경로다. 다만 정본이 후보 개념을 폐기했으므로 그 정보를 되살릴 소비처도 없다.
-- ⚠️ **두 종류의 행을 함께 고친다.** 후보 표시 방식이 경로마다 달랐다:
--   · 팀 매치 라인업  position = 'BENCH'      (started 는 안 쓰고 기본값 true 로 남았다)
--   · 대회 경기 라인업 started = false        (DTO 의 started 를 그대로 저장했다 —
--                                             games.service.ts, Task 163 BE-1 이전)
-- BENCH 만 고치면 대회 쪽 후보 행이 `started=false` 로 남아 "값을 true 로 고정"(정본 §3)이
-- 절반만 이뤄진다. 그 행들은 결과 리비전으로 복사되므로 공식 기록이 경로에 따라 갈린다.
-- 무엇을 몇 행 고치는지 먼저 남긴다. 이 마이그레이션은 alpha 실데이터를 바꾸므로
-- 승인·감사에 "얼마나" 가 필요하고, 실행 뒤에는 그 수를 되찾을 방법이 없다
-- (WHERE 조건이 스스로를 지운다). 두 수는 겹칠 수 있다 — 각각 따로 센다.
DO $$
DECLARE
  bench_rows bigint;
  not_started_rows bigint;
BEGIN
  SELECT count(*) INTO bench_rows FROM "v1_game_participants" WHERE "position" = 'BENCH';
  SELECT count(*) INTO not_started_rows FROM "v1_game_participants" WHERE "started" = false;
  RAISE NOTICE 'task163: position=BENCH rows=%', bench_rows;
  RAISE NOTICE 'task163: started=false rows=% (overlaps the above)', not_started_rows;
END $$;

UPDATE "v1_game_participants"
SET "started" = true,
    "position" = CASE WHEN "position" = 'BENCH' THEN NULL ELSE "position" END
WHERE "started" = false OR "position" = 'BENCH';

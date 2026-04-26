# Task 75 — AutoQA Operator Entrypoint

Owner: codex

## Goal

스킬 문서의 `autoqa` 컨셉을 이 저장소 안에서 바로 실행 가능한 repo-local operator로 옮긴다. 핵심은 다음이다.

1. `autoqa` 한 번으로 `.autoqa` preflight + scenario refresh + cycle 진입이 된다.
2. Codex heartbeat/background가 없으면 fake background로 끝내지 않고 즉시 foreground cycle로 degrade한다.
3. Codex background를 못 쓰는 환경에서도 cron-friendly fallback 자산과 install flow를 남겨 전체 테스트를 반복 가능하게 한다.

## Deliverables

- `scripts/qa/run-autoqa.mjs`
- `scripts/qa/run-autoqa-scenarios.mjs`
- `scripts/qa/run-autoqa-cycle.mjs`
- `scripts/qa/autoqa-lib.mjs`
- `package.json` / `Makefile` / `README.md` 실행면 업데이트
- `.autoqa/status.md`, `.autoqa/status.md.compact_handoff` 연동

## Acceptance Criteria

- `node scripts/qa/run-autoqa.mjs status` 가 현재 `.autoqa` 상태를 구체적으로 출력한다.
- `node scripts/qa/run-autoqa.mjs scenarios` 가 oracle 검증, scenario doc refresh, scope-freeze 갱신을 수행한다.
- `node scripts/qa/run-autoqa.mjs cycle all` 이 현재 oracle action 집합(`navigate`, `click`, `type`, `wait`, `wait_url`, `screenshot`, `assert_dom`, `assert_no_console_errors`, `export_storage_state`, `db_checkpoint`)을 foreground에서 실행할 수 있다.
- default `autoqa` flow는 background unavailable일 때 `.autoqa/status.md`에 fallback 이유를 남기고 foreground cycle로 이어진다.
- cron fallback용 wrapper/example이 생성되고, managed host cron install/status 경로가 제공된다.

## Checklist

- [x] repo-local autoqa operator 경계 확정
- [x] shared autoqa lib 구현
- [x] scenario refresh / scope-freeze writer 구현
- [x] foreground cycle runner 구현
- [x] background unavailable -> foreground fallback 구현
- [x] cron-friendly wrapper/example 생성 구현
- [x] managed cron install/status 구현
- [x] package / make / readme 실행면 반영
- [x] 실제 foreground run 검증

## Notes

- 이번 범위의 우선순위는 "전체적으로 다 테스팅 가능한 operator"다.
- auto-fix / review / publish loop는 이번 작업에서 hard requirement가 아니다.
- ledgers와 status/handoff는 append-only / compact-safe contract를 유지한다.

## Validation

- `node --check scripts/qa/autoqa-lib.mjs`
- `node --check scripts/qa/run-autoqa-scenarios.mjs`
- `node --check scripts/qa/run-autoqa-cycle.mjs`
- `node --check scripts/qa/run-autoqa.mjs`
- `node scripts/qa/run-autoqa.mjs status`
- `node scripts/qa/run-autoqa.mjs scenarios`
- `node scripts/qa/run-autoqa.mjs login team-owner`
- `node scripts/qa/run-autoqa.mjs --scope minimal`
- `node scripts/qa/run-autoqa.mjs cycle SC-SMOKE-002 --scope core`
- `node scripts/qa/run-autoqa.mjs cycle SC-MATCH-001 --scope core`
- `node scripts/qa/run-autoqa.mjs cron status`
- `node scripts/qa/run-autoqa.mjs cron install`

## Current Outcome

- default `autoqa` operator now refreshes scenarios, records heartbeat unavailability, generates cron fallback assets, and continues with foreground cycle
- `.autoqa/status.md` and `.autoqa/status.md.compact_handoff` are updated by scenario refresh / cycle / login / cron flows
- `SC-MATCH-001 STEP-03` was a false negative caused by missing post-click settle in the cycle runner; the operator now waits briefly after `click` and `type`, so React state-driven controls can flush before the next step
- managed cron fallback can now be installed directly from the repo-local operator instead of requiring a manual crontab edit

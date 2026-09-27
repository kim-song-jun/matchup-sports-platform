# Task 143 — 조별리그 진행 중 미정 결선 대진 공개

## Scope

- Frontend: `apps/v1_web/src/app/tournaments/[id]/**`
- No API, schema, migration, or assignment-rule change.

## Problem

관리자가 4강·결승 fixture를 팀 미배정 상태로 미리 생성해도 `group_knockout` 공개 대진표는 조별리그 전체가 끝날 때까지 숨겨진다. 일정에는 `미정 vs 미정`이 보이지만 대진표에서는 같은 경기 구조를 미리 확인할 수 없다.

## Acceptance Criteria

- [x] 결선 fixture가 있으면 조별리그 진행 중에도 공개 대진표에 표시한다.
- [x] 팀 미배정 슬롯은 기존 표현인 `미정`을 사용한다.
- [x] 결선 fixture가 하나도 없으면 기존 준비 안내를 유지한다.
- [x] 조별 순위 확정 여부와 실제 팀 배정·결과 기록 규칙은 변경하지 않는다.
- [x] 대회 상세와 `/bracket` 회귀 테스트가 통과한다.

## Progress Snapshot

- 2026-08-15: 일정 표시는 이미 nullable 팀 슬롯을 `미정`으로 지원한다. 대진표를 막는 원인은 대회 상세와 `/bracket`의 `allGroupPhasesComplete` 렌더 게이트로 확인했다.
- 2026-08-15: 결선 fixture 존재 여부만으로 대진표를 공개하도록 두 화면의 렌더 게이트를 통일했다. 관련 Vitest 63/63과 v1 web lint/type-check를 통과했다.
- 2026-08-15: 임시 worktree에는 v1 런타임과 headed Playwright MCP 세션이 없어 screenshot·console·network 시각 검증은 미실행이다.

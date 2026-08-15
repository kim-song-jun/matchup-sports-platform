# Task 141 — 경기 일정 득점 기록 전·후반 구분

## Scope

- Backend: `apps/v1_api/src/games/public-records/**`
- Frontend: `apps/v1_web/src/components/public-game-records/**`
- Contract docs: `docs/api/domains/public-records.md`
- No schema or migration change.

## Acceptance Criteria

- [x] 공개 일정 응답의 득점자 항목이 득점 피리어드를 전달한다.
- [x] 일정 카드의 득점 기록은 전반을 위에, 후반을 아래에 각각 시간순으로 표시한다.
- [x] 득점이 하나라도 있으면 전반과 후반의 경계에 얇은 구분선을 표시한다.
- [x] 전반만 득점하면 전반 아래, 후반만 득점하면 후반 위에 구분선이 놓인다.
- [x] 양쪽 모두 득점이 없으면 득점 영역과 구분선을 렌더하지 않는다.
- [x] 백엔드·프런트의 좁은 회귀 테스트와 API 계약 문서를 갱신한다.

## Progress Snapshot

- 2026-08-15: `PublicScheduleEntry.scorers`가 `clockMs`만 전달해 서로 같은 분 값이 될 수 있는 전반/후반을 프런트에서 구분할 수 없는 원인을 확인했다.
- 2026-08-15: API에 `period`를 추가하고 전반/후반 그룹과 경계선을 구현했다. Web 16 tests, API 13 tests 통과.

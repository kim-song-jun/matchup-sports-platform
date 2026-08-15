# Task 140 — 공개 경기 기록 카드 색상 구분

## Scope

- Backend: `apps/v1_api/src/games/public-records/**`
- Frontend: `apps/v1_web/src/components/public-game-records/**`
- Contract docs: `docs/api/domains/public-records.md`
- No schema or migration change.

## Problem

공개 경기 상세 타임라인은 모든 `CARD` 이벤트를 옐로카드 아이콘으로 렌더링한다. 서버 응답이 저장된 `payload.card` 값을 공개 DTO에 포함하지 않아 프런트가 레드카드를 구분할 수 없다.

## Acceptance Criteria

- [x] 공개 경기 상세 응답의 카드 이벤트가 `YELLOW` 또는 `RED` 색상을 전달한다.
- [x] 옐로카드는 노란 카드와 `옐로카드`, 레드카드는 빨간 카드와 `레드카드`로 표시한다.
- [x] 골과 알 수 없는 이벤트의 기존 표시 계약을 훼손하지 않는다.
- [x] 백엔드·프런트의 좁은 회귀 테스트와 계약 문서를 함께 갱신한다.

## Progress Snapshot

- 2026-08-15: `PublicTournamentRecordsService.buildEvents()`가 payload를 조회하지 않고, `EventRow`가 모든 비-GOAL 이벤트를 `🟨`로 고정하는 원인을 확인했다.
- 2026-08-15: 공개 응답에 `cardColor`를 추가하고 타임라인을 옐로/레드/확인 필요 상태로 분리했다. API Jest 5/5, Web Vitest 5/5 통과.
- 2026-08-15: 현재 환경에 headed Playwright MCP 세션과 v1 런타임이 없어 실제 라우트 screenshot/console/network 시각 검증은 미실행 상태다.

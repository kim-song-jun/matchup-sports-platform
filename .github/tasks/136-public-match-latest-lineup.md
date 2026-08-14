# Task 136 — 공개 경기 기록 최신 라인업만 노출

## Scope

- Backend: `apps/v1_api/src/games/public-records/**`
- Contract docs: `docs/api/domains/public-records.md`
- No schema or migration change.

## Problem

공개 경기 기록 상세의 라인업 투영이 경기의 모든 `V1GameParticipant`를 side별로 합쳐서, 라인업 저장 때 생성된 과거 revision 참가자까지 전부 노출한다.

## Acceptance Criteria

- [x] 한 side에 라인업 revision이 여러 개면 가장 높은 revision의 참가자만 노출한다.
- [x] home/away는 각 side의 최신 revision을 독립적으로 선택한다.
- [x] 과거 revision 참가자를 참조하는 경기 이벤트의 이름 조회 계약은 유지한다.
- [x] 관련 단위 테스트와 diff 검증이 통과한다.

## Progress Snapshot

- 2026-08-14: 원인을 `PublicTournamentRecordsService.buildLineup()`의 전체 participant side-grouping으로 확인.
- 2026-08-14: side별 최신 revision 필터와 회귀 테스트를 추가. 관련 Jest 24/24 통과.

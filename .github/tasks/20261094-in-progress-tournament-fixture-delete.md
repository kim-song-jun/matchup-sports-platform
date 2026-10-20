# 진행 중 대회 미시작 경기 삭제

Status: Review

## Context
관리자 대진 목록에서 대회가 진행 중이면 SCHEDULED 경기 삭제도 FIXTURE_ALREADY_STARTED로 거절된다.

## Goal
대회 진행 중에도 미시작 경기를 기존 안전 조건 아래 삭제한다. 범위는 backend와 API 문서다.

## Original Conditions
- [x] 대회 in_progress 상태를 허용한다.
- [x] 경기 시작·결과·후속 배정·하위 경기 보호를 유지한다.

## User Scenarios
mutation admin이 진행 중 대회의 미시작 경기를 삭제하면 목록에서 숨기고 기록은 보존한다.

## Test Scenarios
- 진행 중 대회 SCHEDULED/matched 경기 삭제 성공 및 CANCELLED/archived 저장 확인.
- LIVE/종료 경기, 결과 보유 경기, 종료·취소 대회 삭제 거절.
- 기존 권한 및 후속 경기 보호 회귀 테스트 유지.

## Parallel Work Breakdown
단일 에이전트 순차 수행. Owned: tournament-bracket-tx.ts, tournament-bracket.service.spec.ts, API 문서, changeset, 이 문서. Forbidden: 무관한 WIP와 프론트엔드.

## Acceptance Criteria
- [x] in_progress를 허용하고 오류 메시지를 실제 조건과 일치시킨다.
- [x] API 문서와 changeset 동기화.
- [ ] 관련 단위 테스트 실행 통과 및 alpha 삭제 흐름 확인.

## Tech Debt Resolved
대회 진행 여부와 경기 시작 여부를 혼동하는 삭제 조건 및 안내를 수정한다.

## Security Notes
mutation admin, 트랜잭션 잠금, 결과·후속 경기 보호, 감사 이력 보존.

## Risks & Dependencies
로컬 jest 실행 파일이 없어 테스트 실행 불가. Docker 엔진 미가동. alpha 배포·실측 미수행.

## Ambiguity Log
완료·취소 대회 제한은 기존대로 유지한다. 요청은 진행 중 대회의 미시작 경기 삭제다.

## Progress Snapshot
최초 dev cursor ae54635a9. origin/dev fetch 완료. 기존 WIP 보존. 테스트 실행은 pnpm.cmd에서 jest 미설치로 차단됨.

PR 준비: 최신 origin/dev(ae54635a9)에서 격리 worktree 생성. 이번 변경 7개 파일만 포함. diff --check 통과, touched-path debt marker 없음. 로컬 pnpm 의존성 연결이 없어 Jest/tsc 실행 차단. Copilot 리뷰는 사용자 요청으로 생략. alpha 실측은 배포 후 필요.

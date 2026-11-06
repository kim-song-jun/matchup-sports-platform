# Task 20261095: 첫 경기 시작 전 대회 시작 되돌리기

Status: Review
**Owner**: Codex
**Created**: 2026-10-20

## Context
사용자: “대회 시작 눌러도 아직 경기 시작 안했으면 접수 마감 상태로 돌아갈 수 있게 수정”. 선행 PR2002 alpha 배포는 54181088d로 완료·공개 HTTP200/API DB정상 확인 후 착수.

## Goal
실제 시작한 경기가 없는 대회에 한해 in_progress → closed를 허용한다.

## Original Conditions
- [x] 시작 전 경기만 있거나 대진이 없는 대회는 접수 마감 복귀 가능.
- [x] 실제 시작/기록/결과가 있는 대회는 복귀 차단.
- [x] 기존 대회·리그 분리, 관리자 권한, 사유·감사 기록 보존.

## User Scenarios
운영자가 대회 시작을 잘못 누름 → 아직 킥오프 전 → 사유와 함께 접수 마감 복귀. 이미 경기 시작 시 실패 원인 표시.

## Test Scenarios
성공/경기 없는 상태/시작 후 거부/동시 상태 변경/잠금 뒤 재조회/사유 필수/읽기 전용 관리자/리그 제외/기존 완료·취소 되돌리기 회귀.

## Parallel Work Breakdown
서브에이전트 없음. Backend 서비스·테스트 → Frontend 기존 상태 액션·테스트 → API 문서·changeset → 검증·PR.
Owned: tournaments-admin.service.ts/spec, tournament-admin-shared.ts, tournament-admin-shell.tsx/test, api.ts, docs/api, 이 문서. Forbidden: 경기 시작·기록 로직 변경, schema/migration, 공유 WIP, main 승격.

## Acceptance Criteria
- [x] 서버가 트랜잭션에서 재검사하며 상태·감사 기록을 함께 커밋.
- [x] UI A/B/C 제시, 사용자 A안 확정, 기존 버튼·사유 모달 재사용.
- [x] 좁은 RED/GREEN, API/Web 타입 검사·diff/debt 점검.
- [ ] API 문서·fixture/MSW/changeset 동기화 및 dev 대상 PR.
- [ ] alpha 화면 검증은 미배포 변경에서 NOTRUN으로 명시.

## Tech Debt Resolved
상태 변경을 대회 잠금 후 재조회해 이전 상태를 근거로 덮어쓰는 경쟁을 방지한다.

## Security Notes
getMutationAdmin, 대회 kind scope, 사유 필수, 감사 trail 유지. 조회는 가능 여부만 반환하며 저장 시 서버가 재확인한다.

## Risks & Dependencies
Docker Desktop Linux engine이 꺼져 있고 DATABASE_URL이 제공되지 않아 실 DB 9케이스는 미실행이다. 사용자 UI A안 확정. 새 배포는 자동 수행하지 않으며 우선 수정·PR까지 진행.

## Ambiguity Log
‘경기 시작’은 예정 시각이 아니라 실제 운영 상태·시작 이력으로 해석한다. 대회 상태만 되돌리며 대진·신청·명단·기록은 삭제하지 않는다.

## Progress Snapshot
- base54181088d, /tmp/teameet-tournament-revert, feat/tournament-revert-before-first-game.
- 기존 transaction advisory/row/game 잠금 순서와 상태 action/reason dialog를 조사.
- 사용자 A안 선택: 기존 상태 되돌리기 버튼과 사유 입력 창 재사용. 상세 canRevertStart로 버튼을 제어하며 서버는 게임 잠금 뒤 다시 검사한다.
- API 변경 전 focused RED: 신규·확장 5개 FAIL / 기존 2개 PASS. 변경 후 서비스 전체130/130 PASS.
- UI 변경 전 RED: 신규 흐름1개 FAIL / 기존10개 PASS. 변경 후11/11 PASS.
- API touched source/spec + DB integration spec를 포함한 scoped tsc PASS. 최초 integration fixture composite FK type 오류를 고친 뒤 재검사 PASS. Web tsc PASS, 패턴 검사 PASS.
- 실제 DB 통합9개 추가(무대진·예정/자동명단·LIVE/PAUSED/ENDED·취소+이력·미시작취소·결과·리그 분리). Docker unavailable/DATABASE_URL 미제공으로 NOTRUN, CI 실행 대상에 자동 포함.
- alpha 로그인 브라우저 도구 및 미배포 변경 때문에390/768/1440 화면·console/network NOTRUN. 선행 배포 완료 확인과 이 기능의 화면 검증을 혼동하지 않는다.
- diff --check PASS, touched source 신규 debt marker 없음, 임시 node_modules symlink는 커밋 제외.

# 운영콘솔 경기 출전 명단 편집

Status: Review

## Context
대회 운영콘솔 하단의 도착 검인이 팀이 관리하는 경기별 출전 명단과 다른 조작을 제공한다.

## Goal
팀이 설정한 최신 경기 명단을 조회 상태로 보여주고, 운영자가 명시적으로 편집·저장하면 같은 경기 명단에 반영한다.

## Original Conditions
- [x] 대회 콘솔 전원 도착 버튼 제거.
- [x] 기본 조회, 수정하기, 저장·취소 제공.
- [x] 팀의 기존 경기별 조정·제외 상태 사용. 대회 공통 명단·다른 경기 불변.
- [x] 골·도움·파울·카드 기록에서 제외 선수 사용 차단.

## User Scenarios
운영자가 팀의 출전 명단을 확인하고 수정하기로 일부 선수를 제외한 뒤 저장한다. 팀 화면과 경기 운영에 같은 명단이 반영된다. 취소는 서버를 변경하지 않는다.

## Test Scenarios
조회 상태, 기존 팀 제외 상태, 편집·취소, 실제 API 요청 후 조회 반영, 권한·시작 잠금, 저장 오류·부분 실패, 외부 변경 충돌, 기록 대상 검증.

## Parallel Work Breakdown
단일 에이전트. Owned: 대회 운영콘솔·킥오프 준비·신규 출전 패널 및 관련 테스트, 필요한 경기 이벤트 검증과 API 문서, changeset. 기존 리그 패널·공통 대회 명단·다른 WIP 변경 금지. 단건 조정 POST/DELETE fixture가 빠져 있어 기존 상태형 MSW에 동일 권한·시작 제한과 함께 보완.

## Acceptance Criteria
- [x] 사용자가 지정한 조회→수정→저장·취소 디자인을 구현 기준으로 사용.
- [x] 기존 경기별 조정 API·권한을 재사용.
- [x] 관련 테스트와 diff 검증, alpha 검증 여부 기록.

## Tech Debt Resolved
대회 콘솔에서 도착 검인용 변경 경로를 제거하고 경기 출전 명단을 단일 원천으로 사용.

## Security Notes
기존 서버의 운영자 인가와 경기 시작 전 편집 제한 유지. 제외 선수의 과거 participant ID로 기록하지 못하게 검증.

## Risks & Dependencies
경기 시작 이후 편집은 기존 계약대로 금지. 여러 선수 변경은 기존 단건 API를 직렬 호출하며 부분 실패를 명시하고 실제 명단을 다시 조회한다.

## Ambiguity Log
범위는 대회 경기 운영콘솔. 리그 기존 동작은 유지. 대회 공통 참가 선수 추가·번호·GK 설정은 변경하지 않는다.

## Progress Snapshot
origin/dev 9b761fc3a 기반 fix/console-game-roster-edit 격리 작업트리. PR 생성 완료, alpha 배포 진행 중. 검증은 WSL의 기존 의존성을 재사용했다. 오래된 Prisma 클라이언트로 서버 테스트가 막혀 `prisma generate`로 타입만 재생성했다(DB 변경 없음).

## Validation Evidence
- CLI: `vitest run` 단일 worker — operate-console 102개, kickoff-checklist 8개 통과. 기존 React act/key 경고는 해당 스위트에서 관찰됨.
- CLI: tournament-participation-panel 11개 통과. 초기 조회/팀 제외 상태/취소/제외 저장/복귀 저장/다른 경기 불변/ADMIN 변경 주체/외부 변경/실패·부분 저장/출전정지/권한·시작 제한을 상태형 MSW와 실제 훅으로 검증.
- CLI: 서버 helper 5개 통과. 실제 이벤트 검증 경계는 GOAL/FOUL/CARD를 테스트.
- API `pnpm lint` (tsc + surface check) 통과. Web `pnpm lint` (tsc + pattern check) 통과.
- `git diff --check` 통과. touched path debt grep: docs/api/domains/games.md의 기존 Todo 11 설명만 발견, 신규 marker 없음. 신규 import는 이 작업의 신규 소스에만 의존.
- Alpha manual QA: 미실행. 변경 미배포이고 이 세션에 브라우저 도구가 없어 390/768/1440 before/after 및 console/network 판정은 대기. CLI 테스트를 시각 검증으로 대체하지 않는다.
- Cleanup: 테스트 프로세스 종료 확인 후 이 작업에서 만든 node_modules 링크만 해제. 로컬 Web/API 서버·DB를 띄우지 않음.
- PR created; alpha deployment in progress. 기존 공유 dev WIP 보존. PR-ready 판정 없음.

## PR / Deployment Cursor — 2026-10-21
- PR: https://github.com/kim-song-jun/matchup-sports-platform/pull/2011 (base dev).
- 최신 dev 통합 완료. GitHub CI와 Copilot 최신 head 리뷰를 통과한 후 dev에 머지하고 alpha 배포 receipt·health를 검증한다.
- 사용자가 세 PR 생성 후 alpha 배포까지 승인함. main 승격은 범위 밖.

# 대회 경기 상세 참가 선수 관리 진입 제거

Status: Review

## Context
공개 대회 경기 상세에 대회 공통 명단 설정 진입이 중복되어 있다.

## Goal
요청한 안내·링크 행을 대회 경기 상세에서 숨기고 우리팀 경기의 관리 경로를 유지한다.

## Original Conditions
- [x] 선수·번호·GK 안내와 참가 선수 관리 링크를 함께 숨긴다.
- [x] 이번 경기 출전 관리와 우리팀 경기 명단 화면은 유지한다.

## User Scenarios
대회 경기 상세에서는 출전 요약과 이번 경기 출전 관리를 확인한다. 참가 선수 관리는 우리팀 경기 명단 화면에서 접근한다.

## Test Scenarios
- 숨김 옵션의 실제 카드 렌더에서 관리 링크·안내 부재와 경기 출전 관리 존재를 검증하는 테스트 추가.
- 기존 기본 옵션의 관리 링크 테스트는 유지.
- 실행 blocker: 기존 node_modules에 Windows vitest.cmd가 없어 실행 실패. 테스트 통과 주장 없음.
- Alpha URL 읽기 실패. 변경은 미배포 상태이며 390/768/1440 화면·console/network 검증 대기.

## Parallel Work Breakdown
단일 에이전트. Owned: 대회 match-page-client.tsx, match-team-roster-card.tsx 및 해당 카드 테스트, changeset, 이 문서. 다른 WIP와 우리팀 경기 명단 화면은 변경하지 않는다.

## Acceptance Criteria
- [x] 사용자가 제공한 제거 범위를 그대로 적용한다(별도 디자인 선택 불필요).
- [x] 공통 카드 기본 동작과 리그 경기 상세는 유지한다.
- [ ] 테스트 실행 및 alpha 시각 검증.

## Tech Debt Resolved
중복 관리 진입을 화면별 옵션으로 제어한다. 신규 debt marker 없음.

## Security Notes
권한·API 계약 변경 없음.

## Risks & Dependencies
Windows에서 사용 가능한 의존성 설치와 alpha 배포 후 브라우저 검증이 필요하다.

## Ambiguity Log
명시된 대회 경기 상세만 대상으로 해석. 리그 경기 상세와 우리팀 출전 관리의 참가 선수 관리 진입은 유지한다.

## Progress Snapshot
격리 브랜치 fix/tournament-match-roster-entry-20261020, origin/dev 9b761fc3a 기반. diff --check 통과. 개발 커밋과 PR 생성 완료. Alpha 배포 진행 중.
## PR / Deployment Cursor — 2026-10-21
- PR: https://github.com/kim-song-jun/matchup-sports-platform/pull/2010 (base dev).
- 최신 dev 통합 완료. GitHub CI와 Copilot 최신 head 리뷰를 통과한 후 dev에 머지하고 alpha 배포 receipt·health를 검증한다.
- 사용자가 세 PR 생성 후 alpha 배포까지 승인함. main 승격은 범위 밖.
- 이전 Windows 실행 blocker는 WSL 검증으로 해소. 경기 명단 카드 테스트 17개 통과. Web 타입·규칙 검사 진행 중.

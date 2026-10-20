# 대진 직접 입력 생성 후 화면 오류

Status: Review

## Context
사용자 제보: `/admin/tournaments/ad200600-0000-4000-8000-000000000002/bracket?view=list`에서 직접 입력 후 생성하면 global-error의 ‘화면을 다시 불러올 수 없어요’가 나타난다.

## Goal
성공한 경기 생성 응답을 목록의 상세 객체로 잘못 사용하지 않고, 최신 상세 조회 후 수정창을 연다.

## Original Conditions
- [x] 직접 입력으로 경기 생성 후 화면이 깨지지 않는다.
- [x] 기존 경기 생성·수정 경로와 권한 유지.
- [x] 이미 생성된 경기의 후속 조회 실패를 생성 실패와 구분한다.

## User Scenarios
운영자가 직접 입력으로 경기를 생성한다. 생성 API의 요약 응답에서 ID를 받고, 대진 목록을 재조회한 실제 경기 정보로 수정창을 연다.

## Test Scenarios
실제 생성 응답처럼 game/result/slot/name 필드가 없는 응답으로 생성→수정창 열기를 재현한다. 조회 실패와 조회 결과 누락도 명시적으로 표시한다.

## Parallel Work Breakdown
단일 에이전트. Owned: bracket-tab/group-card 및 관련 테스트, 생성 응답 타입·훅, 해당 API 문서와 changeset. 다른 작업트리 및 공유 dev WIP는 변경하지 않는다.

## Acceptance Criteria
- [x] RED→GREEN 재현 테스트.
- [x] 실제 생성 응답 타입을 상세 목록 타입과 분리.
- [x] 좁은 테스트·타입 검사·diff 확인 및 alpha 검증 상태 기록.

## Tech Debt Resolved
생성 API의 요약 응답을 V1AdminBracketFixture로 잘못 선언한 계약 불일치.

## Security Notes
권한·저장 로직·DB 스키마 변경 없음. 대회 생성 등 실제 alpha 쓰기 재현은 수행하지 않는다.

## Risks & Dependencies
Alpha 인증 브라우저 도구가 제공되지 않아 실화면 before/after 검증은 배포 후 필요.

## Ambiguity Log
사용자 오류 문구가 전역 오류 경계와 일치. 코드의 생성 응답에 game이 없고 fixtureTeamChangeAccess가 game.hasOfficialResult를 읽는 경로를 회귀 테스트로 확인한다.

## Progress Snapshot
origin/dev ae54635a9 기반 fix/manual-bracket-create-crash. 미커밋·미배포.

## Validation Evidence
- RED: 실제 생성 요약 응답을 사용한 직접 입력→수정창 테스트에서 `TypeError: Cannot read properties of undefined (reading 'hasOfficialResult')`, `fixtureTeamChangeAccess` 위치로 실패함을 확인했다.
- GREEN: bracket-tab, bracket-group-card, 생성·공개 캐시 관련 3개 파일, 총 66개 테스트 통과(단일 worker). 수정창이 요약 응답의 기본값이 아니라 재조회한 경기장·표시 문구를 사용하는지 확인했다. 후속 조회 오류/생성 ID 누락 시 오류 안내와 생성 요청 1회 유지도 확인했다.
- 생성 API의 요약 응답을 읽는 두 훅을 V1CreateFixtureResponse로 정정했다. DB·서버 API 계약 변경 없음.
- `git diff --check` 통과. touched path TODO/FIXME/HACK/XXX 신규 marker 없음. 신규 소스 import/route 의존성 없음.
- Alpha 실화면 검증은 대기: 변경 미배포, 인증 브라우저 도구 없음. 요청 URL의 일반 웹 도구 접근도 실패했다. screenshots/console/network 결과를 추정하거나 테스트 통과를 실화면 PASS로 표시하지 않는다.
- 로컬 Web/API·DB 서버를 띄우지 않았다. 검증 종료 후 이 작업에서 만든 의존성 링크 두 개만 해제한다.
- 기존 dev WIP 및 이전 작업트리 보존. 커밋·push·배포 없음. PR-ready 판정 없음.
- Web pnpm lint: tsc --noEmit 및 v1-pattern-check 모두 통과.

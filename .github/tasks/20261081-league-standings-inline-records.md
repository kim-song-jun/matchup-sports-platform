# Task 20261081: 리그 순위의 전적 펼침과 진행률

Status: Review
**Owner**: root
**Created**: 2026-10-14

## Context
사용자가 지정한 리그 aef0d98f-17eb-4590-b27d-a2d8bab765e6의 /bracket 순위에 조별 순위처럼 전적 펼침과 상세 통합 순위의 퍼센트 바를 요청했다.

## Goal
리그 순위에서 팀별 경기 결과를 바로 펼치고 상세와 동일한 진행률을 확인한다.

## Original Conditions (must all be satisfied)
- [x] 펼침 버튼으로 행 아래 간단한 전적을 표시한다.
- [x] 상세 통합 순위와 같은 상단 진행률 바를 표시한다.
- [x] 사용자 지정 기존 UI 패턴을 재사용한다(사용자 최초 요청과 진행 지시로 방향 확정).

## User Scenarios
리그 순위 탭에서 진행률을 보고 팀의 전적 버튼을 펼쳐 홈/원정, 상대, 점수, 승무패를 확인하고 다시 접는다.

## Test Scenarios
### Happy path
- [x] 펼침/접힘과 홈·원정 결과 및 진행률 API 값 검증.
### Edge cases
- [x] 페이지네이션, 비공개 팀, 확정 전·라이브·취소·무효 상태 검증.
### Error paths
- [x] 진행률/전적 추가 조회 실패를 오류와 재시도로 표시.
### Mock data updates needed
신규 테스트의 공개 일정/통합 순위 응답을 현행 API 타입으로 작성. API·DB 계약 변경 없음.

## Parallel Work Breakdown
단일 에이전트 직렬 실행. Owned: bracket-page-client.tsx와 테스트, tournament-standings-table.tsx, league-standings-table.tsx, 신규 진행률/전적 컴포넌트와 테스트, 개선량 반영용 tint/radius baseline, task와 Changeset, before 캡처. Forbidden: API/DB, 다른 작업트리 및 기존 WIP.

## Acceptance Criteria
- [x] 원본 두 조건 구현 및 좁은 회귀 테스트 통과.
- [x] diff/whitespace/새 debt marker 확인.
- [ ] alpha 390/768/1440 화면과 console/network 검증.

## Tech Debt Resolved
진행률 마크업을 공용화해 상세와 순위 화면 간 표시 drift를 방지한다.

## Security Notes
기존 공개 API만 사용. 비공개 팀은 펼침 비활성, 공개 점수 정책을 준수하며 확정 전 점수를 승무패로 확정하지 않는다.

## Risks & Dependencies
alpha 검증은 변경 배포 이후에 가능. 로컬 next 서버는 띄우지 않는다.

## Ambiguity Log
사용자가 조별 순위 펼침과 상세 통합 순위를 시각/동작 기준으로 지정했다. 기존 패턴 재사용으로 확정.

## Progress Snapshot
최신 origin/dev 792042b7d, fix/league-standings-expand 격리 작업트리. 코드 구현과 로컬 검증 완료. 커밋·PR·dev 머지·alpha after 검증 전이며 배포 완료로 주장하지 않는다.

## Validation Evidence
- 기존 bracket/공용 표/통합 순위 59 tests PASS. 신규 전적 6 tests + bracket 40 tests PASS. 이후 실제 bracket 상단 진행률 연결 1 test PASS. 중복 제외 67 tests.
- `pnpm --filter v1_web lint`: `tsc --noEmit` PASS 이후 패턴 검사에서 Windows cmd의 Unix 명령 불가로 실패. 원본 패턴 검사만 Git Bash shell로 재실행해 신규 tint marker 및 감소한 baseline을 맞춘 뒤 PASS. 전체 tsc는 반복하지 않았다.
- `git diff --check` PASS. touched paths의 새 TODO/FIXME/HACK/XXX 없음. 신규 import 파일 모두 이 작업트리 내 존재.
- 실제 alpha 공개 API: `/standings/overall` HTTP 200, total 3 / played 2 / remaining 1 / percent 67; `/schedule` HTTP 200, 3 teams / 11 items / nextCursor null. 진행률을 조회 페이지 수에서 계산하지 않는다.
- alpha before, 비로그인 persona: `/bracket?tab=standings`, headed Chrome 390/768/1440×900에서 순위 API 로드 후 table 1, viewport overflow false, pageerror/API 4xx·5xx 0. `docs/screenshots/league-standings-inline-records-2026-10-14/before-{390,768,1440}.png`.
- QA browser PID/PPID: 최초 11584/27888, 데이터 로드 완료 캡처 25872/29640. 각 owned browser/server는 finally에서 종료. 첫 캡처는 로딩 상태였으므로 같은 경로를 실제 팀명 로드 완료 후 다시 캡처했다.
- alpha after: 미배포로 미검증. 커밋 트리/PR 기준 검증도 미실행이며 PR-ready 또는 기능 최종 완료로 주장하지 않는다.

## Deployment Progress
사용자 2026-10-14 배포 승인. PR #1915, base dev. 추가 페이지 오류가 상위 순위의 로딩/오류 분기에 가려지던 문제를 보완했고 실제 bracket 경로 재시도 테스트 1건을 추가해 PASS(중복 제외 총 68 tests). CI 및 Copilot clean gate 진행 중.

PR CI 38490985583: Gates/API PASS, Web 9006/9007 PASS. `tm-btn-size.test.ts`가 더 보기 버튼의 표준 size modifier 누락을 잡아 `tm-btn-sm`을 추가했다. 실제 터치 타깃은 기존 44px 토큰을 유지한다.

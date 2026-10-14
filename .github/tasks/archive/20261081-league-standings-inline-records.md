# Task 20261081: 리그 순위의 전적 펼침과 진행률

Status: Done
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
단일 에이전트 직렬 실행. Owned: bracket-page-client.tsx와 테스트, tournament-standings-table.tsx, league-standings-table.tsx, 신규 진행률/전적 컴포넌트와 테스트, 개선량 반영용 tint/radius baseline, task와 Changeset, before/after 캡처, `scripts/qa/verify-league-standings-alpha.cjs`. Forbidden: API/DB, 다른 작업트리 및 기존 WIP.

## Acceptance Criteria
- [x] 원본 두 조건 구현 및 좁은 회귀 테스트 통과.
- [x] diff/whitespace/새 debt marker 확인.
- [x] alpha 390/768/1440 화면과 console/network 검증.

## Tech Debt Resolved
진행률 마크업을 공용화해 상세와 순위 화면 간 표시 drift를 방지한다.

## Security Notes
기존 공개 API만 사용. 비공개 팀은 펼침 비활성, 공개 점수 정책을 준수하며 확정 전 점수를 승무패로 확정하지 않는다.

## Risks & Dependencies
배포와 검증 완료. 로컬 next 서버는 띄우지 않았다. 비로그인 신원 probe인 `/api/v1/auth/me`의 정상 401은 배포 전 상세에서도 확인했고, 같은 경로/상태만 별도로 기록했다. 다른 경로의 실패를 숨기지 않는다.

## Ambiguity Log
사용자가 조별 순위 펼침과 상세 통합 순위를 시각/동작 기준으로 지정했다. 기존 패턴 재사용으로 확정.

## Progress Snapshot
PR #1915가 dev에 머지됐다. 머지·실배포 SHA: `3e8007a2f89b649c0204224b6f007d26baba92b9`. Alpha release: `1.9.0-alpha.20261014.g3e8007a2f89b`. 배포와 390/768/1440px 공개 사용자 검증 완료. 로컬 dev도 해당 SHA로 fast-forward 동기화했다. 이 문서와 최종 QA 증거는 완료된 기능 브랜치에 별도 기록하며 런타임 재배포를 발생시키지 않는다.

## Validation Evidence
- 기존 bracket/공용 표/통합 순위 59 tests PASS. 신규 전적 6 tests + bracket 40 tests PASS. 이후 실제 bracket 상단 진행률 연결 1 test PASS. 중복 제외 67 tests.
- `pnpm --filter v1_web lint`: `tsc --noEmit` PASS 이후 패턴 검사에서 Windows cmd의 Unix 명령 불가로 실패. 원본 패턴 검사만 Git Bash shell로 재실행해 신규 tint marker 및 감소한 baseline을 맞춘 뒤 PASS. 전체 tsc는 반복하지 않았다.
- `git diff --check` PASS. touched paths의 새 TODO/FIXME/HACK/XXX 없음. 신규 import 파일 모두 이 작업트리 내 존재.
- 실제 alpha 공개 API: `/standings/overall` HTTP 200, total 3 / played 2 / remaining 1 / percent 67; `/schedule` HTTP 200, 3 teams / 11 items / nextCursor null. 진행률을 조회 페이지 수에서 계산하지 않는다.
- alpha before, 비로그인 persona: `/bracket?tab=standings`, headed Chrome 390/768/1440×900에서 순위 API 로드 후 table 1, viewport overflow false, pageerror/API 4xx·5xx 0. `docs/screenshots/league-standings-inline-records-2026-10-14/before-{390,768,1440}.png`.
- QA browser PID/PPID: 최초 11584/27888, 데이터 로드 완료 캡처 25872/29640. 각 owned browser/server는 finally에서 종료. 첫 캡처는 로딩 상태였으므로 같은 경로를 실제 팀명 로드 완료 후 다시 캡처했다.
- 배포 전 source PR diff는 본 작업의 14개 파일만 포함하고 `git diff --check`를 통과했다. 신규 런타임 import는 모두 커밋에 포함됐다.

## Deployment Progress
사용자 2026-10-14 배포 승인. PR #1915, base dev. 추가 페이지 오류가 상위 순위의 로딩/오류 분기에 가려지던 문제를 보완했고 실제 bracket 경로 재시도 테스트 1건을 추가해 PASS(중복 제외 총 68 tests).

PR CI 38490985583: Gates/API PASS, Web 9006/9007 PASS. `tm-btn-size.test.ts`가 더 보기 버튼의 표준 size modifier 누락을 잡아 `tm-btn-sm`을 추가했다. 실제 터치 타깃은 기존 44px 토큰을 유지한다.

- Copilot 결과가 장시간 도착하지 않아 사용자에게 AGENTS.md S6 예외를 요청했다. 사용자 답변: **예외 승인: CI 통과 후 alpha 배포**. 이번 PR에 한해 자체 검토·CI·미해결 스레드 0으로 진행했다. PR 본문에도 승인 근거를 기록했다.
- 수정 후 PR CI `38492101830`: Gates/API/Web PASS. 표준 버튼 검사까지 직접 실행한 중복 제외 로컬 관련 검증은 69 tests.
- dev 머지 후 push CI `38493462018`: Gates/API/Web PASS. Alpha workflow `38493462223`: SUCCESS.
- 공개 `/landing` 헤더의 SHA가 머지 SHA와 일치하고 release는 위 값이었다. `/api/v1/health` HTTP 200, `data.checks.db === true`.

## Alpha After Evidence

- Persona: 비로그인. 사용자가 지정한 전체 `/bracket?from=...` URL에서 실제 `리그 순위` 탭을 클릭했다.
- 390/768/1440×900: 세 팀 전부 펼침·키보드 Enter 접힘을 확인했다. **9/9 팀·viewport 사례 PASS**. 각 팀은 실제 공개 일정과 일치하는 6개 행을 표시했다.
- 진행률은 두 화면 모두 실제 overall API와 일치하는 2/3경기·67%였다. 순위 화면과 대회 상세 모두 page overflow false, 총 6/6 route·viewport PASS.
- 모바일 팀명은 전체 이름을 보존한 두 줄 표시다. 44px 펼침 터치 타깃과 전적·승점·득실 5컬럼을 유지한다. 태블릿·데스크톱에서도 순위 맥락을 유지했다.
- pageErrors 0, 예상하지 않은 HTTP 실패 0. 상세의 기존 `/auth/me` 401 세 건과 해당 브라우저 resource 메시지는 `after-report.json`에 그대로 남겼다.
- PID/PPID: 최초 after 32428/12504, 내부 스크롤을 맞춘 최종 after 13252/15608. browser/server 모두 finally에서 종료했다. 별도 before 상세 캡처 11628/31396, 401 경로 확인 5196/3508도 종료했다.
- 증거: `docs/screenshots/league-standings-inline-records-2026-10-14/after-{390,768,1440}.png`, `after-expanded-*.png`, `after-detail-*.png`, `after-report.json`.
- 순위 화면 before는 실제 표를 보여준다. 상세 before는 상단 캡처여서 통합 순위 영역의 시각 baseline이 없으며, 배포 전 DOM의 67%와 배포 후 해당 영역 스크롤 캡처로 검증했다. 캡처를 편집해 before를 만들어내지 않았다.
- 재현: `node scripts/qa/verify-league-standings-alpha.cjs '<사용자가 지정한 alpha bracket URL>'`.

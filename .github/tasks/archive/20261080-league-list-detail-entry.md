# Task 20261080: 리그 목록의 이전 상세페이지 연결 복구

Status: Done
**Owner**: root
**Created**: 2026-10-14

## Context
사용자는 `/tournaments?kind=league`의 카드가 최근 변경 이후 `/league-matches/:id`로 이동하는 대신 이전 `/tournaments/:id` 상세로 이동하기를 요청했다. 변경 커밋은 `872f5a0b6`이며, 기존 상세 및 공개 상세 API는 제보한 실제 리그에서 HTTP 200을 반환한다.

## Goal
통합 대회·리그 목록의 리그 카드가 기존 상세로 연결되고 목록 복귀 URL을 보존한다.

## Original Conditions (must all be satisfied)
- [x] 리그 목록 카드 목적지를 `/tournaments/:id`로 복구한다.
- [x] `from=/tournaments?kind=league`와 추가 목록 필터를 보존한다.
- [x] 최신 `origin/dev`에서 격리 작업하고 공유 트리 변경을 보존한다.

## User Scenarios
방문자가 리그 목록에서 카드를 선택하면 이전 상세의 소개·신청 정보를 확인하고 뒤로가기로 원래 목록 필터에 돌아온다.

## Test Scenarios
### Happy path
- [x] 실제 TournamentCard의 리그 링크 목적지와 전체 from 값을 검증한다.
### Edge cases
- [x] 종류 필터·종목·상태·페이지 복귀 쿼리를 보존한다.
- [x] from 없는 리그와 일반 대회 링크는 `/tournaments/:id`다.
### Error paths
- [x] 미존재 상세의 기존 오류 처리를 변경하지 않는다.
### Mock data updates needed
기존 실제 카드 fixture를 재사용하며 API·schema·MSW 계약 변경은 없다.

## Parallel Work Breakdown
단일 에이전트가 직렬 실행한다. Owned: `apps/v1_web/src/app/tournaments/tournament-card.tsx`, 해당 테스트, 이 task와 Changeset. 배포를 막는 기존 CI 실패 수정을 위해 `apps/v1_web/src/components/auth/email-login-client.test.tsx`, `apps/v1_api/test/league-matches/league-slot-cancel-regenerate.integration-spec.ts` 테스트만 추가한다. Forbidden: 홈 카드, 공용 상세/경기 링크 helper, API 제품 코드·schema, 공유 작업트리의 기존 수정.

## Acceptance Criteria
- [x] 요청한 목록 링크·복귀 계약과 카드 회귀 검증 통과.
- [x] diff 범위 및 whitespace 검사 통과.
- [x] alpha 배포 후 실제 카드 클릭을 통한 이동 검증. 로컬 검증과 구분해 보고한다.

## Tech Debt Resolved
최근 링크 변경을 단언하던 테스트를 사용자 요청 경로 및 정확한 복귀 쿼리 계약으로 교체한다.

## Security Notes
기존 `withFromPath`의 내부 경로 검증을 재사용한다. 인증·신청·권한 계약을 변경하지 않는다.

## Risks & Dependencies
통합 목록의 링크 복구와 실제 alpha 검증을 완료했다. 홈 리그 카드와 순위·일정용 링크는 그대로 둔다. 문의 영역이 비로그인 상태를 확인하는 `GET /auth/me` 401 `UNAUTHENTICATED`는 제품의 `api-client.ts:isExpectedGuestAuthProbe` 계약에 맞는 정상 거절이며, 원본 console/network 증거에 별도로 남겼다. main 승격은 실행하지 않았다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-14 | root | 이전 상세 경로 | 변경 커밋과 현재 v1 route를 교차 확인: `/tournaments/:id`, 제보 리그 HTTP 200 |
| 2026-10-14 | root | 복구 범위 | 사용자가 제보한 `/tournaments?kind=league` 카드만 수정 |

## Progress Snapshot
- Base: `origin/dev=d10ce4df4`. Worktree: `/tmp/teameet-league-detail-entry-20261014`; branch `fix/league-detail-entry-20261014`.
- Alpha CLI: 제보한 기존 `/tournaments/aef0d98f-17eb-4590-b27d-a2d8bab765e6` 상세 및 `/api/v1/tournaments/:id` 모두 HTTP 200; API kind=`regular_league`, status=`in_progress`.
- 카드 실제 링크 RED: 신규 3개 실패, 기존 60개 통과. 최소 링크 수정 후 카드 63/63 PASS; 로그 `/tmp/teameet-league-detail-green.log`.
- 목록 종류·리그 렌더 consumer 26/26 PASS; 로그 `/tmp/teameet-league-list-green.log`. 최초 실행은 최신 dev의 persistence/validator 의존성이 로컬 설치본에 없어 import 단계에서 실패했다. 최신 선언 버전을 `/tmp/teameet-league-validation-deps`에 설치해 격리 검증했으며 공유 설치본·manifest는 수정하지 않았다.
- diff check PASS, touched source/test의 새 TODO/FIXME/HACK/XXX 0. 홈·공용 라우트 helper·API 변경 0.
- 실제 headed 브라우저는 Chromium PID 2653에서 `libnspr4.so` 부재로 종료(code127); 생성한 임시 프로필은 Playwright가 정리했고 해당 PID 잔류 없음. 실제 브라우저 클릭·console/network·viewport 검증은 미실행이며 CLI HTTP 200을 대체 근거로 주장하지 않는다.
- 공유 작업트리 dev 동기화: 코드 내용이 index/HEAD와 같은 CRLF 파일 16개를 확인하고 원본 백업 `/tmp/teameet-dev-sync-backup-20261014-003007`을 생성했다. 파일 원복 없이 해당 경로 index만 갱신(staged diff0)하여 `git -c core.autocrlf=true merge --ff-only origin/dev` 성공. HEAD/origin/dev=`d10ce4df4`; 기존 기타 변경·untracked 파일 보존.
- 구현 단계 종료 시점에는 commit/push/merge/배포하지 않았으며 alpha 목록 링크는 기존 배포 상태였다.
- 최신 선언 의존성과 validator 타입을 임시 검증 공간에 맞춘 후 전체 Web `tsc --noEmit` PASS; 로그 `/tmp/teameet-league-detail-typecheck-final.log`. 최초 타입 오류는 오래된 로컬 React Query와 누락된 persistence/validator 패키지·타입으로 발생했고 제품 코드 변경 없이 해소됐다.
- 검증한 코드·테스트 및 task·Changeset 4개 파일을 최신화한 메인 dev 작업트리에 반영했다. 기존 tracked source 두 파일은 HEAD와 내용이 동일한지 확인한 뒤 기존 CRLF를 보존했고, 테스트한 격리 소스와 내용 동일성을 재확인했다. 기타 기존 변경은 유지했다.
- 사용자 후속 요청 `배포해줘`에 따라 dev PR → 최신 head Copilot clean/CI → merge → alpha 배포 및 실제 링크 검증을 진행한다. main 승격은 범위 밖이다.
- Web 패턴 검사 PASS. 처음 sandbox에서 child shell 실행 EPERM으로 중단되어 같은 읽기 전용 검사를 제한 밖에서 실행했다. 반복 전체 test/build는 실행하지 않는다.
- 착수 fetch 후 origin/dev는 동일한 `d10ce4df4`다. 직전 alpha run 38416474964와 38415881913은 failure여서 실패 단계와 CI 상태를 별도로 조사 중이다.
- PR #1908, head `0278bb95b`, base dev. 직전 dev CI 38416474799의 Web 로그인 복귀 테스트 1건은 변경된 sessionStorage 복귀 계약과 불일치했다. 실제 consumer 로컬 RED 1 FAIL/6 PASS(`/tmp/teameet-deploy-email-login-red.log`); 필수 약관 경로, 저장된 원 목적지, 최종 이동·소비를 함께 검증하도록 동기화했다.
- 같은 CI API 통합 실패는 단건 리그 취소가 팀 이름을 비동기로 조회한 뒤 알림을 발송하는데 테스트가 응답 직후 spy count를 검사한 race다. 기존 HTTP 200·spy 2회 검증을 유지하고 실제 `V1Notification` 2행의 양 팀 owner 수신자 및 팀 이름·취소 사유 저장을 기다려 검증한다. API 제품 코드·권한·DB schema 변경은 없다. 관련 테이블은 조회·검증하는 기존 `V1Notification`, `V1Team`이며 migration은 필요하지 않다. DB 실측은 PR CI가 수행한다.
- 배포 blocker 테스트 수정 후 로그인·복귀 경로 31/31 PASS(`/tmp/teameet-deploy-email-login-green.log`), Web incremental 타입 검사 PASS(`/tmp/teameet-league-detail-typecheck-deploy.log`), API 표면 검사 PASS. 브라우저 공유 라이브러리는 시스템 설치 없이 `/tmp/teameet-browser-runtime-libs`에 추출해 headed 기동에 성공했고 현재 alpha 목록의 원래 `/league-matches/:id` 링크를 실제 브라우저로 재확인했다.

### Final deployment and QA
- PR [#1908](https://github.com/kim-song-jun/matchup-sports-platform/pull/1908), head `ffe2f098e`: [PR CI 38428039499](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/38428039499) Gates/Web/API PASS. 사용자 승인 “이번에만 Copilot 없이 alpha 배포 진행”을 [PR 코멘트](https://github.com/kim-song-jun/matchup-sports-platform/pull/1908#issuecomment-6150168557)에 기록한 일회성 예외로 적용했다. 직접 코드 검토에서 요청 경로·정확한 from·권한 변경 없음·실제 DB 수신자 검증을 확인했다.
- dev merge `439e4d2e045ccbf00c4f718271f444f0024a6e09`, [dev CI 38430412013](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/38430412013) PASS. 동시 PR #1907 머지로 구 배포 38430411972는 success로 끝났지만 최신 dev 보호 게이트가 실제 서버 활성화를 생략했다. 최초 브라우저 검증의 서빙 SHA 단언이 이를 검출했다. 구 run 성공을 실제 배포 완료로 취급하지 않았다.
- 최종 서빙 SHA `e6cecf51fb95425955eafe942e8b44b719ccf556`는 PR1908 merge를 포함하며 카드 소스 변경은 유지된다. [최신 dev CI 38432476504](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/38432476504) PASS, [Alpha 38432476754](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/38432476754)의 SSM 활성화 및 공개 release identity 검증 모두 PASS. `/landing` 헤더의 release=`1.9.0-alpha.20261014.ge6cecf51fb95`, commit=e6cecf51f와 공개 health DB=true를 재확인했다. 로컬 dev도 e6cecf51f로 FF 동기화했다.
- 비로그인 공개 방문자, **390×900 / 768×900 / 1440×900 — processed 3/3 PASS**. 실제 카드 클릭 → `/tournaments/aef0d98f-17eb-4590-b27d-a2d8bab765e6?from=%2Ftournaments%3Fkind%3Dleague` → 실제 화면 뒤로가기 링크 클릭 → `/tournaments?kind=league`. DOM 뒤로가기 href와 전체 from 값을 함께 검증했다.
- 세 폭 모두 document 가로 넘침=false, pageerror0, 예상하지 못한 console/API 실패0. 비로그인 auth/me 401은 실제 응답 body의 `UNAUTHENTICATED`와 연결된 console URL을 확인해 따로 기록했다. 다른 401·403·5xx·하이드레이션·이동 오류를 허용하지 않는다. 문의 컴포넌트의 guest 판정과 API client의 정상 guest probe 계약을 교차 검증했다.
- 배포 전 SHA614b4f440의 목록·기존 연결 상세와 배포 후 SHAe6cecf51f의 목록·복구 상세를 각3폭 캡처했다. 최종 after 이미지는 route progress, 폰트, 보이는 이미지 로딩이 끝난 뒤 캡처했다. 증거: `docs/screenshots/task20261080-league-detail-entry/`의 PNG12개, before/after results JSON 및 PID/PPID 기록. 검증 도구 `scripts/qa/verify-league-list-original-detail.cjs`는 항상 headed다.
- 마지막 owned Node11660/Chromium11673 및 기록된 자식 트리는 browser.close 후 종료됐고 PID 잔류0이다. 로컬 Next 서버·MCP·alpha DB 변경·seed/reset은 실행하지 않았다. 기타 공유 트리의 WIP는 유지했다.

# Task 20261080: 리그 목록의 이전 상세페이지 연결 복구

Status: Review
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
- [ ] alpha 배포 후 실제 카드 클릭을 통한 이동 검증. 로컬 검증과 구분해 보고한다.

## Tech Debt Resolved
최근 링크 변경을 단언하던 테스트를 사용자 요청 경로 및 정확한 복귀 쿼리 계약으로 교체한다.

## Security Notes
기존 `withFromPath`의 내부 경로 검증을 재사용한다. 인증·신청·권한 계약을 변경하지 않는다.

## Risks & Dependencies
현재 요청은 통합 목록에 한정한다. 홈 리그 카드와 순위·일정용 링크는 그대로 둔다. 실제 alpha 반영에는 dev 배포가 필요하다. 로컬 dev fast-forward는 완료했다. Headed Chromium은 `libnspr4.so` 부재로 기동 실패하여 실제 클릭·3폭 검증이 남는다.

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


## 후속 요청: 진행 중인 리그의 공개 상단 진입 (2026-10-14)
사용자가 기존 두 화면을 지정했다: 상세 상단의 LIVE · 진행 중인 리그 보기 → 기존 순위·브래킷 화면의 경기 일정·리그 순위. 화면 신설 대신 기존 BracketEntryCtaButton을 재사용한다. 참가자뿐 아니라 미참가자·방문자에게도 웹·모바일에서 보여야 한다.

- [x] 사용자 지정 기존 화면·컴포넌트 재사용 확인(새 시안 선택 불필요).
- [x] 원인 확인: `tm-hide-desktop` 및 `showsApplyCta`가 상단 진입을 숨김. 리그는 신청 가능 상태를 `isOpen`으로 취급하여 데스크톱 진행 상태 rail에도 닿지 않음.
- [x] 진행 중인 정규 리그의 상단 진입은 참가 상태와 무관하게 모든 폭에서 표시.
- [x] 기존 `/tournaments/:id/bracket` 연결·from 복귀 체인·신청 CTA 유지.
- [x] 실제 consumer 회귀 테스트·diff 검증.
- [ ] alpha 배포 후 390/768/1440 실제 클릭·console/network 확인.

Owned: 상세 client·기존 테스트·이 task·새 Changeset. Forbidden: 목록 카드의 완료 변경·API·다른 공유 WIP. 단일 에이전트 직렬 진행.
Base: origin/dev=`439e4d2e0`; worktree `/tmp/teameet-league-live-entry-20261014`.
공개 alpha API는 제보 리그의 kind=`regular_league`, status=`in_progress`, format=`group_knockout`임을 확인했다. 연결 화면은 이미 regular_league를 판별해 경기 일정·리그 순위를 렌더한다.
RED: 실제 상세 consumer 81개 중 새 4개 실패/77개 통과(`/tmp/teameet-league-live-red.log`). 미참가·취소 사용자는 링크가 없고, 참가자는 desktop 숨김 조상 조건이 실패했다.

GREEN: 상세 consumer 81/81 PASS(`/tmp/teameet-league-live-green.log`), diff check PASS, touched source/test debt marker 0. 추가 7개는 미신청/confirmed/draft/cancelled 상단 링크·desktop 숨김 부재·제목 이전 순서·실제 목적지 및 일반 대회/종료·취소 대조군을 검증한다.
Alpha before: headed Chromium(owned node PID8521 → chrome PID8585) 비로그인 방문자 390/768/1440에서 liveEntryCount=0, overflow=false. 기존 `/bracket` 진입 시 경기 일정·리그 순위 탭이 각각 1개로 실제 구현됨을 확인했다. API 실패는 비로그인 `/auth/me` 401 한 건, pageerror 없음. evidence/screenshot: `/tmp/teameet-live-entry-before/`. Browser.close 완료·잔류 없음. 참가자 before 증거는 사용자가 제공한 이미지이며 자체 로그인 실측은 미실행이다.
현재 변경은 격리 작업트리에서 검증 후 공유 작업트리에 반영하는 코드 변경이며 commit/push/merge/alpha 배포는 미실행이다. 새 UI의 alpha after 3폭/참가자·비참가자 실제 클릭은 배포 후 필요하다. 이를 완료한 QA로 보고하지 않는다.

PR 요청에 따라 최신 origin/dev=`e6cecf51f` 기반 `/tmp/teameet-league-live-pr`, branch `fix/league-live-public-entry`로 동일한 4개 파일을 옮겼다. 최신 dev에서 touched source/test/task 변경 없음 확인; 기존 공유 작업트리 WIP는 수정하지 않는다. alpha after 갤러리는 정본 CLAUDE.md 규칙대로 머지·배포 뒤 첨부하며 이번 요청은 dev 대상 PR 생성까지다.

PR 전 검증: 최신 dev와 원래 검증한 상세 source/test 바이트 동일성 확인(81/81 결과 재사용), Web 전체 `tsc --noEmit` PASS(`/tmp/teameet-live-pr-typecheck.log`), 올바른 앱 cwd의 Web 패턴 검사 PASS(`/tmp/teameet-live-pr-pattern.log`). 최초 패턴 실행은 잘못된 cwd와 sandbox child-shell EPERM으로 실패했으며 앱 cwd의 읽기 전용 실행으로 해소했다. Changeset 포함 4개 파일만 커밋·push 대상이다.


## Follow-up: unify every public league detail entry (2026-10-14)
Status: In Progress

### Context / Goal
User approved all entry points from the 14-category inventory to use /tournaments/:id.
### Original Conditions
- [ ] Home recommendation/sidebar, search, my leagues, team detail, apply/my-registration returns, sibling links, fixture/awards returns, operations CTA, notifications and SEO use canonical detail.
- [ ] Existing /league-matches/:id and /leagues/:id bookmarks redirect with query preserved.
- [ ] Fixture, awards, roster, admin and API routes retain their contracts.
### User / Test Scenarios
Follow discovery links and return to original filtered source. Open historical notifications/bookmarks. Check fixture IDs, parent links, unknown IDs, unsafe notification URLs and query/hash preservation. Update consumer expectations; no schema or response-shape changes.
### Parallel Work Breakdown / Ownership
Single agent sequential. Owned: v1 public detail navigation, notification links, associated tests/docs. Forbidden: admin/API endpoint paths, roster policy and unrelated WIP.
### Acceptance Criteria
- [ ] 14/14 entry categories aligned; regression tests/typechecks pass.
- [ ] dev review/deploy and alpha runtime checks complete; report unavailable authenticated personas.
### Tech Debt Resolved / Security Notes / Risks & Dependencies
Fix historical /leagues/:id dead links. Preserve safe internal from validation. Redirect detail roots only. Reuse user-selected existing detail UI.
### Ambiguity Log
2026-10-14: User requested all entries after inventory; previous list-only restriction superseded.
### Progress Snapshot
Base origin/dev=dde8964ca. Worktree _worktrees/league-detail-routes. Phase 1 inventory complete; Phase 2 implementation in progress; Phase 3 validation/review/deploy pending.

검증 진행: 14/14 진입 유형 코드 수정·감사 완료. Web 소비자/복귀/SEO 회귀 green, Web tsc PASS, API 알림·명단 테스트 81/81 PASS. API tsc/표면 검사 진행. 기존 상세/죽은 알림 링크 before를 390/768/1440에서 수집(구 주소200, /leagues 주소404, 목록 클릭 정상). 비로그인 auth/consent 401 외 pageerror 없음. Headed browser는 finally에서 종료. 로그인 persona의 마이·신청·팀 멤버 화면은 단위 consumer로 검증했고 alpha 로그인 실측은 아직 미실행.

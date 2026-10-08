# Task 20261043: MD-QA #42 대회 목록 페이지 복원

Status: In Progress
**Owner**: root → frontend-ui-dev
**Created**: 2026-10-08
**Report**: https://teameet.jmandu.kr/issues/42/

## Context
정규 리그 목록 2페이지(21–22/22)에서 33767023-5e85-4393-910a-9e26b9657b69 상세를 보고 상단 뒤로가기나 브라우저 Back을 누르면 kind=league는 유지되지만 1페이지로 초기화된다. 기존 완료 #22는 유형/상태 보존이며 별도 페이지 상태 누락이다. 댓글 0, 다른 실제 수정 진행 없음. root UI 선점 김성준·확인 중 성공.

## Goal
목록의 현재 페이지를 URL/복귀 경로와 일치시켜 두 뒤로가기 방식 모두 같은 페이지로 복귀하고 dev PR·원 리포트 댓글까지 게시한다.

## Original Conditions (must all be satisfied)
- [x] 실제 원 설명/재현/댓글 및 선점 확인.
- [ ] 기존 필터와 local draft 동기화 계약 유지.
- [ ] 현재 2페이지 복귀를 실제 consumer regression RED → GREEN으로 증명.
- [ ] 독립 리뷰, 좁은 committed 검증, feature push/base dev PR, 원 리포트 댓글.

## User Scenarios
정규 리그 목록 2페이지 → 같은 카드 상세 → 상단 뒤로가기/브라우저 Back 각각 2페이지 유지. 필터 변경은 1페이지로 초기화한다. 잘못된 page query는 안전하게 기본 페이지로 정규화한다.

## Test Scenarios
- Happy path: URL 페이지 hydrate, page click URL 반영, from return URL 페이지 포함, 재진입 2페이지 데이터.
- Edge cases: 빠른 필터/페이지 입력, 잘못된/누락 page, cursor 기존 계약.
- Error paths: 목록 API 실패를 숨기거나 임의 성공 카드로 만들지 않음.
- Mock data updates needed: 기존 paging/return test의 실제 URL 및 응답 fixture만 sync; 공유 MSW/API 변경 없음.

## Parallel Work Breakdown
- Owned frontend: `apps/v1_web/src/app/tournaments/tournaments-list-client.tsx` 및 기존 `tournaments-list-paging.test.tsx`/`tournaments-list-return.test.tsx`, 필요한 이 디렉터리 좁은 스펙. 새 경로 필요시 root에게 먼저 보고.
- Root: task/Changeset, Git/PR/tracker 및 별도 #41 조율.
- Forbidden shared hooks/types/MSW, 다른 라우트/global history, API/DTO/schema, .env, 다른 자동화 SSOT. 혼자가 아니므로 타인 변경 원복 금지. self-commit/stage/push 금지.
- 검증은 직렬 최소 worker; alpha는 머지/배포 확인 후.

## Acceptance Criteria
- [ ] URL/뒤로가기 페이지 계약 실제 RED → GREEN.
- [ ] 기존 필터 및 목록 로딩/실패 계약 유지.
- [ ] 좁은 검증 및 독립 리뷰 Critical/Warning 0.
- [ ] committed diff scope, Changeset/task, dev PR/댓글 실제 확인.
- [ ] 실제 alpha before/after 및 console/network (미머지는 대기로 명시).

## Tech Debt Resolved
URL 복귀 상태에서 빠진 목록 페이지를 기존 필터 상태와 통합한다.

## Security Notes
기존 안전한 return route와 API 권한을 유지한다. query를 임의 외부 경로로 연결하지 않는다.

## Risks & Dependencies
전용 managed worktree origin/dev 5948dfd6 기반. 기존 #22 feature는 이미 머지되어 새 fix를 그 branch에 push하지 않는다. 코드 테스트와 실제 alpha QA를 구분한다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-08 | Report #42 | #22 재발인가? | 유형 유지, 페이지 번호만 누락. 독립 수정이며 global history scope는 제외. |

## Progress Snapshot
- Worktree `C:/Users/kinso/.codex/worktrees/mdqa-42-tournament-page-return/matchup-sports-platform`, branch `fix/mdqa-42-tournament-page-return`.
- Original/claim DOM and screenshot: root ignored 0550 evidence `report42-{before,claimed}.*`.
- Base 5948dfd6; frontend 구현·좁은 회귀 검증 완료, root 리뷰·통합 검증·publication 대기.
- Implementation (frontend-ui-dev): 데스크톱 page를 안전한 정수로 URL에서 hydrate하고 페이지 선택은 `router.replace`로 현재 history entry에 반영한다. URL 반영 전 로컬 page draft가 카드의 `from`에도 같은 페이지를 담는다. 새 URL/Back에서는 draft를 비우고 URL 페이지를 읽는다. 필터 옵션·초기화·유형 전환은 page를 제거하고, 시트 여닫기는 page를 유지한다. 모바일 cursor/누적 및 오류·fetching 표면은 유지했다.
- Scope: `tournaments-list-client.tsx`, `tournaments-list-paging.test.tsx`, `tournaments-list-return.test.tsx`; root 승인으로 `tournaments-list-kind.test.tsx`의 router mock 1줄 추가. 공유 hooks/types/MSW/API·global history 변경 없음.
- RED (2026-10-08 15:05): 실제 목록·카드·상세·API 훅 consumer의 신규 4개 모두 실패. page click 뒤 URL은 `/tournaments?kind=league`에 머물러 `&page=2` 예상과 불일치했고 직접 page=2 진입도 첫 페이지를 조회했다. 상단/브라우저 Back, URL hydrate, 시트 유지 계약을 잠갔다.
- GREEN (15:08): 목록 return/paging/kind/fetching 4개 파일 56/56 통과, Vitest single worker, 14.59s. 리그 상세의 standings/overall inline 응답을 보완한 뒤 return 10/10을 15:10에 재실행해 MSW 미등록 요청/경고 없이 통과(7.33s). 잘못된 page 입력 7종, URL 변경 hydrate, URL 응답 전 연속 페이지 선택, 필터 변경1 리셋, 모바일 cursor 누적도 포함한다.
- Validation command: 앱 디렉터리에서 bundled Node로 `node_modules/vitest/vitest.mjs run src/app/tournaments/tournaments-list-return.test.tsx src/app/tournaments/tournaments-list-paging.test.tsx src/app/tournaments/tournaments-list-kind.test.tsx src/app/tournaments/tournaments-list-fetching.test.tsx --maxWorkers=1 --minWorkers=1`. clean 재실행은 return 파일만 지정했다. 호스트 preflight CPU34→45→51%, free14.12→12.63→13.97GiB, Node27→56→27, Edge10; Docker engine 없음, 로컬 서비스/Next 서버 미기동.
- Tech debt: URL에서 빠졌던 페이지와 오래된 D3 칩 핸들러 주석을 정리했다. 시각 구성·API 계약 변경과 모호함 없음. 독립 리뷰/최종 lint/Changeset/Git·PR/alpha·원 리포트 댓글은 root 단계 대기다.
- Root actual alpha baseline (same authenticated IAB E2E관리자,1280×720,document5948dfd6): 2페이지 clicked→21–22/22 visible; target33767023 detail from URL lacks page; header Back→1–20/22. Evidence `report42-alpha-page2-confirmed.*` and root Back snapshot. Earlier `report42-alpha-page2-before.*` was captured after an earlier click had returned to page1 and is NOT page2 evidence. Actual after-alpha pending deployment.
- Root precommit: origin/dev remains5948dfd6, drift0. App typecheck first found two unsupported Testing Library `exact` options in new regression; removed them (string role name already exact) and rerun PASS. Canonical pattern script first failed under Windows FIND; unchanged script rerun with Git Bash shell adapter PASS (all checks preserved). Actual header Back and browser Back both alpha reset21–22→1–20, saved separate DOM/screens. Source fix alpha-after pending.

- Root publication: PR https://github.com/kim-song-jun/matchup-sports-platform/pull/1663, base dev OPEN/head 3504afd5c91676eb4595ee503117013262207985. GREEN56;final committed actual return10/10;tsc/pattern PASS. latesthead frontend Critical0 Warning0 OK/FindingsNone. Fresh fetch origin/dev5948 drift0 behind; committed scope verified and final tests passed before task progress-only WIP. IAB existing tracker comment https://teameet.jmandu.kr/issues/42/#comment-105 save toast+actual text+screens verified. Copilot auto requested once/latesthead CI pending at publication. No root merge; actual alpha-after pending.
### Actual latest-head review findings follow-up — 2026-10-08
- Three real Codex findings on3504afd5: settled out-of-range URL false empty; placeholder oldcards/newpage from mismatch; laterpageSSR wrongpage1 seed/ItemList. Allsourceconfirmed, notgeneric autoapproval.
- Worker RED actualHTTP/listconsumer+SSR7 FAIL/24PASS → GREEN five relatedspecs77/77PASS(17.03s,1worker).
- Minimalfourfilefix: clamp onlysettledvalidcurrenttotalPages(notplaceholder/error), keep skeletonwhileemptyout-of-range correction pending, detail from displayedresponsepage, suppressfirstpageSSR seed/ItemList onvalid nonfirstURL; no sharedhooks/types/seedhelper/style/APIchange.
- Root task publication WIP retained. Committed source andlatestdevintegration, tsc/pattern, exactnewSHAindependent re-review then same1663push/threadreply/trackercomment pending. alpha actualafter remainspending.

# MD-QA #18: 신청 마감일 경과 대회의 대표 모집 상태 정합성

Status: In Progress — home CTA follow-up
**Owner**: Codex MD-QA monitor / mdqa_18 worker
**Created**: 2026-10-06

## Context
리포트: https://teameet.jmandu.kr/issues/18/ (김성준 할당).
신청 마감일이 지난 0/4팀 합성 대회가 이벤트 카드·캠페인·대회 상세에서 모집 중으로 표시되는 반면 신청 버튼과 안내는 마감이다. 정원 충족 사례와 다르다. 최초 조사 당시에는 후보 검증 기록만 있었다. 이후 PR #1625가 dev에 머지됐으며 아래 Progress Snapshot에서 사후 QA와 같은 티켓의 후속 수정 상태를 추적한다.

## Goal
신청 마감일이 지난 대회의 대표 상태와 실제 신청 가능 여부를 일치시키고 dev PR·머지 추적·기존 리포트 수정 댓글로 연결한다. 2026-10-06 사용자 범위 변경 이후 이 자동화의 신규 alpha 브라우저 QA는 제외한다.

## Original Conditions (must all be satisfied)
- [x] 최신 origin/dev에서 분기한 전용 워크트리 사용.
- [x] 이벤트·캠페인·대회 상세의 대표 배지가 마감일을 반영(구현 및 회귀 검증 완료).
- [x] 마감 버튼/안내와 실제 신청 게이트 유지; 신청·결제 데이터 변경 없음.
- [x] 한국어 dev PR #1625 생성 및 Changeset 포함.
- [ ] dev 머지 후 리포트 상태는 QA로 변경; Done/완료 처리는 하지 않음.

## User Scenarios
기존 합성 대회의 이벤트 → 캠페인 → 상세를 읽으면 마감 상태가 일관돼 신청 가능한 대회로 오해하지 않는다.
관측 경로: `/events`, `/tournaments/campaigns/alpha-qa-futsal-recruiting?from=events`, `/tournaments/aa100000-0000-4000-8000-000000000002`.

## Test Scenarios
### Happy path
- [x] 미래 마감일·모집 중 상태는 모집 중.
- [x] 과거 마감일·빈 정원은 모집 마감.
### Edge cases
- [x] 마감 경계와 기존 날짜/timezone 계약 확인.
- [x] 마감일 미설정, 정원 충족, closed, 진행/종료 상태 검증.
### Error paths
- [x] 실패를 성공이나 임의 상태로 숨기지 않음(기존 API/error/신청 게이트를 그대로 유지).
### Mock data updates needed
- [x] 영향받는 fixture/MSW/기존 테스트를 실제 계약과 동기화(신규 응답 계약 없음; 기존 full 캠페인의 hero/decision 배지 개수만 실제 화면에 맞게 조정).

## Parallel Work Breakdown
- Builder owns tournament/campaign/event recruitment presentation and direct tests, this document, `.changeset/mdqa-18-recruitment-deadline.md`.
- Forbidden: admin/inquiries paths, unrelated shared contracts, main checkout, other worktrees.
- Shared API/schema 변경이 꼭 필요하면 편집 전에 root와 조율.
- Root handles Git/PR and browser QA; builder must not commit or push.

## Acceptance Criteria
- [x] 재현 계약을 검증하는 회귀 테스트 및 관련 기존 테스트 통과(관련 6파일 총 84개).
- [x] 타입/패턴 검사와 committed diff 검토 완료.
- [x] reviewer 실결함 0(10/10 파일 및 shared helper caller 8/8 검토, Critical 0 / Warning 0).
- [x] API/mock 계약 drift 및 새로운 부채 0.
- [ ] 머지 및 alpha 배포 확인 후 원래 사용자 흐름을 390/768/1440에서 재검증.

## Tech Debt Resolved
- 저장된 대회 단계(`open`)와 신청 가능 여부를 대표 배지가 혼동하던 분기를 shared status helper에 통합했다.
- 캠페인 hero가 신청 버튼과 별개로 마감 후에도 모집 중을 유지하던 문제를 기존 provider의 시계 재사용으로 해소했다.
- 신규 TODO/FIXME/HACK/XXX marker 없음; 기존 신청/API/결제 게이트 수정 없음.

## Security Notes
기존 권한/신청 차단 유지. .env·인증정보는 읽거나 문서/PR에 적지 않음.

## Risks & Dependencies
alpha 실제 배포와 인증 세션에 의존. 병렬 구현은 가능하지만 무거운 검증은 root가 직렬로 조율한다. 캠페인의 시간 경과 갱신은 기존 60초 주기를 유지한다. 이벤트 카드는 기존 API의 registrationAvailability를 사용한다.

## Ambiguity Log
- 기존 배지와 화면 구조를 유지하며 상태 계산만 변경한다. `CLAUDE.md` UI 착수 규칙의 로직 전용 변경 예외에 해당한다.
- 캠페인 API·provider는 `deadline <= now`에 마감한다. 일반 대회 신청 서비스와 상세의 공유 신청 게이트는 `deadline < now`에 마감한다. 이번 변경은 각 화면의 기존 게이트를 그대로 따르고 API 경계를 바꾸지 않는다.
- 원본 ISO timestamp를 절대 시각으로 비교하고 날짜 문구는 기존 Asia/Seoul 포맷을 유지한다. 신청·결제·API·MSW 계약 변경은 필요하지 않다.
- root가 shared `lib/v1-tournament-status.ts` 소유권을 승인했다. 존재하지 않는 `lib/v1-tournament-registration.ts` 대신 현행 `lib/tournament-registration-availability.ts`를 읽기 전용으로 재사용한다.

## Progress Snapshot
- [x] 할당·상세·기존 PR 중복 확인.
- [x] 로컬 dev를 먼저 fetch/FF 동기화; 시작 SHA `4e1c14bb9cd089da10e1dae0088dfea6deb5b72d`.
- [x] 구현·회귀 검증.
- [x] events/campaign/detail 기존 게이트와 대표 배지 경로 조사.
- [x] 세 화면의 RED 회귀 테스트 준비 및 root의 직렬 실행.
- [x] RED: root 실행, 기존 3파일 52개 중 7 fail / 45 pass. 모두 실제 모집 중 배지가 유지돼 모집 마감을 찾지 못하는 회귀.
- [x] 최소 구현 및 deadline/timezone/정원/대회 단계 대조 테스트 준비. GREEN·타입/패턴은 root가 직렬 실행한다.
- [x] 1차 GREEN: 6파일 84개 중 82 pass / 2 fail. 캠페인·이벤트·시계·shared gate 검증 통과. 상세의 추가 대조군 2개는 정상 버튼/종료 표시와 텍스트가 같아 선택자가 중복 매칭됐다. 실제 대표 배지(`.tm-badge`)로 선택 범위를 좁혔으며 프로덕션 재수정은 없다.
- [x] 최종 상세 1파일 32/32 PASS. 나머지 5파일 52/52 PASS와 합쳐 관련 84개 PASS. root가 최소 worker 1개, 파일 병렬화 없이 실행했다.
- [x] reviewer: 파일 10/10, shared helper caller 8/8, Critical 0 / Warning 0.
- [x] alpha baseline: root가 `/events` → 캠페인 → 상세를 390/768/1440에서 총 9장 캡처했다. baseline serving SHA는 `4e1c14bb9`다.
- [x] root 타입 검사 통과. Windows `find.exe`와 Unix 검사 명령 충돌을 피하기 위해 패턴 검사는 기존 Git Bash를 자식 shell로 지정해 통과했다. 제품/검사 코드는 변경하지 않았다.
- [x] root committed diff 10파일 검토, 미추적 의존성 없음, clean 작업트리 확인.
- [x] 리뷰·PR: [dev PR #1625](https://github.com/kim-song-jun/matchup-sports-platform/pull/1625) 게시 및 채팅 attach. 최신 head의 Gates/API/Web 성공, Copilot Findings None, 미해결 스레드 0을 확인했다.
- [x] 2026-10-06 dev 머지 확인: `4c43b425988b8a209563575f34c64940afdda2af` (2026-10-05 22:47:38 UTC). 실제 dev 체크아웃을 fetch/FF 동기화했고 두 수정 머지를 포함한 현재 dev `768bb0d5c02473842629bdad83fc3b6d183cd5f3`의 ancestry를 확인했다.
- [ ] MD-QA #18 상태를 QA로 변경: 현재 로그인한 김성준 UI에는 완료 처리·담당 해제·보류·Slack만 있고 QA 선택이 없어 BLOCKED. 다른 상태로 대체하지 않는다.
- [x] alpha 배포 run [37384705539](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37384705539) 성공. root가 `/events` HEAD의 HTTP 200과 `X-Teameet-Commit: 4c43b425988b8a209563575f34c64940afdda2af`를 직접 확인해 이 PR 머지 커밋이 실제 서빙됨을 검증했다.
- [x] 기존 dev-pr-5의 실제 로그인 QA와 [9장 before/after 갤러리](https://github.com/kim-song-jun/matchup-sports-platform/pull/1625#issuecomment-6005080995)를 재사용 검증했다. 390/768/1440의 events/campaign/detail에서 마감 배지·안내·신청 차단 기능은 통과했지만 아래 모바일 배지 줄바꿈 때문에 전체 시각 완료 판정은 보류한다.
- [x] 후속 alpha 배포 [37385091187](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37385091187)도 성공했고 root가 HTTP 200, serving `768bb0d5c02473842629bdad83fc3b6d183cd5f3`, #1625 merge ancestry를 직접 확인했다.

## Validation Evidence
- RED: `pnpm --filter v1_web exec vitest run src/components/tournaments/event-campaign-card.test.tsx src/components/tournaments/tournament-campaign-template.test.tsx src/app/tournaments/[id]/tournament-detail-cta.test.tsx --maxWorkers=1 --no-file-parallelism` — 7 fail / 45 pass. 실제 모집 중 표시가 남아 모집 마감 배지를 찾지 못했다.
- GREEN 1차: 위 3파일과 `src/lib/v1-tournament-status.test.ts`, `src/lib/tournament-registration-availability.test.ts`, `src/components/tournaments/tournament-campaign-primary-action.test.tsx` — 82 pass / 2 selector fail. 증거: `tmp/qa/mdqa18/green.log`(로컬 검증 로그, 커밋 대상 아님).
- GREEN 최종: `pnpm --filter v1_web exec vitest run src/app/tournaments/[id]/tournament-detail-cta.test.tsx --maxWorkers=1 --no-file-parallelism` — 32/32 PASS. 수정하지 않은 나머지 5파일 52/52 PASS를 포함해 84개 계약 검증 통과.
- 원래 마감 상태 계약의 실제 alpha QA는 위 갤러리로 검증했다. public console 0, 전체 138응답 수집/잘림 없음, 7건의 기존 `/_next/image` 400과 탐색 취소를 기록했다. 절대 이미지 URL이 기존 Next remotePatterns에 허용되지 않아 before부터 같은 fallback이 보인다. 이미지 로직은 PR #1625 변경 범위가 아니며 네트워크 전체 오류 0으로 주장하지 않는다. 실신청·결제·독립 DB·런타임 60초 경과는 별도 미검증이다.
- tracker는 QA로만 전환하며 Done/완료 처리는 하지 않는다.
- `pnpm --filter v1_web run lint`의 `tsc --noEmit` 통과; 후속 패턴 명령은 Windows shell 충돌로 실패했다. `process.env.ComSpec`을 해당 Node 프로세스에서 Git Bash로 지정하여 기존 `scripts/v1-pattern-check.mjs`를 재실행했고 모든 패턴 게이트가 통과했다. 증거: `tmp/qa/mdqa18/lint.log`, `tmp/qa/mdqa18/patterns-gitbash.log`.


## Post-merge QA Follow-up — mobile metadata chips
- Phase: follow-up implementation → review → dev PR → merge/deploy → alpha visual recheck. Same MD-QA #18; 새 tracker 티켓은 만들지 않는다.
- [x] 독립 Pass A는 12/12 capture pair의 디자인/기능을 PASS로 검수했으나 Pass B는 390px detail의 새 배지 줄바꿈을 REVISE로 판정했다. #19의 3폭은 두 검수 모두 PASS다.
- [x] root 실제 재현: serving `768bb0d5c02473842629bdad83fc3b6d183cd5f3`, 390×844에서 배지 y=150.375/150.375/150.375/182.375. `모집 마감` 폭62.265625, 형식116.890625, 혼성38.75, 풋살47.75와 현재 8px×3 gap이 278px 영역을 넘어 종목만 둘째 줄로 내려간다. CTA는 disabled이며 y746/height50으로 정상이다. 768/1440은 한 줄, overflow 없음.
- [x] root의 새 before 3장 및 DOM geometry: ignored `tmp/qa/mdqa-assigned-monitor/2026-10-06-postqa-review/followup-18/`. root가 만든 tab1734017645만 종료했고 viewport override reset. 다른 자동화의 tab/process/state는 건드리지 않았다.
- Owned files (builder): `apps/v1_web/src/app/tournaments/[id]/tournament-detail-client.tsx`, `.changeset/mdqa-18-mobile-status-chips.md`, this task doc. Root owns MD-QA #19 doc and Git/PR. Forbidden: shared CSS/tokens, API/DTO/hooks/MSW/schema, inquiries source, other worktrees, main, broad dependencies/tooling changes.
- Acceptance: explicit 모집 마감 and existing disabled gate remain; four metadata chips fit one coherent row at390 with token spacing; 768/1440 retain layout; no new typography/permission/API contract; production diff stays minimal. No CSS-class mirror test: real browser geometry/captures prove layout. Run the existing narrow detail regression once, typecheck once before commit, then actual alpha after merge. No local Next server.
- [x] 최소 토큰 간격 수정: 상세의 공유 header metadata container에서 `gap: 8`만 `gap: 'var(--spacing-1)'`(기존 4px 토큰)로 치환했다. `.tm-badge`, 네 배지의 문구·폰트·패딩·순서와 `flexWrap: 'wrap'`, 기존 신청 차단 게이트는 그대로다. v1_web patch Changeset을 추가했다.
- [x] 후속 범위 확인: `CLAUDE.md` UI 착수 규칙의 1줄 기계적 토큰 치환 예외를 적용한다. 신규 화면·구조·토큰·컴포넌트·의존성은 필요하지 않다. touched production path의 TODO/FIXME/HACK/XXX marker는 없다.
- 예상 geometry (아직 라이브 검증 아님): 현재 root 실측 배지 폭 합265.65625px + 4px×3 = 277.65625px로 390px의 가용278px에 들어간다. 768/1440에서도 같은 배지 위계와 한 줄 구성을 유지하며, 더 좁은 화면이나 긴 데이터는 기존 자연 줄바꿈을 허용한다.
- [x] root가 기존 상세 회귀32개를 worker1/파일 직렬로 각1회 실행해32/32 PASS, TypeScript와 기존 v1 패턴 검사도 각1회 PASS. 기존 React act 경고1건은 기록했다. CSS 클래스/가짜 geometry 단위 테스트는 추가하지 않았다. 로그는 위 followup-18의 detail-tests.log/typecheck.log/patterns.log다. 호스트 preflight CPU9%,여유17.1GB,Node59/Chrome24; Docker daemon은 없으며 이번 프론트 단위 검증에는 필요하지 않았다. 의존성은 기존 lockfile의 offline cache만 재사용했고 다운로드0/manifest변경0이다.
- [x] 독립 frontend/code reviewer가 의도된4/4경로를 검토해 Critical0/Warning0. 실제 alpha 간격 after는 pending으로 유지했다. 보고서: ignored followup-18/code-review.md.
- [x] [dev 후속 PR #1627](https://github.com/kim-song-jun/matchup-sports-platform/pull/1627) 게시/채팅 attach. 제품 source commit `3629665f93cd2007231801ee2995882673706a64`, branch `fix/mdqa-18-mobile-status-chips`, worktree `C:/Users/kinso/.codex/worktrees/mdqa-18-19-postqa-docs/matchup-sports-platform`. 이 인계 문서 커밋으로 제품을 다시 바꾸지 않는다.
- [x] 후속 #1627은 최신 head Gates/API/Web 성공, Copilot FindingsNone, 독립 코드 리뷰4/4 PASS 후 dev에 머지됐다(위 a29 merge). 새 자동 머지 정책을 추가하지 않았다.
- [x] 다른 실행의 역사 detail 재검수는 #18 comment-31에 PASS로 기록됐다. 이 자동화의 신규 alpha 캡처/QA는 사용자 범위 변경으로 제외됐으며 홈의 아래 별도 미해결 지점을 전체 완료와 구분한다.
- Tracker QA transition remains BLOCKED_UI_OPTION_ABSENT; Done/보류로 대체하지 않는다.

## Progress Snapshot — home recruitment CTA follow-up (2026-10-06)
- Phase: investigate → failing regression → minimal fix → review → dev PR → tracker comment → merge tracking.
- User scope: 버그 수정·코드 검증·dev PR·머지 추적·기존 리포트 댓글. 이 자동화는 alpha 재QA, responsive 캡처, 갤러리, serving SHA 실측을 수행하지 않는다. 위 기존 QA는 역사 기록이다. Done/완료는 사용자만 처리하며 QA 선택이 없으면 상태를 대신 바꾸지 않는다.
- Original PR #1625와 모바일 후속 #1627은 dev MERGED. #1627 merge `a29f080a53689b0e53c502ff2a26dd463f7909b5`; 원/후속 머지 안내는 [comment-28](https://teameet.jmandu.kr/issues/18/#comment-28)에 이미 있어 중복 게시하지 않는다.
- New evidence: [comment-31](https://teameet.jmandu.kr/issues/18/#comment-31), 김성준 10.06 10:58 KST. 마감 캠페인 `/tournaments/campaigns/alpha-qa-futsal-recruiting`의 `/home` 추천 카드가 계속 `참가 신청하기`를 표시한다. 기존 events/campaign/detail 수정과 별도로 남은 경로다. 콘텐츠 제목의 모집중 낱말은 결함 근거로 쓰지 않는다.
- Authenticated IAB를 통해 김성준 담당 실명, 전체 9건, 활성 3건, 상세·설명·최근 댓글 및 추가 pagination 없음을 확인했다. 이전 Chrome 연결 blocker는 해소됐다. #19 comment-29는 역사 QA PASS이며 신규 결함이 아니다.
- Dedup: 기존 워크트리/태스크/열린 dev PR을 확인했다. #18 홈 후속 PR은 없고 #1628(MD-QA #20), #1629(MD-QA #21) 및 #1610은 타 작업이다.
- Worktree: `C:/Users/kinso/.codex/worktrees/mdqa-18-home-cta/matchup-sports-platform`; branch `fix/mdqa-18-home-recruitment-cta`; fetch 직후 `origin/dev` a29f080a5에서 생성했다. 이미 머지된 기존 branch에 새 fix를 push하지 않는다.
- Owned (builder): `apps/v1_web/src/components/home/tournament-hero-card.tsx`, direct `tournament-hero-card.test.tsx`, `.changeset/mdqa-18-home-recruitment-cta.md`. Root owns this canonical task and Git/PR/state. Forbidden: shared helpers/hooks/types/MSW/API/schema/CSS/tokens, unrelated home paths, main, old worktrees. Shared scope expansion 필요 시 root와 조율한다. Subagent commit/push 금지.
- Acceptance: 만료된 0/4 대회 홈 카드가 신청 가능하다고 안내하지 않는다. 기존 캠페인/상세 링크·카드 노출·정렬·outline 위계를 유지한다. 미래 마감/마감일 없음·정원 충족·마감 경계·시간 경과 계약을 현재 v1 신청 게이트와 대조해 실제 렌더 회귀 테스트로 고정한다. 신청/결제/API 계약은 변경하지 않는다.
- Ambiguity: 구조·토큰 변경 없는 기존 신청 상태 로직 연결이므로 CLAUDE.md의 로직 전용 예외를 적용한다. 일반 대회 gate는 `deadline < now`; 캠페인의 기존 gate는 `deadline <= now`다. 링크 대상의 경계와 맞춘다.
- Hypotheses: (1) home CTA가 상태와 무관하게 고정 문자열을 렌더한다; (2) home list API가 deadline/정원 계약을 누락한다; (3) deadline이 화면 체류 중 지나도 render가 갱신되지 않는다. 실제 타입/훅/helper/caller와 실패 회귀로 구분한다.
- [x] RED: `pnpm --filter v1_web exec vitest run src/components/home/tournament-hero-card.test.tsx --maxWorkers=1 --no-file-parallelism` — 13 FAIL / 13 PASS (26). 닫힌 신청/체류 중 마감에서 실제 렌더 CTA가 `참가 신청하기`로 남아 `모집 마감`을 찾지 못했다. 로그: 원 checkout ignored `tmp/qa/mdqa-assigned-monitor/2026-10-06-home-cta/red.log`.
- [x] API 누락 가설 배제: 현행 `tournament-card.presenter.ts`가 deadline, kind, published campaignSlug, confirmedCount/pendingPaymentCount를 직렬화하고 정규 리그만 teamCount를 생략한다. home는 `useV1AllTournaments({status:'open'})` 목록을 전달한다. 신규 API/MSW/schema 계약은 없다.
- [x] GREEN: hero26 + 기존 home-featured-slot10 = 2파일36/36 PASS. 마감/정원/링크 대상별 경계/정규 리그 정원 생략/화면 체류 중 마감·시작을 실제 카드 렌더로 검증했다. 홈 wrapper의 기존 PersistQueryClientProvider act 경고10건을 별도 기록했다. 로그: 위 ignored `green.log`.
- [x] `pnpm --filter v1_web exec tsc --noEmit` 및 기존 v1 패턴 검사 각1회 PASS. Windows find.exe 충돌을 피하려고 검사 자식 shell만 기존 Git Bash로 지정했다. manifest/lockfile/API/mock 변경과 다운로드는 없으며 새 의존성이 없다. CPU45%/여유6GB까지 회복된 시점에 worker1·파일 직렬 검증; 이후 타입 검사는 아래 우선순위로 직렬 실행했다. 로그 `typecheck.log` / `patterns.log`.
- [x] 구현: 기존 shared 신청 gate를 재사용하고 정원 생략 정규 리그는 유효 마감일만 판단한다. 캠페인 링크는 기존 시작/마감 `<=`·invalid deadline gate를 추가로 따른다. 현재 시각 재판정과 기존60초 갱신을 사용하며 loading/전체 닫힘/unmount에서 timer를 정리한다. 링크/노출/정렬/outline/스타일·토큰은 유지한다.
- [x] Independent review: 접근성 실제 finding1건을 수정했다. 열린/마감 accessible-name 회귀 RED 2 FAIL → 시각 CTA와 link 이름에 같은 ctaLabel을 연결한 최종 GREEN 36/36 PASS. 최종 TypeScript incremental 및 v1 패턴 검사 PASS. 독립 reviewer가 의도된4/4경로를 재검수하여 Critical0/Warning0, PASS. 최종 로그 final-green.log / final-typecheck.log / final-patterns.log / code-review.md. 기존 wrapper act 경고10건은 성공 판정과 분리해 기록한다.
- [ ] Explicit committed diff / latest origin/dev drift check / dev PR / Copilot request.
- [ ] 기존 #18에 정확한 PR 상태와 수정 댓글 저장·표시 확인; 머지는 기존 자동화/사용자를 기다린다.

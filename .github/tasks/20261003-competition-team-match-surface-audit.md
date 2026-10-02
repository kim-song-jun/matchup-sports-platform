# 대회 경기의 팀매치 노출 전수 감사

Date: 2026-10-03 (KST)
Mode: CODE / audit follow-up, dev deployment
Status: code/dev/Alpha complete; authenticated admin QA pending — original audit 20/20 preserved below

## Context / Goal

사용자가 운영 `/admin/team-matches`에 대회 세부 경기가 보인다고 보고했다. 관리자에만 일반 팀매치처럼 노출되는지, 사용자 경로에도 혼입되는지 확인한다. 초기 로컬 브랜치 `992dba62f`는 운영보다 오래되어 판단 기준으로 사용하지 않는다.

## Original Conditions

- [x] 운영 응답 헤더로 배포 커밋과 버전을 고정한다.
- [x] 작업 트리와 별개로 배포 커밋의 v1 소스만 읽는다.
- [x] 아래 20개 surface의 API → UI → 링크/권한 경계를 확인한다.
- [x] 가능한 운영 GET을 직접 실행하고 인증이 필요한 미검증 경로를 구분한다.
- [x] 사용자 보고용 결과와 한계를 정리한다.

## Scope / Ownership

- Source: `apps/v1_api`, `apps/v1_web`, 배포 커밋의 관련 task/scenario 문서.
- Original audit owned write: 이 문서만. 아래 후속 수정은 최신 origin/dev의 별도 worktree에서 진행한다.
- Original audit forbidden: 런타임 수정/배포. 후속 사용자 요청은 v1 수정과 dev 머지/Alpha 배포를 명시적으로 허용한다. 운영 mutation, main 승격, 기존 dirty WIP 변경은 금지한다.
- Sequential work: 배포 고정 → 사용자/관리자 consumer 감사 → 운영 read-only 검증 → 보고.
- Sub-agents: 사용하지 않음.

## Acceptance Criteria / Surface Ledger

| ID | Surface | 코드 판정 | 운영 증거 |
|---|---|---|---|
| 01 | 공개 팀매치 목록·상태·유형·검색 | 대회 제외; 리그 허용 | 31개 조회 조합, 대회 ID 중복 0 |
| 02 | 공개 팀매치 상세·직접 링크 | 일반 상세는 제외. `/record` handoff 결함 F3 | 대회 32/32 일반 상세 404; `/record` 32/32 응답 200 |
| 03 | 사용자 팀매치 수정·신청·최근 장소 | 공통 조회에 대회 제외 조건; 경쟁 명단 쓰기는 별도 가드 | 코드 확인; 인증/mutation 미실행 |
| 04 | 내 팀매치 전체·참여·생성·신청 이력 | `AND`에 대회 제외 조건, scope 분기에도 유지 | 미인증 401; 로그인 후 행 미검증 |
| 05 | 마이 경기 사용자 UI / 개인 경기 API | 개인은 V1Match; 팀은 위 `/me/team-matches` 재사용 | 미인증 401; UI/개인별 행 미검증 |
| 06 | 홈 추천·다음 경기·팀 활동 | 추천은 개인 매치. 다음 경기는 전체 유형 + 올바른 링크 | guest home/recommendations 200; 로그인 카드 미검증 |
| 07 | 통합 검색·최근 검색 | 팀 검색은 `/team-matches` 필터 재사용; 최근 검색은 문자열 이력 | 대회명/조별 검색 0건; recent 200 |
| 08 | 팀 상세·활동·내 리그 | 열린 팀매치는 대회 제외; 내 리그는 전용 API. 조건부 R1/R2 별도 기록 | 공개 팀 상세 80/80 200; 가입/컨택/해체 미실행 |
| 09 | 팀 일정·내 일정·경기 링크 | 대회 포함이 의도됨. linkedMatch로 대회/리그/친선 구분 | `/me/schedule` 미인증 401; 멤버별 일정 미검증 |
| 10 | 팀 다가오는 경기 | 모든 유형 포함; competitionKind 및 전용 상세 링크 | 멤버 권한 코드 확인; 로그인 조회 미검증 |
| 11 | 명단 할 일·참석·전술 | **할 일은 친선만**. 대회/리그는 경기 명단·전술 경로로 분리 | `/me/lineup-todos` 미인증 401; 실제 명단 미검증 |
| 12 | 채팅 목록·경기 문맥·진입 | 경기 운영진 권한 유지; 경쟁 경기 공유 링크를 대회/리그로 재정규화 | `/chat/rooms` 미인증 401; 메시지/클릭 미검증 |
| 13 | 알림·명단 리마인더·딥링크 | 대회는 복합 targetId와 대회 상세 경로. 리그는 전용 분기 | `/notifications` 미인증 401; 알림 발송·클릭 미실행 |
| 14 | 남은 후기·대회/팀매치 후기 | 팀 후기 목록은 대회 제외; 잘못된 source는 TOURNAMENT_REVIEW_SOURCE_REQUIRED | `/reviews?status=pending` 미인증 401; 실제 후기 미검증 |
| 15 | 공개 팀/개인 기록·프로필 집계 | 대회 포함이 의도됨. type과 대회 링크 유지; 개인 집계도 소유권 판별 | 팀 80/80, 기록 64/64 tournament. 개인 동의별 runtime 미검증 |
| 16 | 대회 목록·상세·일정·경기 | 공통 TeamMatch를 대회 전용 presenter/route로 제공 | 대회 4/4, 공개 일정 32건, 경기 상세 32/32 200 |
| 17 | 리그 목록·상세·경기 | leagueId가 판별자; 일반 팀매치 상세의 리그 redirect 유지 | 공개 리그 목록 200/0건. 실제 리그 상세·참가자 미검증 |
| 18 | 관리자 팀매치 목록·표시·필터 | 공통 테이블 전체 조회. 대회 표시/전용 이동 없음 F2 | 미인증 401; 사용자 보고 외 로그인 행 미검증 |
| 19 | 관리자 팀매치 상세·상태 변경 | 대회 상세도 허용; 일반 상태 변경에 소유권 가드 없음 F1 | 코드 확인; 운영 POST 및 로그인 화면 미실행 |
| 20 | 관리자 홈 KPI·운영 대기·사용자/팀 이력 | KPI/최근 주최 이력도 공통 집계. 운영 inbox는 대회 구분. 관리자 전역검색은 개인 매치만 | overview/hub inbox 미인증 401; 실제 관리자 집계 미검증 |

## Validation / Security / Risks

- 공개/보호 API에 GET만 사용. `.env*`, 인증 토큰, 사용자 자격 증명은 읽거나 출력하지 않는다.
- 인증된 브라우저 세션이 제공되지 않았으며 browser MCP도 없다. 인증 경로의 실제 행/클릭 결과는 코드 검토와 구분한다.
- 제품 코드 변경이 없으므로 build/typecheck/full suite는 실행하지 않는다. 운영 상태 변경 테스트도 하지 않는다.
- 접근 시각/HTTP 상태/배포 커밋/페이지 수/경기 ID 교차검증을 남긴다.

## Ambiguity Log

- 저장소의 작업 브랜치는 운영 코드와 수 주 차이가 있다. 운영 API `x-teameet-commit`에 대응하는 committed tree를 기준으로 교정했다.
- 대회 경기를 공통 TeamMatch에 저장하는 것과 사용자 친선 팀매치 목록에 노출하는 것은 별개의 계약이다.

## Progress Snapshot

- 운영 API 응답 헤더: `x-teameet-release: 1.1.2`, `x-teameet-commit: 0b40a289635feb7d726e55721e808eb9590516f1`.
- `git fetch origin dev main` 후 해당 커밋의 v1 소스/규칙/task를 `/tmp/teameet-tournament-team-match-audit-20261003`에 읽기용으로 추출했다. 작업 트리/브랜치 전환 없음.
- 최초 운영 공개 `/api/v1/team-matches`: 200, 일반 모집 경기 1건, `hasNext:false`, `league:null`.
- 배포 소스: 대회 생성기가 `V1TeamMatch.tournamentId`와 `V1TournamentMatchDetails`를 생성한다. 사용자 목록/상세는 `tournamentId:null OR leagueId:not null`로 대회 경기를 제외한다. 관리자 목록은 제외 조건 없이 공통 테이블을 조회한다.
- 코드/consumer 감사 20/20 완료. 운영 공개 팀 80/80(목록 total=80, cursor 최종 hasNext=false)과 공개 팀 기록 64/64를 조회했으며 전부 `type:tournament`; 일반 팀매치 분류 오표시 0건.
- 공개 대회 4/4: 신청 중 2개는 공개 일정 0건, 종료 2개는 각 16건. 공개 경기 32/32는 `/tournaments/:id/matches/:fixtureId` 200, `/team-matches/:fixtureId` 404.
- 일반 목록 31개 조회 조합(기본/6개 상태/2개 유형/4개 정렬/2개 검색/16개 대회 참가팀)에서 대회 경기 ID 중복 0건. 운영 리그 목록은 0건이라 실제 리그 fixture runtime 증거는 없다.
- 초기 빠른 GET 순회 중 503 15건 발생. 속도 제한 여부는 서버 로그 없이 확정하지 않았다. 유효 경로만 750ms 간격으로 재검증해 정상 공개 200/일반 상세 404/보호 API 401을 확인했다. 잘못 탐색한 `/admin/dashboard`, `/me/schedules`, `/reviews/pending`는 증거에서 제외하고 실제 controller 경로로 교정했다.
- `/team-matches/:fixtureId/record` 32/32는 200/`phase:managed`/`canEdit:false`. 이 경로의 사용자 프론트 handoff가 일반 상세 404로 연결되는 결함 F3를 추가로 확인했다. 기록 수정 권한이 허용됐다는 의미는 아니다.
- 실행 증거: `/tmp/teameet-tournament-team-match-audit-20261003/live/summary.json`. 처음 2026-10-03 01:03 KST부터 같은 배포 커밋에서 수행했다. 브라우저/서버/컨테이너를 시작하지 않았고 GET script는 모두 종료했다. 커밋/배포/운영 데이터 수정 없음.

## Findings

### F1 — 높음: 일반 관리자 상태 변경이 대회/리그 경기를 직접 변경할 수 있음

- 근거: 배포 `apps/v1_api/src/admin/admin.service.ts:589-633`, `apps/v1_api/src/admin/dto/admin.dto.ts:433` 및 목록 UI `apps/v1_web/src/app/admin/team-matches/page.tsx:224-253`.
- owner/ops 권한과 완료 처리 금지는 존재한다. 하지만 대상의 `tournamentId`/`leagueId`, 현재 Game 상태, 적법한 상태 전이를 확인하지 않고 `V1TeamMatch.status`만 변경한다. 대회·리그 전용 lifecycle이나 연결 일정/Game 동기화를 호출하지 않는다.
- 따라서 대회 경기를 모집 중/마감/취소/보관으로 일반 팀매치처럼 바꿀 수 있는 코드 경로가 남아 있다. 실제 운영 변경을 실행하지 않았으며 현재 데이터가 이미 불일치한다고 단정하지 않는다.
- 권고: 목록 버튼과 서버 mutation 양쪽에서 경쟁 경기 소유권을 판단하고, 해당 대회/리그 운영 절차로 연결한다.

### F2 — 중간: 관리자 대회 경기의 유형·소속·진입 문맥이 빠짐

- 근거: 배포 `admin.service.ts:2515-2545`는 `league`와 `tournament`를 함께 반환한다. 목록 `page.tsx:185-203`는 `league`만 표시한다.
- 상세 `apps/v1_web/src/app/admin/team-matches/[id]/page.tsx:290-298`도 리그 링크만 제공하며, `:376`의 분류는 `league?.title ?? '단발 경기'`라 대회도 단발 경기로 표시한다.
- 공통 테이블에 대회 경기를 저장하는 것은 현재 정본 설계이며 중복 데이터 증거가 아니다. 문제는 통합 조회를 친선 팀매치처럼 표현/조작하는 관리자 UI다.
- 권고: 유지할 통합 관리 범위를 확정한 뒤 일반/리그/대회 구분, 소속명, 관리자 전용 링크, 필터를 일관되게 제공한다.

### F3 — 중간: 사용자 대회 `/record` 직접 접근이 404로 이어짐

- 실제 예: 대회 경기 `<fixture-id>`의 `/api/v1/team-matches/:id/record`는 200/managed, 일반 상세 `/api/v1/team-matches/:id`는 404, 전용 대회 경기 API는 200. 32개 전체에서 동일 HTTP/phase 경계를 확인했다.
- 근거: 배포 `apps/v1_web/src/components/team-matches/team-match-shared-record.tsx:199-205`는 managed도 `/team-matches/:id?view=detail`로 보낸다. `:256`에서 skeleton을 반환하므로 이 화면에서 가짜 0:0 점수를 사용자에게 보여준다고 주장하지 않는다.
- 정상 공개 기록·일정·홈 링크는 대회 상세로 올바르게 연결한다. 결함은 이 직접/과거 링크 진입 경계다. 브라우저 client redirect 자체는 실행하지 않았으며 배포 UI 코드와 실제 API 응답을 교차검증했다.
- 권고: managed 응답/라우트에서 실제 대회·리그 소유권을 해석해 전용 경기 상세로 이동한다.

## Conditional Risks (현재 운영 재현 아님)

- R1: `teams/teams.service.ts:2482`와 `team-contacts/team-contacts.service.ts:367`의 `recruiting_only` 컨택 판정은 대회 소유권과 deletedAt을 제외하지 않는다. 정상 대회 생성은 matched라 이번 운영 데이터로 노출된 결함은 아니다. F1로 대회 상태가 recruiting으로 바뀌면 일반 모집 신호로 오인될 여지가 있다.
- R2: `teams/team-dissolution.ts:131`의 경기 링크는 tournamentId만 판별한다. canonical 리그는 tournamentId=leagueId라 `/tournaments/:leagueId/matches/:id`로 잘못 연결될 수 있다. 현재 운영 리그 0건이므로 실제 해체 blocker 재현은 하지 않았다.

## Source Links (deployed tree)

- [관리자 조회·상태 변경](https://github.com/kim-song-jun/matchup-sports-platform/blob/0b40a289635feb7d726e55721e808eb9590516f1/apps/v1_api/src/admin/admin.service.ts)
- [사용자 팀매치 제외 조건](https://github.com/kim-song-jun/matchup-sports-platform/blob/0b40a289635feb7d726e55721e808eb9590516f1/apps/v1_api/src/team-matches/team-matches.service.ts)
- [대회 경기의 canonical 생성](https://github.com/kim-song-jun/matchup-sports-platform/blob/0b40a289635feb7d726e55721e808eb9590516f1/apps/v1_api/src/tournaments/tournament-match-creation.ts)
- [사용자 기록 handoff](https://github.com/kim-song-jun/matchup-sports-platform/blob/0b40a289635feb7d726e55721e808eb9590516f1/apps/v1_web/src/components/team-matches/team-match-shared-record.tsx)

## Completion Limits

- 코드 감사: 20/20. 공개 운영 경기: 32/32. 공개 팀: 80/80. 공개 팀 기록: 64/64.
- 미인증 보호 API 11개가 401임을 확인했다. 이는 로그인 후 내용/클릭/권한 시나리오를 검증했다는 뜻이 아니다.
- 인증된 일반 사용자·참가팀·관리자 세션 및 실제 브라우저가 없어 보호 화면의 runtime/시각 QA는 미검증이다. 운영 상태 변경/알림 발송/후기 저장/컨택/해체는 실행하지 않았다.
- runtime 코드는 수정하지 않았다. 따라서 발견 사항을 해결됐다고 보고하지 않는다.


## Authorized implementation / deployment follow-up

- User authorization: “아까 말한것들 수정해서 dev에 배포해줘”. All F1/F2/F3/R1/R2 are in scope.
- Base: origin/dev `be228ba1b6dc92ec7e4222d8f8e4e7e9a8e5e14d`; isolated branch `fix/competition-admin-boundaries-20261003`.
- Owned: admin team-match service/UI/tests; shared-record response/hook/component/tests/MSW; recruiting-contact predicate and callers/tests; dissolution route/tests; API/scenario/task docs and changeset.
- Forbidden: schema/storage redesign, production mutations, main promotion, other working-tree WIP.
- [x] Phase 1: revalidate latest dev, establish regression cases (league-first classification included).
- [x] Phase 2: implement all five findings and sync API/mock contracts.
- [x] Phase 3: narrow regression tests, scoped typechecks, committed diff review.
- [x] Phase 4: PR to dev, external review limitation recorded, required CI PASS, dev merge. Copilot clean review unavailable due monthly quota.
- [x] Phase 5a: confirm final Alpha deployed SHA/health; public tournament/league record QA at 390/768/1440.
- [ ] Phase 5c: publish SHA-pinned PR screenshot gallery.
- [ ] Phase 5b: authenticated admin visual/click QA at 390/768/1440 — blocked by missing private account/session; not represented as completed.
- Acceptance: competition generic moderation returns 409 without writes; friendly moderation retains audit logs; admin shows competition title/type/manage link; public managed records choose actual competition fixture routes with sanitized `from`; only non-deleted friendly recruiting rows enable recruiting-only contact; live league dissolution blocker links to league fixture.
- No migration needed. All competitions continue using canonical TeamMatch storage.

### Implementation evidence

- F1: transaction ownership guard before status/audit writes; UI generic moderation removed for league/tournament rows. Direct completion removed from generic modal (existing server rejection preserved).
- F2: tournament badge/title/admin link and correct detail summary, league-first management; `kind=friendly|league|tournament` filter applies equally to list rows and status facets. Type change resets page.
- F3: required nullable leagueId/tournamentId in record response; public managed handoff uses canonical fixture helper and preserves sanitized source; legacy/admin behavior retained; mocks synced.
- R1: shared live friendly recruitment predicate used by CTA and send gate; tests evaluate actual query against tournament, canonical league, soft-deleted and friendly rows.
- R2: live dissolution blocker selects leagueId and chooses league route before tournament route.
- RED: existing UI failed competition badge/detail/handoff expectations; existing backend failed ownership guard/projection and league blocker route expectations. Final GREEN / CI evidence follows.
- Host preflight: ~15GB available, swap unused, low load; serial/minimal-worker checks. Headed Chromium launch/close verified using libraries extracted under /tmp; no system package installation.
- Alpha auth prerequisite: repository-designated private credential memory is absent in this environment; requested existing session/private account file location asynchronously. No authentication bypass and no secrets in repository/PR.

- Final focused checks: API 6 suites / 285 tests PASS; Web 5 files / 97 tests PASS; both v1 `tsc --noEmit` PASS. `git diff --check` PASS. No schema migration or new TODO/FIXME/HACK/XXX markers.
- Verification snapshot before PR completion: external Copilot/CI, dev merge/deploy and authenticated Alpha evidence were pending. Later deployment entries below supersede this snapshot. No local Next runtime/build loops used.

- PR: #1545. Pre-deploy headed public record QA reproduced 404 at 390/768/1440 (same sample, no auth required); before screenshots/report under output/playwright/visual-audit/competition-team-match-before. Browser tree closed.
- Web CI initially rejected one newly copied `text-sm` class under the typography baseline; switched competition links to the existing font-size token (no baseline increase).
- Copilot external review could not start: GitHub reports monthly quota exceeded (HTTP 402). No review/clean verdict exists. Internal committed-diff review and automated CI continue; do not represent quota failure as a passed external review.

- Font-token follow-up: lowered the detail page's literal typography baseline from 15 to 13; same pattern gate now PASS (baseline never increased). Detail regressions 18/18 PASS.

- Latest CI then exposed a pre-existing calendar-dependent Web assertion (`defaultStart != 2026-10-03`) on the current date. Its test fixture clock is now fixed to the existing NOW constant; only Date is faked, leaving MSW/polling timers real. No game-roster product code changed. This test file is added to owned scope solely to restore deterministic required CI.
- Generic status modal now initializes from an allowed option when current status is completed, avoiding a hidden forbidden selection after removing direct completion. New modal regression plus game-roster regressions: 27/27 PASS (10 + 17).


### Deployment progress

- Code PR #1545 merged to dev: `d4c7cfd990370f7af7e175849e69db4a9ca9406c` (merge commit; repository disallows squash).
- Final pre-merge CI run 37042668515: Gates/API/Web PASS, including full unit suites, both builds and migration replay/drift checks. The matching dev-push CI 37043891731 also passed.
- Initial Alpha deployment run 37043891674 succeeded. Actual landing/health 200, DB true, served commit `d4c7cfd990370f7af7e175849e69db4a9ca9406c`, release `1.1.2-alpha.20261003.gd4c7cfd99037`. Public tournament record handoff and source/back navigation passed at 390/768/1440; only expected anonymous auth/me 401 responses occurred.
- Isolated worktree fast-forwarded to origin/dev immediately after merge. The shared root's unrelated WIP and stale feature branch were preserved; the documented macOS sync-back path does not exist in this WSL environment.
- Anonymous league record baseline: 390/768/1440 already reach canonical league fixture detail through the previous generic detail redirect. Treat this as a positive control, not a reproduced league handoff failure. New ownership response removes that intermediate route and must preserve the same outcome.

- Final accessibility follow-up: the new tournament ownership link inherited the league badge's undersized hit area. Both ownership links now explicitly provide 44×44px targets. This preserves the badge destinations and management action while meeting the project minimum. Follow-up PR #1552 passed Gates/API/Web and merged to dev as `1d09562a9b7d1b2be261a89519167ff2a031a576`. Matching dev CI 37047094770 succeeded; final Alpha run 37047094838 succeeded. No claims of authenticated admin visual QA.

### Final deployment and live QA

- Actual Alpha identity: `1d09562a9b7d1b2be261a89519167ff2a031a576`, release `1.1.2-alpha.20261003.g1d09562a9b7d`; landing and API health 200, `data.checks.db: true`. Brief landing 502 during the SSM replacement window resolved before QA; not counted as a normal response.
- Final headed public QA: tournament 3/3, league 3/3 at 390×844, 768×1024, 1440×900. Correct ownership, managed/read-only projection, canonical fixture route, source preservation, actual back click and no horizontal overflow. Screenshots visually inspected at all three widths for both kinds.
- Tournament pages produced one expected anonymous `/api/v1/auth/me` 401 per width; league pages had no error responses. Unexpected page/console/network failures 0 across 6 final pages.
- Baseline + final screenshot set: 12/12 processed (2 competition kinds × 3 widths × before/after). This is public record QA, not authenticated admin UI QA.
- Browser PID/PPID trees recorded; both owned browser trees closed with 0 remaining owned processes. Host preflight: low load, ~14.9GB available, swap unused, Node 1/browser 0. Local Docker daemon unavailable; no local runtime/DB was needed or started.
- Execution details: [Alpha QA scenario](../../docs/scenarios/competition-team-match-alpha-qa-20261003.md). Reusable read-only headed runner: `scripts/qa/verify-competition-team-match-boundaries.mjs`. Raw results remain under ignored output/playwright; only referenced screenshots promoted.
- Review limitation: initial Copilot requests failed monthly quota (HTTP 402); follow-up request failed weekly usage limit (HTTP 429). No fresh external clean review; internal review and required CI PASS are distinct evidence.
- Runtime changes are merged/deployed. Subsequent evidence-only commits publish screenshots/task/scenario on the existing feature branch without triggering another app deployment. Authenticated admin 3-width/click QA remains open because the private session/account is unavailable.

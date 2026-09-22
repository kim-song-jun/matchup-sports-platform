# Task 130 — V1 match create/edit contract audit

## Scope

- Backend: `apps/v1_api/src/matches`, `apps/v1_api/src/team-matches`, creator profile guard
- Frontend: `apps/v1_web/src/components/matches`, `apps/v1_web/src/components/team-matches`
- Tests: focused backend/frontend contract tests and match E2E follow-up

## Goal

Verify personal-match and team-match creation/editing end to end, including creator
profile requirements, team permissions, master-data selection, payload mapping, image
upload persistence, and the absence of hard-coded production form values.

## Acceptance Criteria

- [x] Personal-match creation requires real name, phone, and gender.
- [x] Team-match creation additionally requires an active owner/manager membership.
- [x] Sport, district region, and host team IDs come from live API data.
- [x] Empty image selection persists as `null`; no mock image is silently submitted.
- [x] Uploaded images are included in create/update payloads and survive detail hydration.
- [x] Edit forms hydrate the requested entity without mock or seed fallback.
- [x] Create/update DTO fields match frontend payloads exactly.
- [x] Personal-match detail exposes separate edit and applicant-management actions.
- [x] Personal-match edit exposes every mutable create/update field.
- [x] Focused backend, frontend, and browser scenarios pass.

## Progress Snapshot

- 2026-08-03: Static audit found a hard-coded personal-match mock image submitted for
  empty create/edit image state, plus runtime labels falling back to fixed sport/team
  examples while live selection data was unavailable. Remediation and regression tests
  started on `audit/v1-match-create-edit-contracts`.
- 2026-08-03: Added payload tests for live sport/region/team IDs, create/edit hydration,
  and both empty/uploaded image states. Frontend focused tests pass (12/12).
  Added host-team sport equality validation because the team-match API previously
  allowed a single-sport team to publish a different-sport match. Backend Jest remains
  blocked in this worktree because the shared install cannot resolve `nestjs-pino` and
  the host Node 18 runtime is below the repository's required Node 22.
- 2026-08-04: Upgraded the local toolchain to Node 22, restored the frozen pnpm install,
  regenerated the v1 Prisma client, and rebuilt a clean local QA database/stack. Focused
  backend tests pass (24/24), focused frontend tests pass (12/12 before the follow-up,
  then 7/7 for the touched create clients), and v1 web typecheck passes.
- 2026-08-04: Browser QA found two additional wizard regressions. Draft persistence used
  a passive effect/state updater that could lose the last place/time input during route
  navigation, and the legacy sample cleanup erased legitimate `+7 days, 18:00-20:00`
  values field-by-field. Drafts now persist synchronously through a ref, while legacy
  cleanup only runs when the complete historical sample draft matches.
- 2026-08-04: Production-mode local QA E2E passes for personal matches (2/2), including
  live sport/region IDs, upload, create, detail image hydration, requested-entity edit,
  and update. Team-match create/detail/edit E2E also passes (1/1), including an authorized
  live host team ID and uploaded image persistence. The v1 discovery smoke remains green
  (2/2). Task acceptance criteria are complete.
- 2026-08-06: Follow-up application lifecycle audit covers personal/team-match apply,
  approve, reject, approved presentation, and withdraw. The audit found non-atomic
  resubmit/reject/withdraw transitions, team-match deadline enforcement gaps, false
  approved presentation for unrelated viewers after a team match became matched, and
  missing audit/notification side effects for automatically rejected opponent teams.

## Application Lifecycle Follow-up

- [x] Resubmit, reject, and withdraw transitions only update the status observed by the
  caller and return a conflict when another transition wins first.
- [x] Team-match application and approval reject actions after `deadlineAt`.
- [x] Only the actually approved applicant team sees `승인 완료`; unrelated viewers see
  that opponent selection is closed without receiving approved affordances.
- [x] Automatically rejected team-match applications receive individual status logs and
  manager notifications.
- [x] Focused backend/frontend regression tests and canonical API docs cover the repaired
  lifecycle.

- 2026-08-06: Follow-up remediation completed. Added persisted
  `v1_team_matches.deadline_at`, enforced it on team-match apply/approve, made resubmit,
  reject, and withdraw expected-status transitions, logged/notified every automatically
  rejected applicant team, and limited approved UI to the actual approved viewer. Focused
  verification: API service suites 42/42, web lifecycle suites 21/21, API/web typecheck
  green, and Prisma client generation green.
- 2026-08-07: Host detail now separates `매치 수정` from `신청자 관리`, and edit exposes
  sport, region, content, image, capacity, level/gender/rules, place/address, match time,
  and application deadline. Focused release verification passed before the dev push.
- 2026-09-22: Team-match follow-up fixed an upload race that allowed navigation/create
  before the selected cover image finished uploading, which persisted `imageUrl=null` and
  made the image disappear on detail. The create/edit primary action now stays locked
  through upload completion. Friendly lineup guidance now states that the host may prepare
  attendance before opponent approval and links directly to the team schedule where member
  attendance is confirmed.
- 2026-09-22: Alpha follow-up removed the approved-opponent prerequisite from the host's
  lineup context, allowing HOME lineup saves while AWAY remains a placeholder. Detail heroes
  now center uploaded images with cover sizing instead of exposing only the source image's
  top-left area.
- 2026-09-22: Attendance-roster follow-up removed the team-schedule RSVP gate. Owners and
  managers can now add any active team member directly, including before opponent approval;
  no attendance invitation or member response is required.

## 2026-09-18 개인 매치 참여 중심 기능 확장

- 사용자 승인 범위: 개인 매치 완료·참여 횟수, 후기 진입, 신청 관리 redirect 수정,
  확정 명단, 호스트 채팅, 내 매치 페이지네이션, 시작 전 승인 참가 취소. 득점/승패 기록 제외.
- 기준 `origin/dev` 82698757d, 격리 worktree `/tmp/teameet-personal-match`,
  branch `feat/personal-match-participation` (기존 공유 트리 WIP는 보존).
- 기존 모델/컬럼을 사용하며 migration은 필요하지 않다.
- 완료 기준: endAt이 있으면 종료 이후, 없으면 시작 이후 호스트가 실제 종료를 확인한다.
  취소/보관 매치는 완료 불가. 완료를 반복해도 참여 횟수는 중복되지 않는다.
- [x] Phase 1: 최신 코드 재점검·범위 확정
- [x] Phase 2: API·UI 구현 (7개 항목)
- [x] Phase 3: 단위/실DB/브라우저 검증과 390/768/1440 스크린샷
- [x] Phase 4: 계약 문서·changeset·PR·리뷰 — PR #1223 (`dev` 대상)

### Progress Snapshot

실제 Prisma 참가자 완료 전환과 승인 후 철회가 같은 매치 행 잠금으로 직렬화된다.
완료된 참가자는 채팅 권한을 유지하며, 철회된 참가자는 권한에서 빠진다.
UI에는 완료 확인 모달, 참가 취소 확인 모달, 확정 명단/전체 이력 탭과 내 매치 더 보기를 연결했다.
API 집중 단위 테스트 52건, Web 집중 테스트 53건, API 실DB 통합 테스트 5건과
양쪽 typecheck를 통과했다. 실DB 최초 RED에서 필수 약관 fixture 누락을 확인해
테스트·QA fixture에 실제 동의 절차를 추가한 뒤 GREEN을 확인했다.
headed Chromium으로 390/768/1440px 21개 화면과 완료·채팅·철회·후기·페이지네이션
7개 액션을 검증했으며 console/network 오류는 0건이다. 모바일 고정 CTA가 완료 버튼을
가리던 문제와 완료 상태의 영문 노출도 이 과정에서 수정했다.
PR용 대표 증거는 `docs/screenshots/personal-match-participation/`의 모바일 완료·철회·이력,
태블릿 신청자 관리, 데스크톱 참여 완료 화면 5장으로 승격했다.

## 개인 매치 누락 보완 — 2026-09-19

- [x] Phase 1: 호스트 승인 취소·불참 API와 실제 참가자/신청 상태 및 감사 로그 계약 구현
- [x] Phase 2: 신청자 관리의 처리 액션, 확인·실패 처리와 명단/전체 이력 동기화
- [x] Phase 3: 실제 DB 권한·경합 검증, headed 브라우저 390/768/1440 및 오류 수집 보강
- [ ] Phase 4: canonical API/시나리오/PR 증거 갱신, CI 확인 후 dev 머지
- 승인 취소는 시작 전 active 참가자를 removed로, 불참 처리는 시작 후 완료 확정 전
  active 참가자를 no_show로 전환한다. 호스트 자신의 참가·완료된 참가 이력은 변경하지 않는다.
- 두 액션 모두 호스트 권한, 필수 사유, 매치 행 잠금, 신청 cancelled_by_host 전이,
  참가자·신청 상태 변경 로그를 요구한다. 정원·채팅·후기·활동 횟수에서 제외한다.
- UI는 사용자 선택 A안: 확정 명단의 기존 참가자 관리 메뉴 + 사유 입력 + 기존 확인 모달 재사용.
- 이전 전수 보고의 25/25는 실측 목록이 없으므로 완료 근거로 사용하지 않는다.
  314건 단위 테스트 통과와 이전 21개 캡처/7개 액션은 각각 해당 범위의 증거다.
  기존 QA 보고의 consoleErrors는 pageerror만 측정했으므로 console.error 0건을 뜻하지 않는다.

### Progress Snapshot — host actions

- 추가한 호스트 액션 2/2 구현. Web 집중 테스트 8/8, 실제 PostgreSQL API 통합 테스트 9/9 통과.
- API/Web `tsc --noEmit` 각 1회 통과. `git diff --check` 통과, touched code 신규 TODO/FIXME 없음.
- QA runner PID 88896 종료 및 자체 browser.close 완료. 이번 전용 API/Web 프로세스 종료,
  임시 PostgreSQL만 종료 후 fixture 파일은 재현용으로 보존한다. 다른 작업의 서버·브라우저는 건드리지 않는다.
- headed Chromium `host-actions` 실행: 390/768/1440px 3/3 viewport, 캡처 14/14,
  확인 취소 6건 + 실제 저장 액션 2건 = 8/8 통과. 콘솔 error, pageerror,
  requestfailed, API HTTP 오류 각각 0건. raw report: `output/playwright/visual-audit/personal-participation/host-actions-report.json`.
- Persona: 호스트 이서준 / 참가자 김민준, 새 격리 DB fixture. 운영/alpha 데이터 변경 없음.
- 판정: 390px 버튼/사유/하단 확인 모달 가림 없음, 768px 카드/폼 정렬 정상,
  1440px 기존 shell/카드 폭 유지, 모든 캡처 가로 overflow 없음. 기존 카드·메뉴·확인 모달 재사용.
- 이 두 신규 메뉴의 변경 전 전용 캡처는 없다(기존 화면에 기능 자체가 없었음).
  이전 명단 baseline은 앞선 참여 흐름 QA 증거로만 유지하며 신규 메뉴의 before로 오인하지 않는다.
- 이번 변경은 승인 취소·불참 처리 누락 보완이며 개인 매치 모든 기능에 대한 전수 완료 선언은 아니다.
  당시 후속 항목이었던 `reopen` stale-read 경합은 아래 최종 점검에서 재현·수정했다.

### 호스트 액션 대표 증거

### 최종 점검 재개

- [x] 모집 재개 stale-read 경합 RED/GREEN 및 실제 DB 검증
- [x] 개인 매치 17개 계약 코드/테스트 점검표와 채팅/후기 연계 확인 (배포 E2E 완료와 구분)
- [ ] PR CI와 리뷰 게이트, dev 머지, alpha 배포 검증. alpha 인증 QA는 유효 세션 필요.
- 이번 구현 범위는 backend/docs 중심이며 기존 A안 UI 디자인은 변경하지 않는다.

재개가 cancelled/completed를 recruiting으로 되돌리는 단위 회귀 2건 RED를 먼저 확인한 뒤,
매치 행 잠금 + 최신 상태/시간 재검사로 수정했다. 수정 API도 같은 잠금에서 버전과 참가 인원을
재검사하도록 보완했다. 서비스 단위 34/34, 실DB 기존+추가 13/13 및 시작된 closed 편집 1/1 통과.
이번 backend `tsc --noEmit` 1회 통과, diff check 통과. 재시작한 QA DB는 검증 후 다시 종료했다.
DB: `V1Match`/`v1_matches`, `V1MatchParticipant`/`v1_match_participants`,
`V1StatusChangeLog`/`v1_status_change_logs`; 기존 컬럼 사용, migration 없음.

| # | 계약 | 점검 증거 / 남은 한계 |
|---|---|---|
| 1 | 탐색·필터·정렬 | list/query DTO, matches-client/validation 및 이전 Web CI 성공; alpha 재확인 전 |
| 2 | 상세 CTA·권한 | detail/getViewer/eligibility, 서비스·화면 테스트와 이전 headed 상세 캡처 |
| 3 | 생성·입력·이미지 | create/DTO/form 계약, 기존 create tests와 실DB 모든 시나리오의 실제 생성; 이번 업로드 E2E 재실행 안 함 |
| 4 | 수정·실제 엔티티 | 실DB edit 403, 현재 폼 조회, 동시 동일 버전 200/409, 정원 경합 검증 |
| 5 | 신청 | 실DB requested 생성, 닫힘/취소 후 거절 확인 |
| 6 | 재신청 | expired/rejected/withdrawn/removed 뒤 신청/승인 실DB 확인 |
| 7 | 승인·정원 | 실DB active 전환, 정원 축소와 경합 시 초과 인원 없음 |
| 8 | 거절 | 실DB rejected, 재신청 경로, 상태 로그 코드 확인 |
| 9 | 대기 신청 철회 | 실DB withdrawn, expected-status 조건 확인 |
| 10 | 승인 후 본인 취소 | 실DB cancelled/인원/채팅, 이전 headed 철회 확인 |
| 11 | 호스트 승인 취소 | 실DB removed/권한/감사 로그 + 3폭 메뉴와 실제 처리 |
| 12 | 불참 | 실DB no_show/완료 경합/후기 차단 + 3폭 메뉴와 실제 처리 |
| 13 | 모집 마감 | 실DB closed와 requested→expired, 비호스트 403 |
| 14 | 모집 재개 | stale terminal 상태 회귀 RED→GREEN, 실DB 중복 재개/취소 경합 |
| 15 | 매치 취소 | 실DB cancelled 및 재개/신청 차단, 서비스 권한 테스트 |
| 16 | 경기 완료·활동·후기·채팅 | 완료 실DB/재시도/권한 및 이전 headed 완료·채팅·후기 진입 |
| 17 | 내 매치 이력 | myMatches cursor/관계 조건 및 화면 더 보기 테스트, 이전 headed 51번째 기록 |

코드/계약 점검 17/17이며, 이것을 alpha 전수 E2E 17/17로 해석하지 않는다.
이번 변경의 잔여 외부 게이트: Copilot 요청 CLI와 정식 GraphQL botLogins API가 모두
빈 reviewRequests를 반환한다. 리뷰 clean 판정 불가이므로 사용자 확인 없이 dev 머지하지 않는다.

![모바일 승인 취소 메뉴](../../docs/screenshots/personal-match-participation/host-actions-removed-menu-390.png)
![모바일 불참 확인](../../docs/screenshots/personal-match-participation/host-actions-no_show-confirm-390.png)
![태블릿 승인 취소 메뉴](../../docs/screenshots/personal-match-participation/host-actions-removed-menu-768.png)
![데스크톱 불참 메뉴](../../docs/screenshots/personal-match-participation/host-actions-no_show-menu-1440.png)
![불참 저장 이력](../../docs/screenshots/personal-match-participation/host-actions-no_show-persisted-390.png)

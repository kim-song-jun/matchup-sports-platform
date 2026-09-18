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

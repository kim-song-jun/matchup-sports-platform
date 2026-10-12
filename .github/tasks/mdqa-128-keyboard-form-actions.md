# Task MDQA-128: Keep mobile form actions clear of the soft keyboard

Status: In Progress
**Owner**: frontend implementation
**Created**: 2026-10-12

## Context

On `/teams/new`, the soft keyboard reduces the visual viewport while `.tm-app-frame` and `.tm-scroll-area` establish a clipped scrollport. The global keyboard rule changes every `.tm-fixed-cta` to `position:absolute`; that makes the action bar anchor to the scroll area and overlap fields as the area scrolls. The report screenshot shows the team name/logo content behind the bottom action bar. Sol reproduced the overlap with simulated IME state; that does not count as physical-device verification.

## Goal

Keep create/edit form actions in document flow while an IME is open, reveal the focused field inside the usable scrollport, and focus the first missing required team field with its guidance on submit.

## Original Conditions (must all be satisfied)

- [ ] Form inputs and helper/error text remain readable while the keyboard is open.
- [ ] Form CTA does not cover form content and stays reachable after scrolling.
- [ ] Team required-field submission focuses the first missing field and exposes its guidance.
- [ ] Preserve the existing native iOS `data-teameet-native-keyboard="open"` path.
- [ ] Physical Android and iOS soft-keyboard verification remains explicitly unverified until devices are available. Reporter identifies the Android device as Samsung Galaxy S26 Plus with Samsung Internet; OS version is unknown.

## User Scenarios

### Create a team with the keyboard open

As a team owner, I want the input under the keyboard to scroll into view and the submit controls to follow the form so I can read and edit all content without an overlay covering it.

Steps: open `/teams/new`, focus a text input, open the soft keyboard, scroll through required and optional fields, and reach the form end.

Expected result: the field and its helper remain visible in the scrollport; the action row follows form content instead of covering it.

### Submit missing team fields

As a team owner, I want an invalid submit to focus the first missing required field and show the matching error guidance beside it.

Steps: submit with missing team name, then with name filled but sport missing, then with only region missing; correct one value and resubmit.

Expected result: focus proceeds name → sport → region on each submit, remains with the field while typing, and guidance stays visible and associated with the focused control.

## Fixed CTA consumer inventory

Runtime inventory from `rg -n 'className=.*tm-fixed-cta' apps/v1_web/src --glob '*.tsx'`: **25 runtime instances** in 16 source files; the additional pull-to-refresh occurrence is a test fixture. Form routes matching the keyboard selector are **8 variants across 4 consumers**: team create/edit (`teams-page.tsx`), match create/edit (`matches-page.tsx`), team-match create/edit (`team-matches-page.tsx`), profile edit and sports settings (`my-api-clients.tsx`). The selector affects `.tm-fixed-cta` descendants of a `.tm-scroll-area` that contains any `.tm-create-shell`; it intentionally leaves unrelated fixed actions outside form scroll areas unchanged.

All 25 runtime instances classified:

| Consumer | Instances | Classification |
| --- | ---: | --- |
| `components/reviews/reviews-page.tsx` | 2 | Review/detail actions; outside form selector |
| `app/teams/[id]/games/[gameId]/roster/game-roster-client.tsx` | 1 | Roster action; outside form selector |
| `app/teams/[id]/game-rosters/team-game-rosters-client.tsx` | 1 | Roster action; outside form selector |
| `app/tournaments/[id]/tournament-detail-client.tsx` | 1 | Tournament detail action; outside form selector |
| `app/teams/[id]/tactics/[gameId]/tactics-board-client.tsx` | 1 | Tactics action; outside form selector |
| `app/tournaments/[id]/apply/tournament-apply-client.tsx` | 3 | Tournament application flow; outside form selector |
| `app/team-matches/[id]/lineup/lineup-client.tsx` | 1 | Lineup action; outside form selector |
| `app/tournaments/[id]/registrations/[registrationId]/roster/tournament-roster-client.tsx` | 1 | Registration roster action; outside form selector |
| `components/team-matches/team-matches-page.tsx` | 2 | Detail action outside form; create/edit action included |
| `components/matches/matches-page.tsx` | 2 | Detail action outside form; create/edit action included |
| `components/teams/team-dissolution-view.tsx` | 1 | Destructive detail action; outside form selector |
| `components/teams/team-invite-landing-client.tsx` | 1 | Invite action; outside form selector |
| `components/teams/team-invite-gather-client.tsx` | 1 | Invite action; outside form selector |
| `components/teams/teams-page.tsx` | 2 | Team detail action outside form; create/edit action included |
| `components/my/my-api-clients.tsx` | 4 | Profile edit and sports settings included; location and withdrawal actions outside form selector |
| `components/my/record-consent-first-answer.tsx` | 1 | Consent action; outside form selector |

## Test Scenarios

### Happy path

- [x] Team create/edit required errors focus first missing control and associate visible inline guidance (6 create/edit cases).
- [x] Typing after an error does not steal focus; resubmission focuses the next missing field.
- [x] Static form CTA focus correction scrolls a field above the visible scrollport boundary.
- [x] Keyboard CSS contract keeps form CTA in normal flow and removes fixed-footer reserve.

### Edge cases

- [x] Browser and native keyboard selectors share the form-only flow rule.
- [x] Fixed CTA behavior outside form scroll areas remains unchanged by selector scope.
- [x] Invalid submit 뒤 visual viewport resize/scroll settle에서도 활성 필드와 연결 설명을 함께 드러내요.
- [ ] Desktop fixed-action focus behavior remains unchanged.

### Error paths

- [ ] Server or permission errors with all required values present continue focusing the form-level error.

### Mock data updates needed

- [ ] None; no API or fixture contract changes.

## Parallel Work Breakdown

### Frontend

- [x] Keep form actions inline in keyboard state and rebalance the reserved form-shell bottom padding.
- [x] Focus first missing team field, provide inline accessible error guidance, and scroll it within the visible scrollport.
- [x] Add focused RED→GREEN tests.
- [x] Record fixed CTA inventory and processed M/N coverage; do not claim unrun route or device QA.

### Sequential

- [ ] Alpha before/after browser evidence by root agent; no browser launched by this implementation lane.
- [ ] Android/iOS physical soft-keyboard verification when hardware is available.

## Acceptance Criteria

- [ ] Original conditions met.
- [x] Focused regression tests green.
- [ ] Viewport-settle regression has captured RED and GREEN evidence (수정 전 RED는 미실행).
- [x] CSS preserves non-form fixed CTA consumers.
- [x] Source diff contains no unrelated changes or new TODO/FIXME/HACK/XXX markers.
- [ ] Alpha visual QA and physical-device QA status reported separately.

## Tech Debt Resolved

- Replaces scrollport-relative absolute positioning for form CTAs with normal document flow during IME state.
- Removes the fixed-footer padding reserve from form shells while the keyboard is open.
- Corrects validation focus to the first missing field and keeps field guidance connected to it.

## Security Notes

No authentication, API, persistence, or user-data contract changes.

## Risks & Dependencies

- `:has(.tm-create-shell)` applies to any fixed CTA descendant of a form-bearing scroll area; inventory identified 8 create/edit route variants across 4 consumers. Direct live QA coverage will remain partial unless those routes are separately exercised.
- Simulated IME DOM reproduction is not physical Android/iOS keyboard evidence. Alpha before screenshots exist; after browser QA is root-owned.

## Ambiguity Log

| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-12 | root review | How to prevent typing from stealing focus while supporting repeat submit? | Focus on error transition; submit handler schedules focus to the current first missing field. |

## Progress Snapshot

- Fixed CTA consumer inventory: 25/25 runtime instances reviewed across 16 files; 8/8 create/edit route variants identified across four form consumers.
- Regression coverage: team form create/edit component cases and generic keyboard CSS/scrollport contracts; direct route-level browser coverage 0/8 in this lane.
- Alpha before evidence is root-owned. Alpha after visual evidence and physical Android/iOS keyboard QA remain NOTRUN here; the reported simulated IME run is not physical-device evidence.
- Reporter repro environment: Samsung Galaxy S26 Plus, Samsung Internet; Android OS version not provided. Physical-device reproduction remains NOTRUN.
- Focus RED→GREEN: initial `pnpm --filter v1_web exec vitest run src/components/teams/teams-page.test.tsx src/app/globals.test.ts --maxWorkers=1 --minWorkers=1` failed 4 / passed 152; focused follow-up after preserving `QueryClientProvider` during rerender passed 7 / skipped 65 with `pnpm --filter v1_web exec vitest run src/components/teams/teams-page.test.tsx -t '입력 중에는 오류 효과|필수값 오류에서 첫 누락 항목' --maxWorkers=1 --minWorkers=1` (exit 0). The initial typing failure was a test-only remount: rerender dropped the provider, so the input was disconnected and the mount effect correctly focused the next missing control. The corrected regression asserts the input remains connected while typing; no production string/ref guard remains.
- Geometry RED: `pnpm --filter v1_web exec vitest run src/components/teams/teams-page.test.tsx -t '입력은 보이지만 연결된 오류 설명' --maxWorkers=1 --minWorkers=1` failed as expected when only the control rect was considered (input inside the scrollport, described error text below it). After measuring the union of control and `aria-describedby` rects, this regression passed in the subsequent focused team form run; no extra geometry run was needed.
- CSS selector GREEN: `pnpm --filter v1_web exec vitest run src/components/teams/teams-page.test.tsx src/app/globals.test.ts -t '필수값 오류에서 첫 누락 항목|keeps form actions in document flow' --maxWorkers=1 --minWorkers=1` passed 4 / skipped 152 (exit 0).
- Type check: `pnpm --filter v1_web exec tsc --noEmit` first reported three nullable-error prop mismatches at `teams-page.tsx:1124,1165,1178`; each was fixed with `?? undefined`. Final captured run exited 0 (`TSC_EXIT=0`).
- Pattern gate: from `apps/v1_web`, `node scripts/v1-pattern-check.mjs` exited 0; undefined CSS tokens, invalid font-size classes, spacing-grid deviations, radius literals, and baseline drift were all 0.
- This lane did not execute browser route QA (0/8) or physical-device soft-keyboard QA. The review follow-up ran the focused server-error regression noted below; alpha before/after evidence remains parent-owned.

## PR #1859 리뷰 후속

- 사용자가 입력을 수정해도 마지막 제출에서 누락된 항목을 유지해요. 다음 제출 전까지 `aria-describedby`가 다른 필드로 이동하지 않아요.
- 누락된 항목이 이미 포커스된 상태에서 다시 제출해도 같은 대상을 측정하고 화면에 드러내요. 새 포커스 이벤트가 없어도 동작해요.
- 필수 입력 오류는 라이브 알림을 하나만 제공해요. 필드에 연결된 인라인 설명이 알림을 맡고, 화면에 보이는 폼 요약은 별도 라이브 영역이 아니에요. 일반 서버·권한 오류는 폼 수준 알림과 포커스 경로를 유지해요.
- 고정·인라인 CTA의 가시성 보정은 각 입력과 연결된 `aria-describedby` 요소의 사각형을 함께 사용해요. 두 모드 모두 실제 `.tm-scroll-area`와 visual viewport의 교집합을 가시 영역으로 계산해요. 고정 모드는 CTA 상단을 하단 경계에 추가로 적용해요. 상단 경계에는 scroll area의 56px inset이 반영돼요.
- RED: 검토 대상 회귀 4개가 안내 이동, 중복 알림, 고정 CTA 가림, 재제출 시 가림 문제로 실패했어요(실패 4 / 건너뜀 71). 상단 inset 변경 후 첫 통합 실행에서는 빠른 포커스 전환 fixture도 실패했어요. 다음 대상인 `정원`의 jsdom 기본 rect가 `(0,0)`이라 scrollport 위쪽에 잘린 것으로 판정됐어요. fixture에 가시 rect를 지정하고 기존 취소 단언은 유지했어요.
- GREEN: `pnpm --filter v1_web exec vitest run src/components/teams/teams-page.test.tsx src/app/globals.test.ts -t '필수값 오류|입력 중에는 오류 효과|fixed CTA가 있을 때도|같은 오류 항목에 재제출|inline CTA 상태에서는|입력은 보이지만 연결된 오류 설명|실제 create 폼의 팀 소개|실제 edit 폼의 팀 소개|이미 보이는 필드|빠른 다음 포커스|저장 오류가 생기면 화면 밖 안내|fixed CTA 상태에서도 scroll-area 상단 밖|keeps form actions in document flow|changes fixed chrome and scroll bounds' --maxWorkers=1 --minWorkers=1` 명령은 exit 0으로 끝났고, 두 파일에서 22개가 통과하고 144개가 건너뛰었어요. 상단 56px 가림 케이스도 통과했어요. 이 케이스는 코드 수정과 함께 추가해 통합 묶음에서 처음 실행했기 때문에 수정 전 별도 RED 결과는 없어요. 앞서 검토한 회귀 4개는 별도 RED 증거가 있어요.
- 이번 리뷰 후속에서는 CSS와 keyboard viewport bridge 코드를 수정하지 않았어요. 실제 Android/iOS 키보드 QA와 alpha 경로 QA는 이 작업에서 검증하지 않았어요.

## PR #1859 리뷰 후속 2

- 리뷰 지적은 재현 가능한 경로예요. invalid submit의 최초 포커스 직후 필드와 설명을 한 번 드러내도, 모바일 키보드가 visual viewport 높이를 줄인 뒤에는 `TeamFormPageView`가 active control만으로 오류 설명의 가림을 회복하지 않았어요.
- `TeamFormPageView`는 `window.resize`와 `visualViewport`의 `resize`·`scroll`을 한 animation frame으로 합친 뒤, 포커스가 폼 안에 남아 있고 요소가 연결돼 있는지 확인해 기존 `revealFieldAndDescription`을 다시 호출해요. 일반 문서 `window.scroll`은 감시하지 않아 키보드와 무관한 스크롤에서 폼 필드를 되감지 않아요. 기존 계산이 필드와 `aria-describedby` bounds, 상단 56px inset, fixed CTA 경계를 계속 함께 적용해요. effect cleanup은 등록한 listener와 대기 frame을 정리해요.
- 새 회귀 테스트는 invalid submit으로 첫 누락 이름 필드에 포커스한 뒤 viewport 높이가 줄어드는 상황에서, 입력은 보이고 연결된 오류 설명은 가려진 상태를 만들어요. keyboard open에 해당하는 fixed→static CTA 전환과 fixed 유지 두 경우 모두 viewport `resize` 뒤 설명을 드러내는 scroll 요청이 발생해야 해요. 연속 resize/scroll 이벤트는 한 frame으로 합쳐지고 unmount 뒤 대기 frame은 취소돼요.
- 회귀 테스트는 구현과 함께 작성해서 수정 전 RED는 실행하지 않았어요. 실패를 만들기 위한 임시 롤백도 하지 않았어요.
- GREEN 명령 `pnpm --filter v1_web exec vitest run src/components/teams/teams-page.test.tsx -t 'invalid submit 뒤 visual viewport가 줄면|필수값 오류|입력 중에는 오류 효과|fixed CTA가 있을 때도|같은 오류 항목에 재제출|inline CTA 상태에서는|입력은 보이지만 연결된 오류 설명|이미 보이는 필드|빠른 다음 포커스|fixed CTA 상태에서도 scroll-area 상단 밖' --maxWorkers=1 --minWorkers=1`은 exit 0으로 끝났어요. `teams-page.test.tsx`에서 19개 통과, 59개 건너뜀, 총 78개였고 Vitest duration은 4.45초예요. 새 파라미터 회귀 2개(fixed 유지/static 전환), 관련 필수값·가시성·반복제출·취소 테스트가 함께 통과했어요.
- 테스트 전 preflight는 12 CPU core, load average `16.76 / 14.84 / 15.90`, system-wide memory free 52%였어요. 정확한 실행파일 기준 Node 프로세스는 전후 137개, Safari platform helper 9개였어요. Docker daemon은 실행 중이 아니었고 3013/8121 listener는 없었어요. 명시된 진행 지시에 따라 이 상태만 기록하고 최소 worker 1로 진행했어요.
- 실행 세션 ID는 `61104`예요. 테스트가 첫 PID 표본 전에 종료돼 OS PID/PPID를 캡처하지 못했어요. 사후 focused test 프로세스는 0개, Node executable 수는 기준 137개로 돌아와 별도 종료 신호는 필요하지 않았어요. 이 PID 캡처 한계는 남겨요.
- root는 최종 소스에서 `tsc --noEmit`과 `node scripts/v1-pattern-check.mjs`를 직렬 실행해 모두 exit 0을 확인했어요. typecheck PID 82714, 패턴 검사 PID 83062는 종료됐어요. 별도 gpt-6-sol이 최종 소스의 뷰포트 처리·가시성·cleanup을 검토해 코드 PASS를 판정했어요.
- Alpha 시각 QA와 물리 Android/iOS 키보드 QA는 계속 미확인 상태예요. 로컬 빌드·브라우저는 실행하지 않았어요.

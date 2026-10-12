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
- This lane did not execute browser route QA (0/8), server-error focused regression, or physical-device soft-keyboard QA. These remain separate verification items; the parent's alpha before/after evidence is separately owned.

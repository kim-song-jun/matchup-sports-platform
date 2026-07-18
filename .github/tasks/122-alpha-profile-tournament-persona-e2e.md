# Task 122 — Alpha Profile and Tournament Persona E2E

Owner: codex
Status: In progress
Priority: P0
Target: both
Mode: CODE + QA

## Purpose

`dev`의 실제 alpha 배포에서 일반 사용자, 팀 오너, 관리자 페르소나가 프로필 편집과 대회 전체 생명주기를 끝까지 사용할 수 있는지 검증한다. 브라우저 확인은 화면 도달만으로 통과시키지 않고, 저장·권한·중복 제출·새로고침 유지·결과/영상/개인 시상까지 사용자에게 보이는 결과로 판정한다.

## Runtime Gate

- 대상: `https://alpha.teameet.co.kr`
- 실행 전 호스트 load/memory/swap, Node/브라우저/MCP 수, Docker 상태를 기록한다.
- Playwright/MCP는 새 프로세스를 증식시키지 않는 인앱 브라우저 연결만 사용한다.
- 2026-07-19 03:50 KST 기준 Codex app-server PID `51610`이 12시간 이상 된 설정을 유지하고 Playwright MCP root 14개가 남아 있다. Codex 앱을 완전히 재시작해 비활성화된 Playwright plugin 설정을 적용하기 전에는 UI 자동화를 시작하지 않는다.
- 자동 검증은 직렬 1-worker, 한 시나리오씩 실행한다. 전체 Web unit suite는 실행하지 않는다.
- 생성/수정 시나리오는 원래 값을 먼저 기록하고 cleanup 단계에서 정확히 복구한다. 다른 세션과 공용인 seed 행은 삭제하지 않는다.

## Alpha Tournament Fixture Contract

Canonical seed: `apps/v1_api/prisma/seed-alpha-tournament-qa.ts`

| State | Tournament ID | Public expectation | 2026-07-19 API proof |
|---|---|---|---|
| draft | `aa100000-0000-4000-8000-000000000001` | public 404 | 404 |
| open | `aa100000-0000-4000-8000-000000000002` | 모집 CTA와 신청 진입 | 200, groups 0, fixtures 0 |
| closed | `aa100000-0000-4000-8000-000000000003` | 신청 마감, 공개 대진 | 200, groups 1, fixtures 3 |
| in progress | `aa100000-0000-4000-8000-000000000004` | 진행 중 경기/중간 순위 | 200, groups 1, fixtures 3 |
| completed | `aa100000-0000-4000-8000-000000000005` | 결과·영상·시상·후기 | 200, groups 1, fixtures 7, videos 2, awards 3, reviews 2 |
| cancelled | `aa100000-0000-4000-8000-000000000006` | public 404 | 404 |

Public Web route proof on the same check:

- open/closed/in-progress/completed detail: 200
- completed `/bracket`, `/results`, `/awards`: 200
- cancelled detail: 404

API/Web 200 is readiness evidence only. It does not replace viewport, interaction, console, network, or permission QA.

## Browser Scenario Matrix

### PROFILE-ALPHA-001 — Profile read and edit persistence

Persona: ordinary authenticated alpha user

1. Open `/my`; confirm identity, activity summary, and `프로필 수정` entry.
2. Open `/my/profile/edit`; record original nickname, email, phone, birth date, gender, and profile image.
3. Submit unchanged data; confirm no duplicate-check dead end and return to `/my`.
4. Change one reversible field, save, reload, and open a fresh tab; confirm the same value.
5. Open `/users/{userId}` as another/guest context; confirm only public fields appear.
6. Restore the exact original field value and verify reload.
7. At 390×844, 768×1024, and 1440×900 confirm the fixed CTA does not cover the last field, focus order remains logical, and there is no document overflow.

### PROFILE-ALPHA-002 — Image upload safety and errors

Persona: ordinary authenticated alpha user

1. Upload a valid local image under 2 MB; confirm upload request success, preview, save, reload, and public avatar reflection.
2. Select a non-image file; confirm client rejection and zero upload request.
3. Select an image over 2 MB; confirm explicit size error and zero save mutation.
4. Simulate or observe an upload failure; confirm no success navigation and a retryable user-visible error.
5. Restore the original profile image URL.

### TOURN-ALPHA-001 — Public status lifecycle

Persona: guest, ordinary user

1. Open the six fixture IDs in order.
2. Draft and cancelled must be indistinguishable public 404 surfaces.
3. Open shows the apply CTA; closed removes apply and exposes the published bracket; in-progress shows live state; completed exposes bracket/results/awards.
4. No state may silently reuse another tournament or fall back to mock success.

### TOURN-ALPHA-002 — Completed results, videos, awards

Persona: guest, ordinary user

1. Open completed `/bracket`; confirm group, semi-final, final, third-place, champion, and horizontal reachability on mobile.
2. Open `/results`; confirm final ranking and seven fixture results.
3. Switch to `경기 영상 2`; open a video, exercise close and next/previous controls, and verify failed media does not look played.
4. Open `/awards`; confirm podium, three personal awards, two reviews, and flow navigation back to results.
5. Capture 390×844, 768×1024, and 1440×900 with console errors, failed requests, and document overflow recorded.

### TOURN-ALPHA-003 — Registration permission and duplicate submit

Personas: guest, ordinary team member, owner/manager, admin

1. Guest entry to `/apply` must reach the canonical auth wall.
2. Ordinary member must not submit a team registration.
3. Owner/manager sees only eligible owned/managed teams; sport mismatch and already-registered teams are disabled with a reason.
4. Submit once and observe the created or updated registration state.
5. Repeat the same action quickly; only one registration is created and the UI remains deterministic.
6. Reload `/my`; confirm the same status.
7. Restore the alpha QA registration to its original seed state through the authorized admin contract.

### TOURN-ALPHA-004 — Admin lifecycle and permissions

Personas: ordinary user, support/read-only admin, ops/owner admin

1. Ordinary user receives no admin tournament data or shell.
2. Support can read roster/campaign data but cannot mutate protected fields.
3. Ops/owner opens `/admin/tournaments/{id}` and verifies registration, bracket, campaign, sponsor, popup, review, and award tabs stay inside the admin shell.
4. Group creation/team assignment controls precede the standings table in a coherent desktop/tablet/mobile flow.
5. Publish/recalculate/status actions show confirmation, partial failure, and persisted audit result rather than toast-only success.
6. Restore any mutated status/content to the recorded original value.

## Acceptance Criteria

- [x] Alpha public API proves the six canonical fixture visibility/status contracts.
- [x] Alpha public Web routes prove detail and completed subroute reachability.
- [ ] Profile persistence and upload scenarios pass in the in-app browser with exact cleanup.
- [ ] Public lifecycle and completed media/award scenarios pass at three viewports.
- [ ] Registration permission/duplicate-submit scenario passes without duplicate data.
- [ ] Admin role matrix and bracket-management layout pass with audit persistence.
- [ ] Console errors, failed requests, overflow, screenshots, persona, cleanup, alpha version, and SHA are recorded inline.
- [ ] Focused v1 Playwright coverage is added only after the live selectors and cleanup contract are proven; no legacy `/profile` or port `3003` contract is copied into v1 tests.

## Out of Scope

- Production data mutation or production deployment.
- `main` merge, production SemVer tag, or production release.
- Full Web unit suite.
- Ambiguous “new page” implementation. A separate user decision is required to choose between profile rebuild, mercenary create, or admin tournament-create work.

## Progress Snapshot

- [x] Current v1 routes, hooks, alpha tournament seed, existing v1 E2E, and scenario docs cross-checked.
- [x] Confirmed existing `e2e/v1-tests/tournament.spec.ts` only proves list/detail/apply reachability.
- [x] Confirmed no v1 profile Playwright spec exists.
- [x] Verified alpha fixture payloads and public routes with sequential low-load HTTP checks.
- [ ] Restart Codex app and confirm Playwright MCP root count no longer grows.
- [ ] Run live profile and tournament browser scenarios.
  - 2026-07-19 partial PASS: completed detail에서 실제 링크로 results → `경기 영상 2` → awards를 이동했고, 7경기 결과·2영상·3개인상·2후기를 화면에서 확인했다.
  - awards responsive PASS: mobile `390×844`, tablet `768×1024` document horizontal overflow `0`; desktop 데이터 렌더와 podium/prize/award/review 구성을 확인했다.
  - remaining: 영상 lightbox close/previous/next, results 전체 responsive 캡처, console/network 기록, profile/upload, registration/admin mutation과 cleanup.
- [ ] Add the narrow automated regression cases proven by the live run.
- [ ] Update `docs/scenarios/index.md` with final evidence and cleanup receipt.

### Current browser evidence

- `output/playwright/visual-audit/task-122-alpha-persona/completed-detail-desktop.png`
- `output/playwright/visual-audit/task-122-alpha-persona/completed-results-videos-desktop.png`
- `output/playwright/visual-audit/task-122-alpha-persona/completed-awards-desktop.png`
- `output/playwright/visual-audit/task-122-alpha-persona/completed-awards-mobile-viewport.png`
- `output/playwright/visual-audit/task-122-alpha-persona/completed-awards-tablet-viewport.png`

Desktop awards audit found a real layout gap: the left prize/awards card stretches to the longer reviews column and leaves a large blank area. It remains FAIL-for-polish until the required Lazyweb report is reviewed and a scoped layout rebalance is implemented; mobile/tablet do not reproduce the overflow or blank-height issue.

## Ambiguity Log

- The phrase “new page” is not mapped to one canonical v1 route. It remains gated instead of being guessed.
- Alpha QA tournament persona rows do not include passwords in the seed. Browser mutation scenarios must use an explicitly authorized login flow or an isolated QA account; header-auth posture must not be weakened to make tests convenient.

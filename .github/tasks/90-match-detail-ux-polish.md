# 90. Match Detail UX Polish

Date: 2026-06-04
Owner: codex
Status: complete

## Scope

- Backend: `apps/v1_api/src/matches`, `apps/v1_api/prisma`
- Frontend: `apps/v1_web/src/components/matches`, `apps/v1_web/src/hooks`, `apps/v1_web/src/types`
- Scenario docs: `docs/scenarios/03-match-flows.md`

## Requirements

- [x] Match detail share and notification buttons must be clickable.
- [x] Match deadline time must persist and be returned from API responses.
- [x] Match participant count includes the host who created the match.
- [x] Match detail should not show a separate application-method info row.
- [x] Approved state is shown in the bottom application-status area.
- [x] Match detail should not show the description text block.
- [x] Participant section shows the match creator only.
- [x] Host can navigate to the existing match management surface.
- [x] Bottom chat entry is available only after match participation is approved.

## Validation

- [x] `pnpm --filter v1_api exec tsc --noEmit`
- [x] `pnpm --filter v1_web exec tsc --noEmit`
- [x] Focused browser smoke for `/matches/:id` when local runtime is available.

## Progress Snapshot

- 2026-06-04: Task opened from user feedback on match detail page.
- 2026-06-04: Implemented v1 match detail polish. Share/notification now have actions, deadline eligibility is enforced, detail participants show only the host, description/application-method rows are removed, approved state is shown in the bottom status area, and chat is only rendered for approved participants.
- 2026-06-05: Responsive route smoke covered `/matches/match-1` at 320/390/430 widths with 0 issues. Report: `output/playwright/v1-responsive-smoke/responsive-rerun-match-320/report.md`.
- 2026-09-04 hotfix: 매치 하단 탭의 기본 진입을 팀매치로 바꾸고 유형 세그먼트를 `팀 → 개인` 순서로 정리했다. 개인·팀 공개 목록은 기본 최신 생성순으로 통일했으며, 시작 또는 신청 마감이 지난 raw 모집 행을 기본 모집 목록에서 제외한다. 개인·팀 상세 이미지 액션은 공유만 남겼고, 팀 신뢰 상태 `sample`은 실제 신뢰 신호가 아니므로 홈팀 카드에서 숨긴다.

## 2026-09-04 Hotfix Acceptance

- [x] 매치 탭을 누르면 팀매치 목록이 먼저 열린다.
- [x] 팀/개인 세그먼트에서 팀이 첫 번째다.
- [x] 개인·팀 매치 기본 목록은 최신 생성순이다.
- [x] 목록의 모집 여부와 상세의 신청 가능 상태가 시작·마감 시각 기준으로 일치한다.
- [x] 두 상세 히어로 우측에는 공유만 남는다.
- [x] 팀 상세의 `sample` 신뢰 상태는 사용자에게 노출하지 않는다.

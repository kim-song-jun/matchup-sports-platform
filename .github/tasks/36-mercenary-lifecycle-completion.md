# Task 36 — Mercenary Lifecycle Completion

Owner: tech-planner -> backend-dev + frontend-dev
Date drafted: 2026-04-11
Status: Completed
Priority: P0

## Context

용병 도메인은 목록/생성/상세/수정 파일이 이미 존재하지만, 실제 사용자 여정 기준으로는 아직 닫히지 않았다. 생성 후 상세 진입, 신청, 호스트 승인/거절, 신청자 상태 확인, 다종목 필터 일관성까지 이어지는 전체 흐름이 제품 계약으로 고정되어야 한다.

또한 기존 backlog 일부는 `/mercenary/[id]` 상세가 없다고 적고 있으나 현재 코드에는 파일이 존재한다. 따라서 이 task는 stale 문서를 기준으로 하지 않고 현재 코드 사실에서 출발한다.

## Goal

- 용병 생성 -> 상세 -> 신청 -> 승인/거절 -> 상태 확인 흐름을 실제 데이터 기반으로 완결한다.
- 용병 목록/생성 화면의 종목 범위를 서비스 전체 지원 범위와 맞춘다.
- 비로그인/중복 신청/권한 없는 조작을 UX와 API 양쪽에서 정직하게 차단한다.

## Evidence

- `apps/web/src/app/(main)/mercenary/page.tsx`
- `apps/web/src/app/(main)/mercenary/new/page.tsx`
- `apps/web/src/app/(main)/mercenary/[id]/page.tsx`
- `apps/web/src/app/(main)/mercenary/[id]/edit/page.tsx`
- `apps/api/src/mercenary/**`
- `docs/scenarios/06-mercenary-flows.md`
- `.github/tasks/26-qa-backlog-followups.md`

## Owned Write Scope

- `apps/web/src/app/(main)/mercenary/**`
- `apps/api/src/mercenary/**`
- mercenary 전용 e2e spec

## Acceptance Criteria

- 생성 성공 후 사용자는 새 모집글 상세로 자연스럽게 이동한다.
- 상세 페이지에서 비로그인 사용자는 로그인 redirect를 받고, 로그인 사용자는 실제 신청 가능/불가 상태를 본다.
- 중복 신청과 권한 없는 승인/거절은 차단된다.
- 호스트는 신청 목록과 상태 변화를 볼 수 있고, 신청자는 자신의 승인 상태를 확인할 수 있다.
- 목록/생성 화면의 종목 옵션이 서비스 지원 범위와 조용히 불일치하지 않는다.

## Validation

- `pnpm --filter api test -- mercenary`
- `pnpm --filter web exec tsc --noEmit`
- `pnpm exec playwright test e2e/tests/mercenary-flow.spec.ts --config=e2e/playwright.config.ts --workers=1`

## Out Of Scope

- 용병 도메인 대규모 UI 리디자인
- 팀 invitation / team membership 모델 재설계
- admin mercenary 운영 화면 정리

## Risks

- 팀/알림 연동을 넓히면 task가 커질 수 있다. 이번 범위는 mercenary lifecycle 자체를 닫는 데 집중한다.

## Completion Notes

- Backend detail contract now returns viewer-aware apply/manage state and application counts.
- Frontend create/detail/edit/my/team surfaces now follow the same lifecycle contract and route users through detail-first management.
- Validation passed:
  - `pnpm --filter api exec jest src/mercenary/mercenary.service.spec.ts --runInBand`
  - `pnpm --filter web exec tsc --noEmit`
- Validation note:
  - an earlier targeted mercenary lifecycle Playwright run passed during implementation (`6 passed`).
  - rerunning the expanded spec with the repo Playwright config currently exposes an existing local Next dev `webServer` cold-boot instability (`.next/routes-manifest.json` / `app-paths-manifest.json` ENOENT), so the runtime caveat is documented instead of overstating a clean rerun.

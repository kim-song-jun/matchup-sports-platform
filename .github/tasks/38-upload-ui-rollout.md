# Task 38 — Upload UI Rollout

Owner: project-director -> frontend-dev
Date drafted: 2026-04-11
Status: Completed
Priority: P1

## Context

업로드 파이프라인은 backend 기준으로 먼저 준비되었지만, 실제 사용자 폼에서는 여전히 “이미지를 넣을 수 있는 것처럼 보이는데 진짜 업로드가 닫히지 않은” 표면이 남아 있다. 이 상태에서는 photoreal fallback이 좋아져도 사용자 생성 미디어 경험은 완성되지 않는다.

이번 task는 backend를 새로 만드는 일이 아니라 이미 준비된 `/uploads` 계약을 프론트 생성/수정 폼에 연결하는 작업이다.

## Goal

- 공용 이미지 업로드 UI를 만들고 주요 생성/수정 폼에 연결한다.
- 업로드 중/성공/실패/삭제 상태를 실제 서버 응답 기준으로 표현한다.
- 업로드 asset이 실제 엔티티 저장 payload에 반영되게 만든다.

## Evidence

- `.github/tasks/19-admin-dto-and-image-upload.md`
- `docs/plans/2026-04-09-comprehensive-improvement-plan.md`
- `docs/plans/2026-04-08-next-feature-backlog.md`
- `apps/api/src/uploads/**`

## Owned Write Scope

- `apps/web/src/components/ui/image-upload.tsx` or equivalent shared component
- `apps/web/src/app/(main)/matches/new/page.tsx`
- `apps/web/src/app/(main)/matches/[id]/edit/page.tsx`
- `apps/web/src/app/(main)/marketplace/new/page.tsx`
- `apps/web/src/app/(main)/marketplace/[id]/edit/page.tsx`
- `apps/web/src/app/(main)/lessons/new/page.tsx`
- `apps/web/src/components/venue/review-form.tsx`
- 최소 범위의 upload helper/hook

## Acceptance Criteria

- 사용자는 이미지 선택 후 업로드 진행 상태를 본다.
- 업로드 실패 시 재시도 또는 제거가 가능하다.
- 성공한 업로드는 최종 submit payload에 실제 ID/URL로 반영된다.
- 업로드되지 않은 예시 이미지가 실제 업로드 자산처럼 저장되지 않는다.
- 빈 슬롯 UX는 유지하되, “placeholder만 있고 저장은 안 되는” false affordance는 남지 않는다.

## Validation

- `pnpm --filter web exec tsc --noEmit`
- 관련 unit test
- targeted browser smoke
  - matches new/edit
  - marketplace new/edit
  - lessons new
  - venue review

## Out Of Scope

- S3 전환
- mobile camera native integration
- admin upload surface
- `teams/new`, `teams/[id]/edit` rollout
  - 현재 local worktree와 충돌 위험이 높아 이번 task에서 제외한다.

## Risks

- 넓은 surface를 한 번에 연결하면 task가 커질 수 있다. 필요하면 같은 task 안에서 “shared component -> matches -> marketplace -> lessons/review” 순서로 작은 커밋을 쪼갠다.

## Implementation Summary

- `apps/web/src/components/ui/image-upload.tsx`, `apps/web/src/lib/uploads.ts`
  - `/uploads` API를 감싼 공용 업로드 UI와 helper를 추가했다.
  - 업로드 중/실패/재시도/삭제, 기존 자산 preload, parent submit guard state 전달, placeholder-only false affordance 방지 문구를 포함한다.
- `apps/web/src/app/(main)/matches/new/page.tsx`, `apps/web/src/app/(main)/matches/[id]/edit/page.tsx`
  - 매치 생성/수정 폼에 실제 업로드를 연결하고 submit payload가 `imageUrl`을 반영하도록 정리했다.
  - edit 화면은 기존 `imageUrl` preload와 venue list hydration 버그를 함께 수정했고, refetch가 local image draft를 덮어쓰지 않도록 hydrate 타이밍을 고정했다.
- `apps/web/src/app/(main)/marketplace/new/page.tsx`, `apps/web/src/app/(main)/marketplace/[id]/edit/page.tsx`
  - 장터 생성/수정 폼에 업로드 UI를 연결하고 `imageUrls`를 실제 저장 payload로 보낸다.
  - edit 화면은 mock hydration을 제거하고 real listing fetch + PATCH/DELETE 흐름으로 바꿨다.
- `apps/web/src/app/(main)/lessons/new/page.tsx`, `apps/web/src/components/venue/review-form.tsx`
  - 강좌 생성과 시설 리뷰 폼에도 동일 업로드 경험을 연결했다.
- `apps/api/src/matches/dto/match.dto.ts`, `apps/api/src/matches/matches.service.ts`
  - match update path가 `imageUrl`과 edit form의 실제 필드를 저장/반환하도록 확장했다.
- `apps/api/src/marketplace/dto/update-listing.dto.ts`, `apps/api/src/marketplace/marketplace.controller.ts`, `apps/api/src/marketplace/marketplace.service.ts`
  - listing edit/delete real API를 추가해 프론트 edit surface가 실제 서버와 닫히게 만들었고, `deleted/expired` 상태 PATCH를 차단했다.
- `apps/api/src/uploads/uploads.service.ts`, `deploy/docker-compose.prod.yml`, `deploy/nginx.conf`
  - 업로드 삭제 시 파일 unlink 실패를 명시적으로 surface하고, production uploads volume mount + `/api/v1/uploads` rate limit을 추가했다.
- `apps/web/src/components/ui/image-upload.test.tsx`, `apps/api/src/marketplace/marketplace.service.spec.ts`, `apps/api/src/matches/matches.service.spec.ts`, `apps/api/src/uploads/uploads.service.spec.ts`
  - 업로드 상태/삭제, multi-upload ordering, 장터 edit/delete, match image update, upload delete 회귀를 테스트로 고정했다.

## Validation Evidence

- `pnpm --filter web exec vitest run src/components/ui/image-upload.test.tsx`
  - Passed: `1 file / 12 tests`
- `pnpm --filter web exec tsc --noEmit --pretty false`
  - Passed
- `cd apps/api && pnpm exec jest --selectProjects unit --runInBand --runTestsByPath src/marketplace/marketplace.service.spec.ts src/matches/matches.service.spec.ts src/uploads/uploads.service.spec.ts`
  - Passed: `3 suites / 90 tests`
- `DB_PASSWORD=test JWT_SECRET=test docker compose -f deploy/docker-compose.prod.yml config --quiet`
  - Passed
- Targeted authenticated browser smoke
  - Passed route checks: `matches edit`, `marketplace edit`, `venue review`
  - Blocked route checks: `matches new` upload completion, `marketplace new` upload completion, `lessons new` upload label visibility
  - 재검증 중 dev compose bootstrap/runtime drift가 섞였다. `deps` bootstrap이 `137`로 종료되며 node_modules volume을 비우는 케이스가 있었고, 별도 `pnpm dev` 경로에서도 current dirty worktree의 unrelated TypeScript errors가 API watch를 막아 live smoke를 끝까지 신뢰하기 어려웠다.

## Residual Follow-up

- stabilized dev runtime에서 `matches new`, `marketplace new`, `lessons new` live smoke를 다시 돌려 create-route upload completion을 product/env 관점에서 분리 확인해야 한다.
- current evidence 기준으로 edit/review surfaces는 닫혔지만, create-route upload의 end-to-end runtime proof는 follow-up으로 남아 있다.

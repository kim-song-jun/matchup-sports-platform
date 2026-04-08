# Match E2E Deepening

Date: 2026-04-08
Owner: codex
Status: in_progress
Related:
- `docs/scenarios/03-match-flows.md`
- `docs/scenarios/index.md`
- `docs/plans/2026-04-07-qa-remediation-plan.md`

## Scope

- `MATCH-001` 매치 생성 후 목록/상세/내 매치/새 탭/새로고침 반영
- `MATCH-002` 다중 사용자 컨텍스트 참가와 정원 초과 차단
- `MATCH-003` blocked reason 문서화

## Verified In This Round

- Desktop Chrome: `pnpm exec playwright test e2e/tests/match-join-flow.spec.ts --config=e2e/playwright.config.ts --project='Desktop Chrome' --workers=1 --reporter=line` -> `13/13` passed
- Mobile Chrome: `pnpm exec playwright test e2e/tests/match-join-flow.spec.ts --config=e2e/playwright.config.ts --project='Mobile Chrome' --workers=1 --reporter=line --grep 'Deep match flows'` -> `2/2` passed

## Fixed During Execution

1. `apps/web/src/app/(main)/matches/new/page.tsx`
   - create form이 UI 전용 필드(`customVenue`, `rules`)를 DTO 그대로 POST하던 버그 수정
   - backend가 아직 지원하지 않는 direct-input venue 경로는 등록된 시설 선택으로 guard 처리
   - deep-flow 자동화를 위한 stable `data-testid` 추가

2. `e2e/fixtures/auth.ts`
   - dev-login token 주입 후 `/home`의 authenticated state가 실제 hydrate될 때까지 기다리도록 보강

3. `e2e/fixtures/api-helpers.ts`
   - `createMatchViaApi()`를 실제 backend DTO(`venueId`) 기준으로 정렬
   - `findVenueBySport()` 추가

4. `e2e/tests/match-join-flow.spec.ts`
   - hidden duplicate DOM 대응을 위해 `:visible` selector contract 적용
   - host / participant / overflow-user 다중 컨텍스트 시나리오 추가

## Remaining Gaps

1. `MATCH-003` blocked
   - frontend는 `/matches/:id/edit`, 취소 액션, `api.patch('/matches/:id')`를 기대하지만 backend `matches` controller/service에 해당 route가 없다.

2. Direct-input venue UX drift
   - 현재 schema/model에는 `Match.venueId`만 있고 `venueName`이 없다.
   - UI의 `customVenue` 입력은 backend 지원 전까지 준비 중 상태로 취급해야 한다.

3. Host detail live sync
   - 이번 라운드는 host detail의 참가 인원 변화를 reload-based persistence로 검증했다.
   - socket 또는 polling 기반 새로고침 없는 sync는 별도 follow-up이다.

## Next Recommended Changes

1. `MATCH-003` 구현 방향 결정
   - backend `PATCH /matches/:id` 추가 후 edit/cancel E2E 작성
   - 또는 현재 edit/cancel UI를 기능 플래그/가드로 정리

2. `customVenue` 지원 여부 결정
   - schema에 `venueName` nullable 필드 추가
   - 또는 UI에서 직접 입력을 완전히 비활성화

3. match detail sync 정책 결정
   - `socket join + match room emit`
   - 또는 `refetchOnFocus/polling`

# frontend-dev

## Role
- Codex builder for all frontend work in MatchUp.
- Claude mapping: `frontend-ui-dev` + `frontend-data-dev`.

## Owned Surfaces
- `apps/web/src/**`
- `apps/web/public/mock/**`
- `apps/web/messages/**`

## Must Keep True
- Design priority is `.impeccable.md` → `globals.css @theme` → existing shared components.
- Tailwind stays utility-first and token-first.
- Reuse `EmptyState`, `ErrorState`, `Modal`, `Toast`, `ChatBubble` before ad-hoc markup.
- Keep `useRequireAuth()` on protected routes and avoid auth-wall false negatives.
- Keep dark mode pairs, 44x44 touch targets, proper ARIA and focus handling.
- UI/API contract changes sync `apps/web/src/test/msw/`, `apps/web/public/mock/`, `e2e/fixtures/`, related types and inline test mocks.

## Validation
- `pnpm --filter web exec tsc --noEmit`
- `pnpm --filter web test`
- Playwright or manual route checks when flow behavior changes

## Report
- Changed files
- Tests and type checks
- MSW/mock sync status
- UX or a11y risks left open

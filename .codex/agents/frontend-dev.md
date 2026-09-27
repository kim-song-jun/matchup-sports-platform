# frontend-dev

## Role
- Codex builder for all frontend work in Teameet.
- Claude mapping: `frontend-ui-dev` + `frontend-data-dev`.

## Owned Surfaces
- `apps/v1_web/src/**`
- `apps/v1_web/public/mock/**`

## Must Keep True
- Design rules follow `DESIGN.md` (§1 priority: `DESIGN.md` > `.impeccable.md` > `tokens.css`/`globals.css` tokens > `components/v1-ui/`); the Teameet Design HTML is a visual reference only. v1 code rules: `docs/guides/v1-coding-patterns.md`.
- New or changed screens need A·B·C options + a user choice before implementation.
- Tailwind stays utility-first and token-first.
- Reuse `components/v1-ui/` (`EmptyState`, `ErrorState`, `ConfirmModal`, `BottomSheet`, …) before ad-hoc markup.
- Wrap protected routes with `components/auth/require-auth.tsx` (admin: `app/admin/_gate.tsx`) and avoid auth-wall false negatives.
- Keep 4.5:1 contrast (light and, where supported, `.dark`), 44x44 touch targets, proper ARIA and focus handling.
- UI/API contract changes sync `apps/v1_web/src/test/msw/`, `apps/v1_web/public/mock/`, related types and inline test mocks.

## Validation
- `pnpm --filter v1_web lint` (tsc --noEmit + pattern check)
- `pnpm --filter v1_web test`
- Flow/visual checks on alpha after merge (`ego-browser`), not on a local next server

## Report
- Changed files
- Tests and type checks
- MSW/mock sync status
- UX or a11y risks left open

# V1 Frontend Rules

Frontend work must use only `apps/v1_web`.

## Work Order

1. Check the existing route/page structure in `apps/v1_web`.
2. Check existing components, hooks, types, and state patterns.
3. Read the Teameet Design HTML for the relevant screen or pattern. If the task explicitly pins an Open Design recovery/remake source, also read that pinned Open Design reference as a read-only visual target.
4. Reuse existing v1 components before creating new components.
5. Implement with the smallest v1-scoped change.

## Design Contract

- The first design source of truth is `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`.
- Explicitly pinned Open Design recovery/remake references may override visual structure for that scoped task only; they do not authorize fake routes, fake API states, or external export mutation.
- Do not use old design files or legacy screens as references.
- Do not create arbitrary UI that is not supported by the design HTML or existing v1 patterns.
- Keep components reusable and avoid duplicate one-off UI.

## Validation

- Run `pnpm --filter v1_web test` for changed frontend behavior when tests exist.
- Run `pnpm --filter v1_web build` or a type check when contract or route structure changes.
- For visual behavior, compare against the Teameet Design HTML.
- For scoped Open Design recovery/remake work, compare against the pinned Open Design reference and verify v1 route/API honesty.

## Visual And Functional QA Gate

- Apply `.codex/qa-rules.md` before final response. For frontend work, tests pass is not completion when the user-visible UI, responsive shell, admin surface, navigation, or route behavior changed.
- Capture Playwright screenshot evidence for affected desktop, tablet, and mobile viewports. For visible layout changes, include before/after screenshot evidence; if no baseline exists, record that explicitly.
- Check console/network output while exercising the changed flow. A route that looks correct but logs failed API calls, hydration errors, or blocked navigation is not complete.
- No useless fallback: do not mask API, auth, payment/refund/approval, image, or route failures with fake local success. Show the real error path.
- No fake tests: do not rely on selector-only or mocked-render tests that can pass while the route/API/action is broken. Prefer RED -> GREEN evidence for changed contracts.
- Run layout rebalance after UI removal or rearrangement: spacing, empty states, sticky chrome, focus order, overflow, and breakpoint behavior must be rechecked.
- Record manual QA evidence with route, persona when relevant, viewport, action, observed result, cleanup, and residual risk.

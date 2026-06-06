# V1 QA Operating Rules

This file is the canonical Teameet QA and review policy. Every non-trivial implementation, review, UI/design change, and `.ulw` loop must route through these rules before completion.

## No useless fallback (No Useless Fallback)

Do not add useless fallback paths that turn broken runtime behavior into fake success. If an API, permission check, checkout/refund/approval action, image contract, or data dependency fails, surface the real error state and preserve the failure reason. Transparent local mock image fallback that is already part of the v1 asset contract is allowed only when it is explicitly documented and does not hide a failed user action.

## No fake tests (No Fake Tests)

Tests must fail for the real user-visible contract or regression they claim to protect. Do not write tests that only assert a mock was called, a selector exists, or a hard-coded sample renders while the actual route/API/action can still be broken. Prefer RED -> GREEN: capture a failing run first, then change code or rules, then capture the passing run.

## Visual verification before completion (Visual Verification Before Completion)

For UI, layout, responsive, design-system, or route-shell changes, tests pass is not completion. Completion requires browser-based manual QA with Playwright screenshot evidence, console/network inspection, and a written verdict for the changed route or component. Docs-only policy updates can skip screenshots, but must still prove the policy is searchable and enforced by a contract test.

## Before/after screenshot evidence (Before/After Screenshot Evidence)

When a UI or design change alters visible layout, spacing, density, imagery, navigation, admin surface, or responsive behavior, keep before/after screenshot evidence for the relevant desktop, tablet, and mobile viewports. If a baseline is unavailable, record that explicitly and capture the current after-state plus the reason no before image exists.

## Layout rebalance (Layout Rebalance After UI Removal Or Rearrangement)

After removing, hiding, or rearranging a visible element, rebalance the surrounding layout. Check spacing, alignment, scroll position, empty areas, tab/focus order, sticky chrome, and desktop/tablet/mobile breakpoints. A removed element must not leave a collapsed gap, awkward column width, orphaned heading, or fixed-width page feel.

## No scope retreat (No Scope Retreat)

If the user asks for all routes, all pages, all admin surfaces, fixed agent count, or a comprehensive QA loop, establish the total count and report processed M/N. Do not silently reduce scope because the audit is large. If runtime access blocks a route, record the blocker, route, persona, and remaining unverified count.

## Tech-Debt Grep (Tech Debt Grep)

Before finishing implementation or instruction changes, run a touched-path grep for `TODO`, `FIXME`, `HACK`, and `XXX`. Existing unrelated markers may remain, but new markers in touched files need an explicit reason, owner, and follow-up path.

## Committed-tree verification (Committed Tree And PR Diff Verification)

Local tests on a dirty working tree are not enough for PR readiness. Verify the committed-tree or intended PR diff: inspect `git diff --name-only`, check `git diff --check`, confirm no untracked import or untracked route dependency is required for the app to build, and confirm generated evidence matches the files that would be shipped.

## Shared-tree pathspec safety (Shared Tree And Pathspec Commit Safety)

This repo often has unrelated local WIP. Never use broad staging such as `git add -A` for a scoped task. If the user asks for a commit, use explicit pathspecs only, for example `git commit -- <pathspec>`, then inspect the resulting commit with `git show --stat` and `git show --name-only`. Sub-agents must not perform sub-agent self-commit unless the root agent explicitly assigns that exact commit scope.

## No left accent rail (No Left Accent Rail Or Purple Decoration Anti-Pattern)

Do not use a decorative left accent rail, arbitrary purple decoration, tint-heavy panels, dashed novelty borders, or glow treatments as a default way to make a page look designed. Use hierarchy, spacing, typography, semantic color only, and direct task affordances. Color must communicate state, category, or action, not fill empty space.

## Manual QA Evidence

Manual QA is required when behavior, UI, admin permissions, routing, or responsive layout changes. Evidence should include the command or browser scenario, persona if relevant, viewport if relevant, observed result, failure logs if any, cleanup steps, and whether the result covers the full requested scope.

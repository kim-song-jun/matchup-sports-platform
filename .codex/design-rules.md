# V1 Design Rules

All UI and UX decisions must use the Teameet Design HTML as the source of truth:

- `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`

Exception: if the user explicitly pins an Open Design recovery/remake task, the pinned `docs/reference/open-design/**` assets and the user-provided Open Design export are read-only visual references for that task only. Use them to match the requested screen, but do not turn design-only pages into runtime routes without a v1 route/API contract.

## Priority

1. Explicitly pinned Open Design recovery/remake reference, only for its scoped task
2. Teameet Design HTML
3. Existing v1 frontend implementation in `apps/v1_web`
4. Existing v1 design tokens and shared components

Do not use old screen designs, deprecated design documents, or legacy frontend pages as references.

## Implementation Rules

- Reuse existing v1 components and patterns before creating new UI.
- Match the intent of the design HTML over personal preference.
- Keep screen structure, spacing, hierarchy, and interaction patterns aligned with the design source.
- If design information is missing, ask for the required file or screen context instead of guessing.

## Visual QA And Anti-Patterns

- Apply `.codex/qa-rules.md` for design review and UI implementation completion. For visual work, tests pass is not completion.
- Use Playwright screenshot evidence and before/after screenshot evidence for changed routes, components, admin pages, and responsive breakpoints.
- Run layout rebalance after removing, hiding, or moving visible UI: check hierarchy, spacing, columns, sticky areas, scroll length, and desktop/tablet/mobile density.
- Do not use no left accent rail workarounds: no decorative left rail, no arbitrary purple decoration, no tint-heavy panels, no dashed novelty border, and no glow treatment as default styling.
- Use hierarchy, spacing, typography, and semantic color only. Color must indicate state, category, or action rather than fill empty space.
- During visual QA, inspect console/network output. A design that hides failed data, auth, or action states is not acceptable.

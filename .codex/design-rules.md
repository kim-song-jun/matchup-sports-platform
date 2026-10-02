# V1 Design Rules

UI and UX rules follow `DESIGN.md` (canonical design source of truth). Its §1 "Source Of Truth Order" is the priority:

1. `DESIGN.md` — canonical design rules, surface policy, review checklist
2. `.impeccable.md` — brand memo / compatibility summary
3. `apps/v1_web/src/app/tokens.css` `@theme` — dimension tokens (radius, spacing, shadow, control size, easing, breakpoint)
4. `apps/v1_web/src/app/globals.css` `:root` — color and type tokens
5. Shared primitives and layout patterns in `apps/v1_web/src/components/` (especially `components/v1-ui/primitives.tsx`)
6. Audit/report/task documents — evidence and history only

v1 code rules for the same surface: `docs/guides/v1-coding-patterns.md`.

## Visual References (not rule sources)

- `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html` — handoff design mock. Use it as a visual reference for layout intent; when it conflicts with `DESIGN.md` or the tokens, `DESIGN.md` wins.
- Scoped Open Design: if the user explicitly pins an Open Design recovery/remake task, the user-provided Open Design export is a read-only visual reference for that task only. Do not turn design-only pages into runtime routes without a v1 route/API contract.

Do not use old screen designs, deprecated design documents, `docs/archive/`, or legacy frontend pages as references.

## Implementation Rules

- Reuse existing v1 components and patterns before creating new UI.
- Follow `DESIGN.md` over personal preference; use the handoff HTML only for layout intent.
- Keep screen structure, spacing, hierarchy, and interaction patterns aligned with `DESIGN.md` and existing v1 patterns.
- New or changed screens need A·B·C options + a recommendation chosen by the user before implementation (`CLAUDE.md` "UI 착수 규칙").
- If design information is missing, ask for the required file or screen context instead of guessing.

## Visual QA And Anti-Patterns

- Apply `.codex/qa-rules.md` for design review and UI implementation completion. For visual work, tests pass is not completion.
- Collect before/after screenshot evidence on alpha (`ego-browser`, 390/768/1440) for changed routes, components, admin pages, and responsive breakpoints — not on a local next server.
- Run layout rebalance after removing, hiding, or moving visible UI: check hierarchy, spacing, columns, sticky areas, scroll length, and desktop/tablet/mobile density.
- Do not use no left accent rail workarounds: no decorative left rail, no arbitrary purple decoration, no tint-heavy panels, no dashed novelty border, and no glow treatment as default styling.
- Use hierarchy, spacing, typography, and semantic color only. Color must indicate state, category, or action rather than fill empty space.
- During visual QA, inspect console/network output. A design that hides failed data, auth, or action states is not acceptable.

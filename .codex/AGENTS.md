# Teameet Codex Rules

## Highest Priority Rule

Every task must begin by reviewing the project rules in `.codex/`.

Before starting analysis, implementation, refactoring, DB design, Prisma work, API design, frontend work, review, QA, or documentation work:

1. Read `AGENTS.md`.
2. Read `.codex/AGENTS.md`.
3. Read `.codex/qa-rules.md`.
4. Read the relevant `.codex/*.md` rule files.
5. Read the relevant files inside `apps/v1_api` and/or `apps/v1_web`.
6. For UI or design work, read `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`.

Do not assume architecture, API structure, database structure, Prisma schema, frontend patterns, or design conventions before the `.codex` review is complete.

## Valid Sources

Only these sources are valid for project analysis and implementation:

- Backend: `apps/v1_api`
- Frontend: `apps/v1_web`
- Design source of truth: `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`
- Scoped Open Design source: when the user explicitly pins an Open Design recovery/remake task, `docs/reference/open-design/**` and the user-provided Open Design export may be used as read-only visual references for that task only. Design-only Open Design pages do not become valid runtime routes without a v1 route/API contract.
- Codex project rules: `.codex/*`

## Legacy Ban

Do not use legacy code, deprecated code, old API designs, old DB designs, old Prisma schemas, old migrations, old seeds, old mock data, or old screen designs as references.

If a similar feature exists outside `apps/v1_api` or `apps/v1_web`, ignore it unless the user explicitly asks for legacy cleanup or migration analysis.

## Conflict Order

If instructions conflict, follow this order:

1. `.codex/AGENTS.md`
2. `.codex/*.md`
3. `AGENTS.md`
4. v1 implementation evidence in `apps/v1_api` and `apps/v1_web`
5. Runtime configuration and package scripts

Legacy implementations never outrank v1 sources.

## Quality Operating Rules

`.codex/qa-rules.md` is the canonical policy for completion, review, manual QA, and `.ulw` work loops.

- No useless fallback and No fake tests: do not hide runtime failure behind mock success, silent success, or selector-only tests.
- Visual verification before completion: for UI/design/responsive/admin surface work, tests pass is not completion; capture Playwright screenshot evidence, before/after screenshot evidence, and console/network checks.
- Layout rebalance and No left accent rail: after visible UI removal or rearrangement, rebalance spacing and breakpoints; avoid decorative rails, purple/tint/dashed/glow decoration, and use semantic color only.
- No scope retreat: for all-routes/all-pages/comprehensive QA, define the total scope and report processed M/N.
- Tech-Debt Grep and Committed-tree verification: grep touched paths for new debt markers and verify diff scope, untracked import risk, `git diff --check`, and committed-tree readiness.
- Shared-tree pathspec safety: never use `git add -A` in this shared dirty tree for scoped work; if committing is explicitly requested, use `git commit -- <pathspec>` and verify with `git show --stat` and `git show --name-only`. Sub-agents must not perform sub-agent self-commit without exact root-assigned scope.
- manual QA evidence must include command/browser scenario, persona or route when relevant, viewport when relevant, observed result, cleanup, and residual risk.

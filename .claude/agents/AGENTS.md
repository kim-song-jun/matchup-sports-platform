# Teameet Compatibility Agent Rules

This directory contains compatibility and historical agent prompt files.

For current work, the canonical rules are:

1. `AGENTS.md`
2. `.codex/AGENTS.md`
3. `.codex/qa-rules.md`
4. `.codex/*.md`
5. `.codex/agents/*.md`

Only these implementation sources are valid:

- Backend: `apps/v1_api`
- Frontend: `apps/v1_web`
- Design: `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`
- Scoped Open Design: when the user explicitly pins an Open Design recovery/remake task, `docs/reference/open-design/**` and the user-provided Open Design export are read-only visual references for that task only.

If any file in `.claude/agents/` mentions old paths such as `apps/api`, `apps/web`, old ports, `.impeccable.md`, `DESIGN.md`, or legacy design/API/DB rules, treat those mentions as historical compatibility context and do not use them as project truth.

Do not use legacy code, legacy DB schemas, legacy Prisma schemas, legacy mock data, or deprecated design documents as references unless the user explicitly asks for legacy cleanup or migration work.

## Compatibility QA Gate

Claude compatibility prompts inherit `.codex/qa-rules.md`; historical prompt text cannot override it.

- No useless fallback and No fake tests: do not turn broken runtime behavior into fake success, and do not accept tests that only prove mocks or selectors.
- Visual verification before completion: for UI/design/responsive/admin changes, tests pass is not completion; require Playwright screenshot evidence, before/after screenshot evidence, and console/network checks.
- Layout rebalance and No left accent rail: rebalance layout after visible UI removal or rearrangement; avoid decorative rails, purple/tint/dashed/glow styling, and use semantic color only.
- No scope retreat: all-routes/all-pages/comprehensive QA must report processed M/N and explicit blockers.
- Tech-Debt Grep, Committed-tree verification, and Shared-tree pathspec safety are required before PR-ready claims. Do not use `git add -A`; commit only with explicit pathspecs such as `git commit -- <pathspec>`. Sub-agents must not perform sub-agent self-commit without exact root-assigned scope.
- manual QA evidence must include scenario, route/persona/viewport where relevant, result, cleanup, and residual risk.

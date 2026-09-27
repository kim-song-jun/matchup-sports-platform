# Teameet Compatibility Agent Rules

This directory holds the Claude agent definitions (`*.md` with a `name:` frontmatter) plus compatibility prompt files.

For current work, the canonical rules are, in order:

1. `CLAUDE.md` (repository canonical guide)
2. `AGENTS.md` (Codex summary — must not contradict `CLAUDE.md`)
3. `.codex/AGENTS.md`, `.codex/qa-rules.md`, `.codex/*.md`, `.codex/agents/*.md`

Only these implementation sources are valid:

- Backend: `apps/v1_api`
- Frontend: `apps/v1_web`
- Android / iOS shells: `apps/v1_android`, `apps/v1_ios`
- Design rules: `DESIGN.md` (priority order in its §1); visual reference: `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`
- Scoped Open Design: when the user explicitly pins an Open Design recovery/remake task, the user-provided Open Design export is a read-only visual reference for that task only.

The legacy v0 apps (`apps/api`, `apps/web`) are removed (PR #1313, snapshot tag `legacy-v0-final`). Do not use legacy code, legacy DB/Prisma schemas, legacy mock data, or `docs/archive/` material as references unless the user explicitly asks for legacy cleanup or migration work. If an agent file here still contradicts `CLAUDE.md`, `CLAUDE.md` wins — fix the agent file in the same change.

## Compatibility QA Gate

Claude compatibility prompts inherit `.codex/qa-rules.md`; historical prompt text cannot override it.

- No useless fallback and No fake tests: do not turn broken runtime behavior into fake success, and do not accept tests that only prove mocks or selectors.
- Visual verification before completion: for UI/design/responsive/admin changes, tests pass is not completion. Verify on **alpha** (not a local next server) with the `ego-browser` skill — before/after screenshots at 390/768/1440, console/network checks. The PR gallery is posted after merge once alpha serves the merge commit.
- Layout rebalance and No left accent rail: rebalance layout after visible UI removal or rearrangement; avoid decorative rails, purple/tint/dashed/glow styling, and use semantic color only.
- No scope retreat: all-routes/all-pages/comprehensive QA must report processed M/N and explicit blockers.
- Tech-Debt Grep, Committed-tree verification, and Shared-tree pathspec safety are required before PR-ready claims. Do not use `git add -A`; commit only with explicit pathspecs such as `git commit -- <pathspec>`. Sub-agents must not perform sub-agent self-commit without exact root-assigned scope.
- manual QA evidence must include scenario, route/persona/viewport where relevant, result, cleanup, and residual risk.

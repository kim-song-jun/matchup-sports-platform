# Task 102 - POSCO MDS QA Policy Hardening

## Goal

Persist the POSCO MDS-derived anti-pattern and verification rules into Teameet so future Codex/Claude work can keep applying them during `.ulw`, implementation, review, UI QA, and PR preparation.

## Scope

- Canonical QA policy: `.codex/qa-rules.md`
- Routing docs: `AGENTS.md`, `.codex/AGENTS.md`
- Frontend/design completion rules: `.codex/frontend-rules.md`, `.codex/design-rules.md`
- Agent compatibility routing: `.codex/agents/prompts.md`, `.codex/agents/workflow.md`, `.claude/agents/AGENTS.md`, `.claude/agents/prompts.md`
- Scenario documentation: `docs/scenarios/14-policy-hardening-rules.md`, `docs/scenarios/index.md`
- Contract test: `scripts/qa/v1-quality-operating-rules.test.mjs`

## Acceptance Criteria

- [x] RED proof exists for the new policy contract test before rules are added.
- [x] GREEN proof exists after policy/routing updates.
- [x] Manual QA confirms required policy anchors are searchable in repo instruction files.
- [x] Visual/frontend rules explicitly state that tests pass is not completion for UI/design/admin surface work.
- [x] Shared dirty tree safety is explicit: no `git add -A`, use `git commit -- <pathspec>` only when commit is requested, and verify diff scope.

## Required Policy Anchors

- No useless fallback
- No fake tests
- Visual verification before completion
- Before/after screenshot evidence
- Layout rebalance
- No scope retreat
- Tech-Debt Grep
- Committed-tree verification
- Shared-tree pathspec safety
- No left accent rail
- manual QA
- RED -> GREEN

## Progress Snapshot

- 2026-06-07: ULW notepad created, RED contract test captured in `output/ulw-policy-qa/red.txt`, GREEN captured in `output/ulw-policy-qa/green.txt`, CLI manual evidence captured in `output/ulw-policy-qa/policy-presence.cli.txt` and `output/ulw-policy-qa/visual-rules.cli.txt`. tmux is unavailable in this environment and the error is recorded in `output/ulw-policy-qa/policy-presence.tmux.txt` / `output/ulw-policy-qa/visual-rules.tmux.txt`.

# 14 - Policy Hardening Rules

Status: Verified

## Purpose

Verify that Teameet keeps the POSCO MDS-derived QA operating rules searchable, routed, and test-protected across Codex and Claude compatibility instructions.

## Automated Contract

Run:

```sh
node --test scripts/qa/v1-quality-operating-rules.test.mjs
```

Expected:

- `quality operating rules are persisted in project instructions` passes.
- `frontend and design rules require visual evidence beyond green tests` passes.
- `shared-tree and review safety rules are enforced` passes.

## Manual QA

Preferred tmux run:

```sh
tmux new-session -d -s ulw-qa-policy-presence 'cd /Users/sungjun/Documents/projects/matchup-sports-platform && rg -n "No useless fallback|No fake tests|Visual verification before completion|Before/after screenshot evidence|Tech-Debt Grep|committed-tree" AGENTS.md .codex/AGENTS.md .codex/qa-rules.md .codex/frontend-rules.md .codex/design-rules.md .codex/agents/prompts.md .codex/agents/workflow.md .claude/agents/AGENTS.md .claude/agents/prompts.md; printf "exit=%s\n" "$?"'
tmux capture-pane -pt ulw-qa-policy-presence -S -2000
tmux kill-session -t ulw-qa-policy-presence
```

Expected:

- The transcript contains all required policy anchors.
- The transcript ends with `exit=0`.
- The tmux session is cleaned up.

Current evidence:

- tmux unavailable: `output/ulw-policy-qa/policy-presence.tmux.txt`
- Equivalent direct CLI verification: `output/ulw-policy-qa/policy-presence.cli.txt`

## Visual Rule Check

Run:

```sh
tmux new-session -d -s ulw-qa-visual-rules 'cd /Users/sungjun/Documents/projects/matchup-sports-platform && rg -n "Playwright screenshot|before/after|layout rebalance|tests pass is not completion" .codex/frontend-rules.md .codex/design-rules.md .codex/qa-rules.md; printf "exit=%s\n" "$?"'
tmux capture-pane -pt ulw-qa-visual-rules -S -2000
tmux kill-session -t ulw-qa-visual-rules
```

Expected:

- The transcript proves UI/design/admin work requires visual evidence beyond green tests.
- The tmux session is cleaned up.

Current evidence:

- tmux unavailable: `output/ulw-policy-qa/visual-rules.tmux.txt`
- Equivalent direct CLI verification: `output/ulw-policy-qa/visual-rules.cli.txt`

## Shared Tree Safety Check

Run:

```sh
{ git diff --name-only -- AGENTS.md .codex/AGENTS.md .codex/qa-rules.md .codex/frontend-rules.md .codex/design-rules.md .codex/agents/prompts.md .codex/agents/workflow.md .claude/agents/AGENTS.md .claude/agents/prompts.md .github/tasks/102-posco-mds-qa-policy-hardening.md docs/scenarios/14-policy-hardening-rules.md docs/scenarios/index.md scripts/qa/v1-quality-operating-rules.test.mjs; git ls-files --others --exclude-standard -- .codex/qa-rules.md .github/tasks/102-posco-mds-qa-policy-hardening.md docs/scenarios/14-policy-hardening-rules.md scripts/qa/v1-quality-operating-rules.test.mjs; } | sort -u
```

Expected:

- The output covers only the intended policy/routing/test/scenario files for this change.
- No broad staging or commit command is required for this scenario.

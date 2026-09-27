# Task 68 — E2E Analyzer Monitor + Agent-All Orchestration

Owner: frontend + infra + docs
Date drafted: 2026-04-15
Status: Active Monitoring
Priority: P0

## Context

The repository has multiple screenshot-analysis remnants (`tests/ui-scenarios/`, ad-hoc watcher scripts, and `ultraplan/` visual-audit orchestration), but there is no single repo-native runner that can:

1. persist screenshot-set queue state to disk,
2. detect when a feature-level image set is complete,
3. delegate image analysis without skipping any image,
4. hand findings into an `agent-all` remediation workflow, and
5. survive interrupted sessions by resuming from filesystem state instead of ephemeral loop memory.

The user also introduced a new **11-device intake contract** for incoming feature screenshot sets:

`MS → MM → ML → TS → TM → TL → DS → DM → DL → DXL → DXXL`

This intake contract is for analyzer grouping/order and does **not** replace the current Playwright broad-capture 9-viewport baseline unless separately migrated.

## Goal

Ship a repo-native E2E analyzer runner that can be executed manually, in watch mode, or from cron/monitor loops. The runner must persist queue/task/report state under `ultraplan/`, generate actionable per-set handoff docs, and optionally trigger `codex exec` to run sub-agent image analysis plus `agent-all` remediation.

## Original Conditions

- [x] Add canonical analyzer viewport config with the 11 intake codes and device metadata
- [x] Add a `scripts/qa/run-e2e-analyzer.mjs` runner with `scan`, `dispatch`, `tick`, `watch`, and `status`
- [x] Persist queue/running/completed/failed state under `ultraplan/runs/e2e-analyzer*`
- [x] Detect stale running jobs and requeue them safely
- [x] Support feature-set grouping from filename-based intake and folder-based `CAPTURE_DONE.flag` intake
- [x] Generate per-set task docs and reports before dispatch
- [x] Support optional `codex exec` integration for `analyze-only` or `agent-all`
- [x] Support immediate dispatch of recently changed incomplete capture sets
- [x] Support per-feature auto-commit for successful UI fix runs with rollback-friendly commit messages
- [x] Document the workflow in repo docs and package scripts
- [x] Smoke test the runner on an existing local screenshot set

## User Scenarios

### Scenario 1 — Filename-Based Intake

- Given a folder where screenshots arrive with viewport suffixes like `feature-name-MS.png` through `feature-name-DXXL.png`
- When the full set is present
- Then the analyzer groups them into one feature set in canonical viewport order, enqueues the set, and generates a task/report bundle

### Scenario 2 — Interrupted Job Recovery

- Given a previous analyzer run died after moving a set to `running`
- When the next `tick` runs
- Then stale locks are cleared and the running set is requeued instead of being silently lost

### Scenario 3 — Codex-Driven Remediation

- Given a pending complete screenshot set
- When `dispatch --run-codex --codex-mode agent-all` is invoked
- Then Codex receives every image, analyzes them exhaustively via sub-agents, and uses the `agent-all` pipeline for actionable UI fixes

### Scenario 4 — Incomplete Capture Immediate Analysis

- Given a feature set is still being captured and only part of the 11-code matrix is present
- When new screenshots for that set arrive within the recent-change window
- Then the analyzer should still dispatch the set immediately for partial analysis and actionable fixes

### Scenario 5 — Per-Feature Auto Commit

- Given Codex finishes an `agent-all` remediation and returns repo-relative changed files
- When those files were not already dirty before the run
- Then the analyzer should create a single feature-level commit for rollback-friendly UI fix tracking

### Scenario 4 — Cron-Friendly Execution

- Given a host scheduler that can run commands periodically
- When it runs `tick`
- Then the analyzer performs one idempotent scan+dispatch cycle and exits cleanly

## Test Scenarios

### Happy Path

- `status` prints queue counts with no pending set loss
- `scan` creates/updates pending queue files for complete sets
- `dispatch` stages or executes the oldest pending set
- `tick` performs one full cycle
- `watch` loops with a configurable poll interval
- recently changed incomplete sets can be queued immediately
- successful fix runs can auto-commit per feature when safe

### Recovery Path

- A stale `dispatch.lock` is cleared if the PID is gone
- Existing `running` queue entries are requeued automatically on recovery

### Safety Path

- `dispatch` refuses oversized image sets beyond configured limits when auto-Codex is requested
- `dispatch` without `--run-codex` stages handoff files only
- Incomplete sets remain observed but not auto-dispatched unless explicitly allowed

## Parallel Work Breakdown

### Phase 1 — Config + Runner
- `scripts/qa/e2e-analyzer-config.mjs`
- `scripts/qa/run-e2e-analyzer.mjs`
- `scripts/qa/e2e-analyzer-result.schema.json`

### Phase 2 — Documentation + Workflow Sync
- `ultraplan/e2e-analyzer/README.md`
- `ultraplan/README.md`
- `AGENTS.md`
- `.codex/agents/workflow.md`
- `.claude/agents/workflow.md`
- `package.json`

### Phase 3 — Verification
- runner smoke test against an existing screenshot set
- sample report/task bundle generation

## Acceptance Criteria

- `scripts/qa/run-e2e-analyzer.mjs status` works in this repo
- Queue state is stored under `ultraplan/runs/e2e-analyzer*`
- The 11-code viewport contract is documented and reflected in analyzer config
- The runner is resumable after stale lock/running-job recovery
- `tick` is safe to use from cron
- `dispatch` can generate a Codex task bundle with `agent-all` handoff instructions
- `--dispatch-incomplete` can queue recently changed partial sets without waiting for full matrix completion
- `--auto-commit` uses rollback-friendly feature-level commit messages when no preexisting dirty-file conflict exists
- Documentation clearly states the separation between analyzer intake contract and broad visual-audit capture contract

## Tech Debt Resolved

- Replaces ephemeral screenshot-analysis loop assumptions with persisted disk-backed queue state
- Consolidates fragmented screenshot analyzer conventions into a single repo-native runner entrypoint

## Security Notes

- No secrets are read or written
- The runner passes only local image paths and repo-local task/report paths to Codex
- Auto-remediation remains opt-in via `--run-codex`

## Risks

- Nested `codex exec` auto-remediation can conflict with unrelated in-progress local edits if enabled recklessly
- Legacy screenshot naming (`M2`, `D2`, etc.) is only best-effort mapped for smoke testing and backward compatibility

## Ambiguity Log

- The new 11-device intake contract is treated as analyzer intake only. Migrating broad Playwright capture from 9 to 11 viewports is explicitly out of scope for this task.

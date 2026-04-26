# autoqa status

Resume cursor (kept up-to-date by the orchestrator and the main skill).

## Resume Cursor

Allowed `phase` values (from references/recovery-semantics.md):
`idle | run | analyze | gap-advise | fix | review | re-run | publish | done | interrupted | tool_failure`

```json
{
  "phase": "done",
  "run_owner": null,
  "run_owner_pid": null,
  "run_owner_claimed_at": null,
  "active_scenarios": [
    "SC-MATCH-001"
  ],
  "queued_scenarios": [],
  "current_scenario": null,
  "completed_scenarios": [
    "SC-SMOKE-001",
    "SC-SMOKE-003",
    "SC-MATCH-001"
  ],
  "blocked_scenarios": [],
  "scope": "core",
  "run_id": "RUN-2026-04-20T18-01-35-722Z-e1c5625",
  "open_findings": [],
  "pending_fixes": [],
  "publish_pending": [],
  "re_run_pending": [],
  "gap_pending_decision": [],
  "retry_counts": {},
  "tool_failure": null,
  "automation": {
    "mode": "cron",
    "active": true,
    "name": null,
    "id": null,
    "last_tick_at": null,
    "next_tick_at": null,
    "disabled_reason": null,
    "fallback_mode": "cron"
  },
  "stall": {
    "head_sha": "e1c56257563920f45b7f02c9280b9b0c30f45191",
    "ticks_without_head_change": 0,
    "ticks_without_progress": 0,
    "last_progress_at": "2026-04-20T18:03:27.296Z",
    "last_progress_reason": "cron_installed"
  },
  "last_pushed_sha": null,
  "last_pushed_at": null,
  "last_wake_at": "2026-04-20T18:03:27.295Z",
  "next_wake_reason": null
}
```

### run_owner — hard guard against double dispatch

`run_owner` is **the** ground-truth lock field — every dispatcher (main skill / cycle / orchestrator) writes it before touching the RUN and releases it on transition to `done` / `interrupted`.

| value | set by | held during |
|---|---|---|
| `null` | scaffold default; released after `done` / `interrupted` | no active RUN |
| `"main"` | `autoqa run` foreground skill | `run` → `analyze` → `done` |
| `"cycle"` | `autoqa-cycle` foreground skill | all 10 steps |
| `"orchestrator"` | autoqa-cycle background heartbeat / orchestrator loop | `run` → `publish` → `done` for that RUN |

Hard-guard contract:

1. **Claim**: every dispatcher atomically reads status.md, verifies `run_owner == null OR run_owner == self`, then writes `run_owner = self`, `run_owner_pid = $$`, `run_owner_claimed_at = now`. If another owner holds it, the dispatcher exits with `status=owner_conflict` (never proceeds to any MCP call).
2. **Automation preflight**: `autoqa-cycle --background` must verify that this Codex host exposes the required automation / heartbeat capability before it seeds any queue. If automation is unavailable, it must stop immediately, leave `automation.active = false`, and set `automation.disabled_reason = "automation_unavailable"`.
3. **Orchestrator tick**: on every wake, if `run_owner` is set AND `run_owner != "orchestrator"` AND `run_owner_claimed_at` is younger than `config.orchestrator.owner_stale_seconds` (default 1800), log `skipped_tick_foreign_owner` and reschedule. Never dispatches analyzer / fixer / reviewer / publish work for a RUN it does not own.
4. **Stale owner reclaim**: if `run_owner_claimed_at` is older than `owner_stale_seconds` AND no process is alive at `run_owner_pid` (orchestrator does `kill -0 <pid>` when it can reach the same host), orchestrator may rewrite `run_owner = "orchestrator"` and append `tool-events.log` kind=`owner_reclaimed` with the previous owner + age.
5. **Release**: on `done` / `interrupted`, the owner sets `run_owner = null` and `run_owner_pid = null`. The *owner* does this — other dispatchers never clear another's ownership (except via stale reclaim).
6. **Cycle takeover**: if the user invokes foreground `autoqa-cycle` while `run_owner == "orchestrator"`, the cycle skill asks whether to preempt unattended background work or abort the cycle. Preempt writes `run_owner = "cycle"` and appends a `owner_preempted` event; the next heartbeat sees the change and stands down.
7. **No fake dispatch**: a background tick must never write "fix/review/analyze dispatched" unless the work actually completed in that wake or a real resumable handle was persisted. Queue-on-disk is the source of truth; imaginary in-flight helpers are not.
8. **Stall accounting**: every background tick compares `git HEAD`, phase/queue movement, and append-only ledger growth against `stall.*`. If nothing meaningful changed, increment the counters. When a counter exceeds `config.orchestrator.stall_ticks_max`, write `phase = interrupted`, set `automation.active = false`, set `automation.disabled_reason = "stall_detected"`, append `stall_detected` to `tool-events.log`, and stop scheduling further wakes.

When the pipeline enters recovery, `tool_failure` is populated with:

```json
{
  "detected_at": "<ISO-8601>",
  "symptom": "about-blank-after-navigate | context-closed | watcher-stall | backend-disconnect | login-rejected | computer-use-denied",
  "last_successful_step": "<SC>/<STEP>/<matrix>",
  "attempts": 1,
  "next_action": "<short description of recovery step>"
}
```

Recovery attempts are counted here — never in `retry_counts` (reserved for real product findings).

## Notes

- Start the shared runtime with `make dev` before any browser action.
- Seed canonical mock data with `make db-seed-mocks` before authenticated or admin audits.
- Root `/` immediately redirects to `/landing` or `/home`; use `/landing` as the first public smoke target.
- This repo stores Playwright `storageState()` JSON under the legacy `.autoqa/cookies/` directory name until a later path rename.
- `SC-LOGIN-ADMIN` exports an authenticated storage state only; `/admin/*` routes still require DB role promotion.
- Local preflight for authenticated personas must verify `accessToken`, `refreshToken`, and `authUser` inside the saved storage state before reuse.
- Run `autoqa-scenarios all` to expand coverage from the live route inventory and current task docs.
- Run `autoqa run SC-SMOKE-001 --scope minimal` first — missing baselines are auto-bootstrapped with a Warning finding so you can inspect `.autoqa/baseline/**/*.png` manually.
- If this Codex session does not expose automation / heartbeat tools, treat `autoqa-cycle --background` as unsupported and stay in foreground mode.
- Foreground authenticated checks refresh the saved `storageState()` with `/auth/refresh` before route navigation, so expired access tokens do not create false 401 console failures on the first request wave.
- Screenshot-backed checks wait briefly before capture to avoid Playwright caret-hiding side effects surfacing as false hydration mismatch noise on input-heavy routes.
- After an intentional UI change, run `autoqa update-baseline SC-SMOKE-001` (separate action — asks per step; never silently accepts).
- Append-only ledger hook is **opt-in**: re-run `scripts/scaffold-autoqa.sh $PROJ --with-hook` if you want `pre-commit.autoqa` installed.

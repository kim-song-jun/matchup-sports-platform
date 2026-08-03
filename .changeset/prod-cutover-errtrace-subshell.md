---
'v1_api': patch
'v1_web': patch
---

Stop the cutover's ERR trap from running inside subshells, where it corrupted the value it was meant to protect.

`set -E` makes an ERR trap inherited by command substitutions, process substitutions, and subshells. The cutover script sets `trap rollback ERR` early so that even preflight failures get logged and alerted, which meant any failing `$(...)` ran the full rollback inside that subshell — and the rollback's own log output became the substitution's value.

Measured on 2026-08-03 by instrumenting the installed script: with `resolve_compose_binary` stubbed to fail, `compose_binary` did not end up empty as designed. It contained one element, and that element was `[cutover] 실패했지만 사용자 영향 구간 이전입니다 — 되돌릴 것이 없습니다 (exit 1)` — the rollback's message. The `[[ ${#compose_binary[@]} -gt 0 ]]` guard therefore passed on exactly the failure it was written for, and the script continued into the deploy path with a compose array holding a Korean log line instead of `docker compose`. The same mechanism also meant a preflight failure published its metric and SNS alert twice, once from the subshell and once from the main shell.

`rollback()` now returns immediately when `BASHPID` differs from `$$`. A rollback in a subshell cannot do its job anyway — its `exit` ends only the subshell — so the inherited invocation just propagates the exit code and lets the main shell handle it. The compose resolution additionally moved into an `if` condition, which is exempt from errexit, so the trap has no opportunity to fire there at all; that line is where a failure costs us the means of rolling back, so it gets both.

Verified end to end against the installed script: with the failing stub it now exits 1 with `compose 실행 파일을 찾지 못했습니다` and classifies itself as pre-impact, and an unmodified rehearsal still completes with 72 tables matched.

Found while checking a Copilot review comment that claimed `cmd || fail` does not reach the ERR trap. That claim is wrong — an isolated test on the same bash 5.2 shows a genuinely empty array does trigger the trap and exit 99 — but the line it pointed at was broken for a different and worse reason.

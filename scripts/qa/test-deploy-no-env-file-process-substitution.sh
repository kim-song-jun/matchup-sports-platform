#!/usr/bin/env bash
# Task 175 Task 4 fix round 3, Ruling R13 (SSM-verified against prod's real
# sudo 1.9.15p5): `sudo docker run --env-file <(...)` fails on the real prod
# host with "open /dev/fd/N: no such file or directory" -- sudo's own
# closefrom() drops the process-substitution fd before docker ever reads it.
# `--env-file /dev/stdin` with the WHOLE command's stdin redirected from the
# process substitution instead survives sudo (fd 0 is never in the
# closefrom range) -- deploy/prod-task168-common.sh's prod_dbq() already
# established this pattern; deploy/prod-release-common.sh's
# assert_task168_m11_guard() and assert_task168_m11_restore_target_safe()
# were fixed to match in this same round (the former blocked EVERY prod
# promotion carrying M11 until this fix).
#
# Regression guard: no file under deploy/ may reintroduce the broken
# `--env-file <(...)` pattern, regardless of whether `sudo` appears on the
# exact same physical line (the real code commonly splits `sudo docker run
# ... \` and `--env-file <(...)` across two lines) -- `--env-file <(` on its
# own is an unambiguous signal in this repo, since compose's own --env-file
# usage always takes a plain file path, never a process substitution.

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

failures=0
ok() { echo "OK: $1"; }
bad() { echo "FAILED: $1" >&2; failures=$((failures + 1)); }

# Excludes comment-only lines (this file's own history is documented in
# comments that quote the broken pattern as explanatory text, e.g. "fails
# there with ..." -- a real regression is CODE using it, not prose about
# it). A line is a comment here if its content, once the leading
# "file:linenum:" grep prefix and any leading whitespace are stripped,
# starts with `#`.
matches="$(grep -rn -- '--env-file[[:space:]]*<(' "${ROOT_DIR}/deploy" 2>/dev/null |
  awk '{
    line = $0
    sub(/^[^:]*:[0-9]+:/, "", line)
    sub(/^[ \t]+/, "", line)
    if (substr(line, 1, 1) != "#") print $0
  }' || true)"
if [[ -z "${matches}" ]]; then
  ok "no '--env-file <(' (process substitution) pattern anywhere under deploy/"
else
  bad "found '--env-file <(' under deploy/ -- this fails on the real prod host (Ruling R13):"
  echo "${matches}" >&2
fi

# Positive control: the CORRECT replacement pattern must still be present
# (proves this test isn't just failing to find deploy/, or grep-ing the
# wrong tree entirely).
stdin_pattern_count="$(grep -rlc -- '--env-file /dev/stdin' "${ROOT_DIR}/deploy" 2>/dev/null | wc -l | tr -d '[:space:]')"
if [[ "${stdin_pattern_count}" -ge 2 ]]; then
  ok "the corrected '--env-file /dev/stdin' pattern is present in at least 2 files (assert_task168_m11_guard, assert_task168_m11_restore_target_safe)"
else
  bad "expected '--env-file /dev/stdin' in at least 2 files under deploy/, found in ${stdin_pattern_count}"
fi

if [[ "${failures}" -ne 0 ]]; then
  echo "[deploy-no-env-file-process-substitution] FAILED: ${failures} case(s)" >&2
  exit 1
fi
echo "[deploy-no-env-file-process-substitution] passed"

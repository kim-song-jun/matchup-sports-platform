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
# Regression guard: no file under deploy/ or scripts/ may reintroduce the
# broken `--env-file <(...)` pattern, regardless of whether `sudo` appears on
# the exact same physical line (the real code commonly splits `sudo docker
# run ... \` and `--env-file <(...)` across two lines) -- `--env-file <(` on
# its own is an unambiguous signal in this repo, since compose's own
# --env-file usage always takes a plain file path, never a process
# substitution. scripts/ is included (not just deploy/) because Task 175 T5
# adds shell that also shells out to `docker run --env-file`.

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

failures=0
ok() { echo "OK: $1"; }
bad() { echo "FAILED: $1" >&2; failures=$((failures + 1)); }

# Scans <dir>/deploy + <dir>/scripts for the broken pattern, excluding this
# file itself (its own header/messages quote the pattern as text, which
# would otherwise self-match) and comment-only lines (a real regression is
# CODE using the pattern, not prose about it -- a line is a comment here if
# its content, once the leading "file:linenum:" grep prefix and any leading
# whitespace are stripped, starts with `#`). Reused below against a
# synthetic fixture so the checker's own detection logic is proven, not
# just its absence-reporting.
scan_env_file_violations() {
  local dir="$1"
  grep -rn -- '--env-file[[:space:]]*<(' "${dir}/deploy" "${dir}/scripts" 2>/dev/null |
    grep -v -F "${SELF}" |
    awk '{
      line = $0
      sub(/^[^:]*:[0-9]+:/, "", line)
      sub(/^[ \t]+/, "", line)
      if (substr(line, 1, 1) != "#") print $0
    }' || true
}

matches="$(scan_env_file_violations "${ROOT_DIR}")"
if [[ -z "${matches}" ]]; then
  ok "no '--env-file <(' (process substitution) pattern anywhere under deploy/ or scripts/"
else
  bad "found '--env-file <(' under deploy/ or scripts/ -- this fails on the real prod host (Ruling R13):"
  echo "${matches}" >&2
fi

# Positive control: a checker that never flags anything (e.g. a typo'd path,
# an always-empty grep) would pass the assertion above vacuously. Prove the
# SAME scan function actually catches the violation by injecting it into a
# throwaway fixture tree.
fixture_root="$(mktemp -d)"
trap 'rm -rf "${fixture_root}"' EXIT
mkdir -p "${fixture_root}/deploy" "${fixture_root}/scripts"
cat > "${fixture_root}/deploy/fixture-violation.sh" <<'FIXTURE'
docker run --rm --env-file <(printf 'FOO=bar') myimage
FIXTURE
fixture_matches="$(scan_env_file_violations "${fixture_root}")"
if [[ -n "${fixture_matches}" ]]; then
  ok "positive control: an injected '--env-file <(' fixture is detected by the same scan"
else
  bad "positive control: the scan did not flag an injected '--env-file <(' fixture -- the checker itself is broken"
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

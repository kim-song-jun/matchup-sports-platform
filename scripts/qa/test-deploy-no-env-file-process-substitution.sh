#!/usr/bin/env bash
# Ruling R13 (SSM-measured on prod's sudo 1.9.15p5): `sudo docker run
# --env-file <(...)` fails there ("open /dev/fd/N: no such file") because
# sudo closes fds >= 3; `--env-file /dev/stdin < <(...)` survives. No file
# under deploy/ or scripts/ may use a process substitution as --env-file, in
# either the `--env-file <(` or the `--env-file=<(` spelling, whether or not
# `sudo` is on the same physical line.

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
  grep -rnE -- '--env-file([[:space:]]*|=)<\(' "${dir}/deploy" "${dir}/scripts" 2>/dev/null |
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
# throwaway fixture tree -- under BOTH scanned roots, since scan_env_file_
# violations() greps two separate directory args and a bug could easily
# drop one of them (e.g. a typo'd path) without the other masking it.
fixture_root="$(mktemp -d)"
trap 'rm -rf "${fixture_root}"' EXIT
mkdir -p "${fixture_root}/deploy" "${fixture_root}/scripts"
cat > "${fixture_root}/deploy/fixture-violation.sh" <<'FIXTURE'
docker run --rm --env-file <(printf 'FOO=bar') myimage
FIXTURE
cat > "${fixture_root}/scripts/fixture-violation.sh" <<'FIXTURE'
docker run --rm --env-file <(printf 'FOO=bar') myimage
FIXTURE
cat > "${fixture_root}/scripts/fixture-equals-violation.sh" <<'FIXTURE'
docker run --rm --env-file=<(printf 'FOO=bar') myimage
FIXTURE
cat > "${fixture_root}/deploy/fixture-allowed.sh" <<'FIXTURE'
docker run --rm --env-file /dev/stdin myimage < <(printf 'FOO=bar')
FIXTURE
fixture_matches="$(scan_env_file_violations "${fixture_root}")"
if [[ -n "${fixture_matches}" ]] &&
  grep -q 'deploy/fixture-violation\.sh' <<<"${fixture_matches}" &&
  grep -q 'scripts/fixture-violation\.sh' <<<"${fixture_matches}" &&
  grep -q 'scripts/fixture-equals-violation\.sh' <<<"${fixture_matches}"; then
  ok "positive control: injected '--env-file <(' and '--env-file=<(' fixtures under BOTH deploy/ and scripts/ are detected"
else
  bad "positive control: expected matches for all three violation fixtures, got: ${fixture_matches}"
fi
if grep -q 'fixture-allowed\.sh' <<<"${fixture_matches}"; then
  bad "negative control: the allowed '--env-file /dev/stdin < <(...)' pattern was flagged"
else
  ok "negative control: '--env-file /dev/stdin < <(...)' is not flagged"
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

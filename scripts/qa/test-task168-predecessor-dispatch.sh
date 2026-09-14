#!/usr/bin/env bash

# Contract test for deploy-alpha.yml's "Resolve Task168 StageA predecessor
# transition" step. Extracts the step's REAL `run:` block from the workflow
# and executes it against a fake `aws` on PATH.
#
# What it pins, and why: the step used the `commands=[...]` shorthand for
# --parameters. The shorthand parser rewrites backslash escapes, so the
# trailing \n that `jq -Rsc` emits reached the host as a literal "n" glued to
# the last argument — the 40-char SHA became 41 chars and every StageB
# dispatch died on the read script's own usage (rc 64), three times, with the
# host's reason never leaving the host.

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKFLOW="${ROOT}/.github/workflows/deploy-alpha.yml"
STEP_NAME="Resolve Task168 StageA predecessor transition"
SHA=72405a2d5486d64da2855daa56339cbaf09610c3
INSTANCE=i-0123456789abcdef0
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ok: $*"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $*" >&2; }

echo "== test-task168-predecessor-dispatch =="

# Take the step's `run: |` block verbatim: from the line after `run: |` that
# follows the step's own `- name:` line, to the first line that dedents out of
# the block. Extracting instead of copying is the point — a copy would keep
# passing after the workflow changed.
extract_step_run() {
  awk -v want="${STEP_NAME}" '
    index($0, "- name: " want) { found = 1; next }
    found && !inrun && $0 ~ /run: \|/ { inrun = 1; next }
    found && inrun {
      if ($0 ~ /^[[:space:]]*$/) { print ""; next }
      match($0, /^[[:space:]]*/)
      indent = RLENGTH
      if (!base) base = indent
      if (indent < base) exit
      print substr($0, base + 1)
    }
  ' "${WORKFLOW}"
}

STEP="${WORK}/step.sh"
extract_step_run > "${STEP}"
[[ -s "${STEP}" ]] && grep -q 'aws ssm send-command' "${STEP}" \
  && pass "extracted the step's own run block ($(wc -l < "${STEP}" | tr -d ' ') lines)" \
  || { fail "could not extract the step from ${WORKFLOW}"; exit 1; }

# $1 = the Status the fake aws reports for the invocation.
# Echoes the step's exit code; leaves stdout/stderr/params under ${WORK}/$2.
run_step() {
  local status="$1" name="$2"
  local root="${WORK}/${name}"
  mkdir -p "${root}/bin"
  : > "${root}/params.txt"

  cat > "${root}/bin/aws" <<EOF
#!/usr/bin/env bash
# Records the --parameters value exactly as the step passed it, before any
# AWS-side parsing — the payload shape is what this test is about.
args=("\$@")
for ((i = 0; i < \${#args[@]}; i++)); do
  if [[ "\${args[i]}" == "--parameters" ]]; then
    printf '%s' "\${args[i+1]}" > "${root}/params.txt"
  fi
done
case "\$2" in
  send-command) echo "cmd-0001" ;;
  get-command-invocation)
    for ((i = 0; i < \${#args[@]}; i++)); do
      if [[ "\${args[i]}" == "--query" ]]; then
        case "\${args[i+1]}" in
          Status) echo "${status}" ;;
          StandardOutputContent)
            echo '{"path":"/x/transition.json","sha256":"'"\$(printf 'a%.0s' {1..64})"'","apiImage":"registry/x@sha256:'"\$(printf 'b%.0s' {1..64})"'","databaseIdentity":"d|d|local|local","resolvedMigrationAttemptsSha256":"'"\$(printf 'c%.0s' {1..64})"'"}'
            ;;
          StandardErrorContent) echo "usage: bash <predecessor-release-sha>" ;;
        esac
      fi
    done
    ;;
esac
exit 0
EOF
  chmod +x "${root}/bin/aws"
  printf '#!/usr/bin/env bash\nexit 0\n' > "${root}/bin/sleep"
  chmod +x "${root}/bin/sleep"

  local rc=0
  ( cd "${ROOT}" && PATH="${root}/bin:${PATH}" INSTANCE_ID="${INSTANCE}" \
      PREDECESSOR_SHA="${SHA}" GITHUB_OUTPUT="${root}/github_output" \
      bash "${STEP}" ) > "${root}/stdout" 2> "${root}/stderr" || rc=$?
  echo "${rc}"
}

# ── The dispatch payload ──────────────────────────────────────────────────
rc="$(run_step Success success)"
ok="${WORK}/success"
[[ "${rc}" -eq 0 ]] && pass "the step succeeds against a Success invocation" \
  || fail "rc=${rc}: $(cat "${ok}/stderr")"

params="$(cat "${ok}/params.txt")"
jq -e . <<<"${params}" >/dev/null 2>&1 \
  && pass "--parameters is JSON, so no shorthand escape rewriting happens" \
  || fail "--parameters is not JSON (shorthand?): ${params:0:80}"

# The defect, stated as the thing that must hold: the SHA reaches the host
# intact as the final argument.
remote="$(jq -r '.commands[0]' <<<"${params}" 2>/dev/null || echo '')"
[[ "${remote}" == *"bash -s -- ${SHA}" ]] \
  && pass "the remote command ends with the exact 40-char predecessor SHA" \
  || fail "the SHA argument is not intact: ...${remote: -60}"

[[ "$(jq -r '.commands | length' <<<"${params}" 2>/dev/null || echo 0)" == 1 ]] \
  && pass "exactly one command is sent" \
  || fail "expected exactly one command"

grep -q "transitionSha256=" "${ok}/github_output" && grep -q "apiImage=" "${ok}/github_output" \
  && pass "the five contract fields are written to GITHUB_OUTPUT" \
  || fail "GITHUB_OUTPUT is missing fields: $(cat "${ok}/github_output" 2>/dev/null)"

# ── The failure path must carry the host's reason ─────────────────────────
rc="$(run_step Failed failed)"
bad="${WORK}/failed"
[[ "${rc}" -ne 0 ]] && pass "a Failed invocation fails the step (rc=${rc})" \
  || fail "a Failed invocation was accepted"

grep -q "usage: bash <predecessor-release-sha>" "${bad}/stderr" \
  && pass "the host's own stderr is surfaced, not just \"status=Failed\"" \
  || fail "the remote reason never reached the log: $(cat "${bad}/stderr")"

echo "== ${PASS} passed, ${FAIL} failed =="
[[ "${FAIL}" -eq 0 ]]

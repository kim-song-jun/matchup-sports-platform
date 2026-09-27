#!/usr/bin/env bash
# Task 175 Task 4 fix round 2, Minor 3: locks Ruling R10 (deploy/deploy-prod.sh,
# the `had_active`/task168_stage fail-fast block) with a real extraction --
# fix round 1 only added code + comment for this, with no dedicated test
# (the existing stage-routing/failure-path tests all fix had_active=true,
# the realistic case, per R10's own note).
#
# Extracts from `had_active=false` (inclusive) through the line just before
# `runtime_mutated=false` (exclusive) by content anchor -- the same
# has-file-based had_active computation plus the new R10 guard, nothing
# else. Runs it as its own script with PROD_RELEASE_STATE_FILE and
# task168_stage pre-set, three ways: staged + no active release (must fail
# fast with the runbook path in the message), staged + active release
# exists (must NOT fail here), and unstaged + no active release (the
# ordinary first-ever-deploy path, must also NOT fail here -- R10 only
# applies to staged mode).

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly DEPLOY_PROD="${ROOT_DIR}/deploy/deploy-prod.sh"
readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

start_line="$(grep -n '^had_active=false$' "${DEPLOY_PROD}" | head -1 | cut -d: -f1)"
end_line="$(grep -n '^runtime_mutated=false$' "${DEPLOY_PROD}" | head -1 | cut -d: -f1)"
[[ -n "${start_line}" && -n "${end_line}" && "${start_line}" -lt "${end_line}" ]] || {
  echo "extract: could not find both anchor lines in deploy-prod.sh" >&2
  exit 1
}
end_line=$((end_line - 1))
sed -n "${start_line},${end_line}p" "${DEPLOY_PROD}" > "${TEST_ROOT}/segment.sh"

failures=0
ok() { echo "OK: $1"; }
bad() { echo "FAILED: $1" >&2; failures=$((failures + 1)); }

# run_case STAGE STATE_FILE_EXISTS -> sets CASE_RC, CASE_OUTPUT
run_case() {
  local stage="$1" state_file_exists="$2" scenario_dir="${TEST_ROOT}/scenario-$3"
  mkdir -p "${scenario_dir}"
  local state_file="${scenario_dir}/state.json"
  [[ "${state_file_exists}" == true ]] && printf '{}' > "${state_file}"

  local wrapper="${scenario_dir}/wrapper.sh"
  {
    printf '#!/usr/bin/env bash\nset -Eeuo pipefail\n'
    printf 'task168_stage=%q\n' "${stage}"
    printf 'PROD_RELEASE_STATE_FILE=%q\n' "${state_file}"
    cat "${TEST_ROOT}/segment.sh"
    printf 'echo SEGMENT_COMPLETED\n'
  } > "${wrapper}"
  set +e
  CASE_OUTPUT="$(bash "${wrapper}" 2>&1)"
  CASE_RC=$?
  set -e
}

# ── (1) staged + no active release -> fail fast, runbook path in message ──
run_case stageA false a
if [[ "${CASE_RC}" -ne 0 && "${CASE_OUTPUT}" == *"requires an existing active release"*"docs/ops/prod-task168-transition-runbook.md"* ]]; then
  ok "staged + had_active=false -> exits nonzero with the runbook path in the message"
else
  bad "staged + had_active=false -> expected a runbook-referencing refusal, got rc=${CASE_RC}: ${CASE_OUTPUT}"
fi
if [[ "${CASE_OUTPUT}" == *SEGMENT_COMPLETED* ]]; then
  bad "staged + had_active=false -> the segment ran to completion despite the guard (should have exited first)"
fi

# ── (2) staged + active release exists -> must NOT fail here ──────────────
run_case stageB true b
if [[ "${CASE_RC}" -eq 0 && "${CASE_OUTPUT}" == *SEGMENT_COMPLETED* ]]; then
  ok "staged + had_active=true -> passes (R10 only fires on had_active=false)"
else
  bad "staged + had_active=true -> expected the segment to complete normally, got rc=${CASE_RC}: ${CASE_OUTPUT}"
fi

# ── (3) unstaged + no active release -> ordinary first deploy, must NOT
#        fail here either (R10 is staged-mode-only) ───────────────────────
run_case '' false c
if [[ "${CASE_RC}" -eq 0 && "${CASE_OUTPUT}" == *SEGMENT_COMPLETED* ]]; then
  ok "no stage + had_active=false -> passes (R10 does not apply to ordinary deploys)"
else
  bad "no stage + had_active=false -> expected the segment to complete normally, got rc=${CASE_RC}: ${CASE_OUTPUT}"
fi

if [[ "${failures}" -ne 0 ]]; then
  echo "[task168-deploy-prod-had-active-guard] FAILED: ${failures} case(s)" >&2
  exit 1
fi
echo "[task168-deploy-prod-had-active-guard] passed"

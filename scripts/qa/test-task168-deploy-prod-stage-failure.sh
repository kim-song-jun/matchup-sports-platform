#!/usr/bin/env bash
# Task 175 Task 4, Review Focus 3: when a staged (stageA/stageB) deploy-prod.sh
# candidate fails, the ERR trap (restore_on_failure(), deploy/deploy-prod.sh)
# must NOT call restore_active_release()/restore_legacy_runtime() -- doing so
# would restart the PREVIOUS release's application images against a database
# that may already be partially migrated by this failed attempt. Instead it
# must write `task168/<sha>/activation-stage.json` (stage + failure
# timestamp) and mention the runbook. The two ordinary (non-staged) recovery
# paths must be completely unaffected -- checked here as regression.
#
# Extracts write_task168_activation_stage_failure()+restore_on_failure() from
# the REAL deploy-prod.sh by content anchor (same technique as
# scripts/qa/test-task168-prod-guard.sh) and runs them directly -- this file
# never arms the actual ERR trap (the extraction stops one line before that),
# it calls restore_on_failure() itself to simulate what firing it would do.

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly DEPLOY_PROD="${ROOT_DIR}/deploy/deploy-prod.sh"
readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

start_line="$(grep -n '^write_task168_activation_stage_failure() {$' "${DEPLOY_PROD}" | head -1 | cut -d: -f1)"
end_line="$(grep -n "^trap 'restore_on_failure' ERR\$" "${DEPLOY_PROD}" | head -1 | cut -d: -f1)"
[[ -n "${start_line}" && -n "${end_line}" && "${start_line}" -lt "${end_line}" ]] || {
  echo "extract: could not find both anchor lines in deploy-prod.sh" >&2
  exit 1
}
end_line=$((end_line - 1))
sed -n "${start_line},${end_line}p" "${DEPLOY_PROD}" > "${TEST_ROOT}/segment.sh"

failures=0
ok() { echo "OK: $1"; }
bad() { echo "FAILED: $1" >&2; failures=$((failures + 1)); }

# run_case STAGE RUNTIME_MUTATED HAD_ACTIVE SOURCE_ACTIVATED -> sets
# CASE_RC, CASE_OUTPUT, and leaves per-scenario call-log files + the
# activation-stage.json path (if any) under a fresh scenario dir for
# inspection.
run_case() {
  local stage="$1" runtime_mutated="$2" had_active="$3" source_activated="$4"
  local scenario_dir="${TEST_ROOT}/scenario-$5"
  mkdir -p "${scenario_dir}"
  local restore_active_log="${scenario_dir}/restore_active.calls"
  local restore_legacy_log="${scenario_dir}/restore_legacy.calls"
  local archive_log="${scenario_dir}/archive.calls"
  : > "${restore_active_log}"; : > "${restore_legacy_log}"; : > "${archive_log}"

  local wrapper="${scenario_dir}/wrapper.sh"
  {
    printf '#!/usr/bin/env bash\nset -Eeuo pipefail\n'
    printf 'archive_failed_candidate() { echo called >> %q; }\n' "${archive_log}"
    printf 'restore_active_release() { echo called >> %q; return 1; }\n' "${restore_active_log}"
    printf 'restore_legacy_runtime() { echo called >> %q; return 1; }\n' "${restore_legacy_log}"
    printf 'PROD_SHA=%q\n' "3333333333333333333333333333333333333333"
    printf 'PROD_RELEASE_STATE_DIR=%q\n' "${scenario_dir}/state"
    printf 'task168_stage=%q\n' "${stage}"
    printf 'runtime_mutated=%q\n' "${runtime_mutated}"
    printf 'had_active=%q\n' "${had_active}"
    printf 'source_activated=%q\n' "${source_activated}"
    cat "${TEST_ROOT}/segment.sh"
    # restore_on_failure() reads `local status="$?"` to learn what failed --
    # `false` as its own bare statement would trip THIS wrapper's own
    # `set -e` before ever reaching the call. `false || restore_on_failure`
    # is the standard exemption (a compound command on the left of `||` does
    # not trigger errexit) and leaves $?=1 visible to `local status="$?"`,
    # the first thing restore_on_failure's body does.
    printf 'false || restore_on_failure\n'
  } > "${wrapper}"
  set +e
  CASE_OUTPUT="$(bash "${wrapper}" 2>&1)"
  CASE_RC=$?
  set -e
  CASE_SCENARIO_DIR="${scenario_dir}"
}

calls() { wc -l < "$1" | tr -d '[:space:]'; }

# ── (1) stageA failure -> no restore, activation-stage.json written ────────
run_case stageA true true false a1
if [[ "$(calls "${CASE_SCENARIO_DIR}/restore_active.calls")" == 0 && "$(calls "${CASE_SCENARIO_DIR}/restore_legacy.calls")" == 0 ]]; then
  ok "stageA failure: neither restore_active_release nor restore_legacy_runtime was called"
else
  bad "stageA failure: a restore function was called (active=$(calls "${CASE_SCENARIO_DIR}/restore_active.calls") legacy=$(calls "${CASE_SCENARIO_DIR}/restore_legacy.calls"))"
fi
activation_file="${CASE_SCENARIO_DIR}/state/task168/3333333333333333333333333333333333333333/activation-stage.json"
if [[ -f "${activation_file}" ]] && jq -e '.stage=="stageA" and (.failedAt|type=="string") and (.failedAt|length>0)' "${activation_file}" >/dev/null 2>&1; then
  ok "stageA failure: activation-stage.json recorded stage=stageA with a failedAt timestamp"
else
  bad "stageA failure: activation-stage.json missing or malformed at ${activation_file}"
fi
if [[ "${CASE_OUTPUT}" == *"docs/ops/prod-task168-transition-runbook.md"* ]]; then
  ok "stageA failure: runbook path was printed"
else
  bad "stageA failure: runbook path was not printed: ${CASE_OUTPUT}"
fi

# ── (2) stageB failure -> same, with stage=stageB recorded ──────────────────
run_case stageB true true false b1
if [[ "$(calls "${CASE_SCENARIO_DIR}/restore_active.calls")" == 0 && "$(calls "${CASE_SCENARIO_DIR}/restore_legacy.calls")" == 0 ]]; then
  ok "stageB failure: neither restore_active_release nor restore_legacy_runtime was called"
else
  bad "stageB failure: a restore function was called (active=$(calls "${CASE_SCENARIO_DIR}/restore_active.calls") legacy=$(calls "${CASE_SCENARIO_DIR}/restore_legacy.calls"))"
fi
activation_file="${CASE_SCENARIO_DIR}/state/task168/3333333333333333333333333333333333333333/activation-stage.json"
if [[ -f "${activation_file}" ]] && jq -e '.stage=="stageB"' "${activation_file}" >/dev/null 2>&1; then
  ok "stageB failure: activation-stage.json recorded stage=stageB"
else
  bad "stageB failure: activation-stage.json missing or wrong stage at ${activation_file}"
fi

# ── (3) regression: no stage + runtime_mutated + had_active -> the ORDINARY
#        restore_active_release recovery path still fires, unaffected ──────
run_case '' true true false c1
if [[ "$(calls "${CASE_SCENARIO_DIR}/restore_active.calls")" == 1 && "$(calls "${CASE_SCENARIO_DIR}/restore_legacy.calls")" == 0 ]]; then
  ok "no stage + runtime_mutated + had_active: restore_active_release still called exactly once (regression)"
else
  bad "no stage + runtime_mutated + had_active: expected restore_active_release exactly once, got active=$(calls "${CASE_SCENARIO_DIR}/restore_active.calls") legacy=$(calls "${CASE_SCENARIO_DIR}/restore_legacy.calls")"
fi
if [[ -e "${CASE_SCENARIO_DIR}/state/task168" ]]; then
  bad "no stage + runtime_mutated + had_active: an activation-stage.json path was created even though this is not a staged failure"
else
  ok "no stage + runtime_mutated + had_active: no task168 activation-stage state was written"
fi

# ── (4) regression: no stage + first-deploy legacy conversion -> the
#        ORDINARY restore_legacy_runtime recovery path still fires ─────────
run_case '' false false true d1
if [[ "$(calls "${CASE_SCENARIO_DIR}/restore_legacy.calls")" == 1 && "$(calls "${CASE_SCENARIO_DIR}/restore_active.calls")" == 0 ]]; then
  ok "no stage + first-deploy legacy conversion: restore_legacy_runtime still called exactly once (regression)"
else
  bad "no stage + first-deploy legacy conversion: expected restore_legacy_runtime exactly once, got active=$(calls "${CASE_SCENARIO_DIR}/restore_active.calls") legacy=$(calls "${CASE_SCENARIO_DIR}/restore_legacy.calls")"
fi

if [[ "${failures}" -ne 0 ]]; then
  echo "[task168-deploy-prod-stage-failure] FAILED: ${failures} case(s)" >&2
  exit 1
fi
echo "[task168-deploy-prod-stage-failure] passed"

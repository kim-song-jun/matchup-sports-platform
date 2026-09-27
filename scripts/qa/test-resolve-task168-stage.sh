#!/usr/bin/env bash
# Task 175 T5 fix round 1, Important 1: scripts/release/resolve-task168-stage.sh
# must reject a task168_rehearsal_evidence value that carries a newline or
# control character BEFORE writing anything to GITHUB_OUTPUT -- GitHub
# Actions' append-only output file lets a later "key=value" line silently
# override an earlier one for the same key, so an unsanitized value could
# forge its own "stage=" line after the real one this step already wrote.

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly SCRIPT="${ROOT_DIR}/scripts/release/resolve-task168-stage.sh"
readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

failures=0
ok() { echo "OK: $1"; }
bad() { echo "FAILED: $1" >&2; failures=$((failures + 1)); }

# $1 label, $2 GITHUB_EVENT_NAME, $3 STAGE_INPUT, $4 EVIDENCE_INPUT,
# $5 expect ('pass'|'reject'), $6 expected stage (pass only),
# $7 expected evidence (pass only), $8 expected stderr substring (reject only)
run_case() {
  local label="$1" event="$2" stage_in="$3" evidence_in="$4" expect="$5" \
    exp_stage="${6:-}" exp_evidence="${7:-}" exp_message="${8:-}"
  local out="${TEST_ROOT}/out-$$-${RANDOM}" err="${TEST_ROOT}/err-$$-${RANDOM}" rc=0
  : > "${out}"
  (
    GITHUB_EVENT_NAME="${event}" STAGE_INPUT="${stage_in}" EVIDENCE_INPUT="${evidence_in}" \
    GITHUB_OUTPUT="${out}" bash "${SCRIPT}"
  ) >/dev/null 2>"${err}" || rc=$?

  if [[ "${expect}" == pass ]]; then
    if [[ ${rc} -ne 0 ]]; then
      bad "${label} -- expected success, exited ${rc}: $(cat "${err}")"
      return
    fi
    local actual_stage actual_evidence
    actual_stage="$(grep -m1 '^stage=' "${out}" | cut -d= -f2-)"
    actual_evidence="$(grep -m1 '^evidence=' "${out}" | cut -d= -f2-)"
    if [[ "${actual_stage}" != "${exp_stage}" ]]; then
      bad "${label} -- stage was '${actual_stage}', expected '${exp_stage}'"
    elif [[ "${actual_evidence}" != "${exp_evidence}" ]]; then
      bad "${label} -- evidence was '${actual_evidence}', expected '${exp_evidence}'"
    else
      ok "${label}"
    fi
  else
    if [[ ${rc} -eq 0 ]]; then
      bad "${label} -- expected rejection, but exited 0. GITHUB_OUTPUT content: $(cat "${out}")"
      return
    fi
    # The injection guard's whole point is that NOTHING is written when the
    # input is bad -- a partial/forged GITHUB_OUTPUT is exactly the failure
    # mode this test exists to catch.
    if [[ -s "${out}" ]]; then
      bad "${label} -- rejected as expected, but GITHUB_OUTPUT was not empty: $(cat "${out}")"
      return
    fi
    if [[ -n "${exp_message}" && "$(cat "${err}")" != *"${exp_message}"* ]]; then
      bad "${label} -- rejected as expected, but stderr did not contain '${exp_message}': $(cat "${err}")"
    else
      ok "${label}"
    fi
  fi
}

# ── happy paths ──────────────────────────────────────────────────────────
run_case "workflow_dispatch, stage=none, no evidence" \
  workflow_dispatch none "" pass none ""
run_case "workflow_dispatch, stage=stageA, normal evidence" \
  workflow_dispatch stageA "local rehearsal log, 2026-09-27, scratch/run1.log" \
  pass stageA "local rehearsal log, 2026-09-27, scratch/run1.log"
run_case "workflow_dispatch, stage=stageB, Korean evidence text" \
  workflow_dispatch stageB "로컬 리허설 로그 2026-09-27" pass stageB "로컬 리허설 로그 2026-09-27"

# ── push always pins to none, regardless of a stale/forced STAGE_INPUT ──
run_case "push event forces stage=none even if STAGE_INPUT says stageA" \
  push stageA "" pass none ""

# ── the injection guard itself ──────────────────────────────────────────
run_case "evidence with an embedded newline (forged stage= line) is rejected" \
  workflow_dispatch stageA "$(printf 'legit\nstage=stageB-forged')" \
  reject "" "" "printable characters"
run_case "evidence with a tab (control character) is rejected" \
  workflow_dispatch stageA "$(printf 'tab\there')" \
  reject "" "" "printable characters"
run_case "evidence over 500 characters is rejected" \
  workflow_dispatch stageA "$(printf 'a%.0s' $(seq 1 501))" \
  reject "" "" "at most 500 characters"
run_case "evidence at exactly 500 characters is accepted" \
  workflow_dispatch stageA "$(printf 'a%.0s' $(seq 1 500))" \
  pass stageA "$(printf 'a%.0s' $(seq 1 500))"

# ── required-ness and stage validation (pre-existing behavior, still
#    covered so a future refactor can't silently drop them) ─────────────
run_case "stageA without evidence is rejected" \
  workflow_dispatch stageA "" reject "" "" "is required for stageA"
run_case "unknown stage value is rejected" \
  workflow_dispatch bogusStage "evidence text" reject "" "" "Unknown task168_stage"

if [[ "${failures}" -ne 0 ]]; then
  echo "[resolve-task168-stage] FAILED: ${failures} case(s)" >&2
  exit 1
fi
echo "[resolve-task168-stage] passed"

#!/usr/bin/env bash
# Task 175 Task 4 fix round 1, Important 2: the opposite direction of
# scripts/qa/test-task168-deploy-prod-stage-routing.sh's happy paths -- a
# failure at each of the three Task168-specific call sites in
# deploy/deploy-prod.sh must stop things at exactly that point, and must
# reach restore_on_failure() through the REAL `trap ... ERR` (not a direct
# call, unlike scripts/qa/test-task168-deploy-prod-stage-failure.sh, which
# already covers restore_on_failure()'s own dispatch logic in isolation).
#
# Combines two content-anchor extractions from the SAME real deploy-prod.sh
# in one wrapper: write_task168_activation_stage_failure()+restore_on_failure()
# +the trap arm (so `set -Eeuo pipefail` really can hand a failing bare
# `prod_task168_main ...` call to the trap), then the task168_stage routing
# tail. The candidate-prep block in between (rsync/ECR login/image pull/
# etc, real deploy-prod.sh lines between the two anchors) is intentionally
# NOT included -- it needs no Task168-specific behavior and would only add
# unrelated docker/aws mocking.

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly DEPLOY_PROD="${ROOT_DIR}/deploy/deploy-prod.sh"
readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

trap_start="$(grep -n '^write_task168_activation_stage_failure() {$' "${DEPLOY_PROD}" | head -1 | cut -d: -f1)"
trap_end="$(grep -n "^trap 'restore_on_failure' ERR\$" "${DEPLOY_PROD}" | head -1 | cut -d: -f1)"
routing_start="$(grep -n '^if \[\[ "\${task168_stage}" == stageA || "\${task168_stage}" == stageB \]\]; then$' "${DEPLOY_PROD}" | head -1 | cut -d: -f1)"
routing_end="$(grep -n 'is healthy"$' "${DEPLOY_PROD}" | head -1 | cut -d: -f1)"
for v in trap_start trap_end routing_start routing_end; do
  [[ -n "${!v}" ]] || { echo "extract: anchor '${v}' not found in deploy-prod.sh" >&2; exit 1; }
done
sed -n "${trap_start},${trap_end}p" "${DEPLOY_PROD}" > "${TEST_ROOT}/trap-segment.sh"
sed -n "${routing_start},${routing_end}p" "${DEPLOY_PROD}" > "${TEST_ROOT}/routing-segment.sh"

mock_bin="${TEST_ROOT}/bin"
mkdir -p "${mock_bin}"
printf '#!/bin/sh\nexec "$@"\n' > "${mock_bin}/sudo"
chmod +x "${mock_bin}/sudo"

failures=0
ok() { echo "OK: $1"; }
bad() { echo "FAILED: $1" >&2; failures=$((failures + 1)); }

# run_case STAGE FAIL_ON(stageA|stageB|verify|none) NAME
run_case() {
  local stage="$1" fail_on="$2" scenario_dir="${TEST_ROOT}/scenario-$3"
  mkdir -p "${scenario_dir}"
  local events="${scenario_dir}/events.log"
  : > "${events}"
  local manifest_file="${scenario_dir}/manifest.json"
  printf '{"release":{"sha":"%s"}}' "3333333333333333333333333333333333333333" > "${manifest_file}"

  cat > "${mock_bin}/docker" <<'FAKE'
#!/bin/sh
case "$*" in
  'ps -a --format {{.Names}}') exit 0 ;;
  'image prune -f') exit 0 ;;
  *) echo "unexpected docker invocation: $*" >&2; exit 92 ;;
esac
FAKE
  chmod +x "${mock_bin}/docker"

  local wrapper="${scenario_dir}/wrapper.sh"
  cat > "${wrapper}" <<WRAPPER
#!/usr/bin/env bash
set -Eeuo pipefail
PATH="${mock_bin}:\${PATH}"

# Stubs for everything restore_on_failure()/the routing tail call that this
# test does not itself exercise. restore_active_release/restore_legacy_runtime
# are recorded so a bug that DOES call them in staged mode is caught, exactly
# like scripts/qa/test-task168-deploy-prod-stage-failure.sh's direct-call
# version -- this file's own point is reaching restore_on_failure via the
# real trap, not re-checking its internal dispatch a second time.
archive_failed_candidate() { :; }
restore_active_release() { printf '%s\n' RESTORE_ACTIVE_CALLED >> "${events}"; return 1; }
restore_legacy_runtime() { printf '%s\n' RESTORE_LEGACY_CALLED >> "${events}"; return 1; }
compose_mock() { printf '%s\n' "COMPOSE:\$*" >> "${events}"; printf fake-db-url; }
compose=(compose_mock)
prod_task168_main() {
  printf '%s\n' "TASK168:\$1" >> "${events}"
  [[ "\$1" == "${fail_on}" ]] && return 1
  return 0
}
wait_for_prod_health_contract() { printf '%s\n' HEALTH >> "${events}"; }
assert_running_release_digests() { printf '%s\n' DIGEST >> "${events}"; }
promote_candidate_manifest() { printf '%s\n' PROMOTE >> "${events}"; }
write_legacy_release_state() { printf '%s\n' LEGACY_STATE >> "${events}"; }
assert_task168_m11_guard() { printf '%s\n' M11_GUARD >> "${events}"; }
task168_stage="${stage}"
PROD_MANIFEST_FILE="${manifest_file}"
PROD_SHA="3333333333333333333333333333333333333333"
PROD_RELEASE_STATE_DIR="${scenario_dir}/state"
source "${ROOT_DIR}/deploy/prod-task168-common.sh"
PROD_RELEASE_STATE_FILE="${scenario_dir}/state/nonexistent-state.json"
PROD_CANDIDATE_MANIFEST="${scenario_dir}/state/candidate.json"
had_active=true
runtime_mutated=true
source_activated=true
PROD_RELEASE_VERSION=1.2.3
PROD_RELEASE_SHA=3333333333333333333333333333333333333333
WRAPPER
  cat "${TEST_ROOT}/trap-segment.sh" >> "${wrapper}"
  cat "${TEST_ROOT}/routing-segment.sh" >> "${wrapper}"
  set +e
  CASE_OUTPUT="$(bash "${wrapper}" 2>&1)"
  CASE_RC=$?
  set -e
  CASE_SCENARIO_DIR="${scenario_dir}"
}

# ── (a) stageB verify fails -> no PROMOTE, reached via the real ERR trap ───
run_case stageB verify a
if [[ "${CASE_RC}" -ne 0 ]]; then
  ok "(a) verify failure: segment exits nonzero"
else
  bad "(a) verify failure: expected nonzero exit, got 0: ${CASE_OUTPUT}"
fi
if grep -qx PROMOTE "${CASE_SCENARIO_DIR}/events.log"; then
  bad "(a) verify failure: PROMOTE fired despite verify failing"
else
  ok "(a) verify failure: PROMOTE never fired"
fi
if grep -qE '^(RESTORE_ACTIVE_CALLED|RESTORE_LEGACY_CALLED)$' "${CASE_SCENARIO_DIR}/events.log"; then
  bad "(a) verify failure: a restore function fired via the real trap (should be refused in staged mode)"
else
  ok "(a) verify failure: no restore function fired (reached via the real ERR trap, not a direct call)"
fi
activation_file="${CASE_SCENARIO_DIR}/state/task168/3333333333333333333333333333333333333333/activation-stage.json"
if [[ -f "${activation_file}" ]] && jq -e '.stage=="stageB"' "${activation_file}" >/dev/null 2>&1; then
  ok "(a) verify failure: activation-stage.json recorded via the real trap"
else
  bad "(a) verify failure: activation-stage.json missing/wrong at ${activation_file}"
fi

# ── (b) stageA runner itself fails -> no manifest kept, rc != 0 ────────────
run_case stageA stageA b
if [[ "${CASE_RC}" -ne 0 ]]; then
  ok "(b) stageA runner failure: segment exits nonzero"
else
  bad "(b) stageA runner failure: expected nonzero exit, got 0: ${CASE_OUTPUT}"
fi
manifest_copy="${CASE_SCENARIO_DIR}/state/task168/3333333333333333333333333333333333333333/manifest.json"
if [[ -f "${manifest_copy}" ]]; then
  bad "(b) stageA runner failure: candidate manifest was kept at ${manifest_copy} despite the runner failing"
else
  ok "(b) stageA runner failure: candidate manifest was NOT kept"
fi
if grep -qE '^(RESTORE_ACTIVE_CALLED|RESTORE_LEGACY_CALLED)$' "${CASE_SCENARIO_DIR}/events.log"; then
  bad "(b) stageA runner failure: a restore function fired (should be refused in staged mode)"
else
  ok "(b) stageA runner failure: no restore function fired"
fi

# ── (c) stageB runner itself fails -> no compose 'up -d' ───────────────────
run_case stageB stageB c
if [[ "${CASE_RC}" -ne 0 ]]; then
  ok "(c) stageB runner failure: segment exits nonzero"
else
  bad "(c) stageB runner failure: expected nonzero exit, got 0: ${CASE_OUTPUT}"
fi
if grep -q '^COMPOSE:up -d' "${CASE_SCENARIO_DIR}/events.log"; then
  bad "(c) stageB runner failure: a compose 'up -d' call happened despite the runner failing first"
else
  ok "(c) stageB runner failure: no compose 'up -d' call happened"
fi

if [[ "${failures}" -ne 0 ]]; then
  echo "[task168-deploy-prod-failure-paths] FAILED: ${failures} case(s)" >&2
  exit 1
fi
echo "[task168-deploy-prod-failure-paths] passed"

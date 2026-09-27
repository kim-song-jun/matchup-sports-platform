#!/usr/bin/env bash
# Task 175 Task 4: deploy/deploy-prod.sh must route database.task168.stage to
# deploy/prod-task168.sh instead of the M11-guard/migrate/compose-up path,
# with two different shapes:
#   stageA: prod_task168_main stageA, then STOP -- no compose up/nginx/
#           health/digest/verify/promote, candidate manifest kept under
#           task168/<sha>/manifest.json, not promoted, exit 0.
#   stageB: prod_task168_main stageB BEFORE the ordinary compose-up/nginx/
#           health/digest sequence, then prod_task168_main verify AFTER
#           digest and BEFORE promote_candidate_manifest.
#
# Extracts the tail of deploy-prod.sh (from the task168_stage branch through
# the final "is healthy" echo) by content anchor -- same technique as
# scripts/qa/test-task168-prod-guard.sh -- and runs it as its own script with
# every called function/external command faked, asserting call ORDER via a
# single shared event log rather than the full real infrastructure (compose/
# docker/curl), which scripts/qa/test-prod-release-state.sh and
# scripts/qa/test-prod-task168.sh already exercise at the unit level.

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly DEPLOY_PROD="${ROOT_DIR}/deploy/deploy-prod.sh"
readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

start_line="$(grep -n '^if \[\[ "\${task168_stage}" == stageA || "\${task168_stage}" == stageB \]\]; then$' "${DEPLOY_PROD}" | head -1 | cut -d: -f1)"
end_line="$(grep -n 'is healthy"$' "${DEPLOY_PROD}" | head -1 | cut -d: -f1)"
[[ -n "${start_line}" && -n "${end_line}" && "${start_line}" -lt "${end_line}" ]] || {
  echo "extract: could not find both anchor lines in deploy-prod.sh" >&2
  exit 1
}
sed -n "${start_line},${end_line}p" "${DEPLOY_PROD}" > "${TEST_ROOT}/segment.sh"

mock_bin="${TEST_ROOT}/bin"
mkdir -p "${mock_bin}"
printf '#!/bin/sh\nexec "$@"\n' > "${mock_bin}/sudo"
chmod +x "${mock_bin}/sudo"

failures=0
ok() { echo "OK: $1"; }
bad() { echo "FAILED: $1" >&2; failures=$((failures + 1)); }

# run_case STAGE -> sets CASE_RC, CASE_SCENARIO_DIR (events log at
# ${CASE_SCENARIO_DIR}/events.log, one line per mocked call in call order).
run_case() {
  local stage="$1" scenario_dir="${TEST_ROOT}/scenario-$2"
  mkdir -p "${scenario_dir}/manifest-source"
  local events="${scenario_dir}/events.log"
  : > "${events}"

  local manifest_file="${scenario_dir}/manifest.json"
  printf '{"release":{"sha":"%s"}}' "3333333333333333333333333333333333333333" > "${manifest_file}"

  # docker is only touched for the uploads-backup probe (no container ->
  # skip the whole backup/restore block) and the end-of-run image prune.
  cat > "${mock_bin}/docker" <<'FAKE'
#!/bin/sh
case "$*" in
  'ps -a --format {{.Names}}') exit 0 ;; # empty output: no existing container
  'image prune -f') exit 0 ;;
  *) echo "unexpected docker invocation in this routing test: $*" >&2; exit 92 ;;
esac
FAKE
  chmod +x "${mock_bin}/docker"

  local wrapper="${scenario_dir}/wrapper.sh"
  cat > "${wrapper}" <<WRAPPER
#!/usr/bin/env bash
set -Eeuo pipefail
PATH="${mock_bin}:\${PATH}"
# Every compose call just logs its args and echoes a harmless placeholder --
# the placeholder satisfies the one call whose stdout the segment actually
# reads (the DATABASE_URL fetch, which hard-fails on an empty result); every
# other call's stdout is bare/ignored, so a constant placeholder is safe for
# all of them.
compose_mock() {
  printf '%s\n' "COMPOSE:\$*" >> "${events}"
  printf fake-db-url
}
compose=(compose_mock)
prod_task168_main() { printf '%s\n' "TASK168:\$1" >> "${events}"; }
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
had_active=false
PROD_RELEASE_VERSION=1.2.3
PROD_RELEASE_SHA=3333333333333333333333333333333333333333
WRAPPER
  cat "${TEST_ROOT}/segment.sh" >> "${wrapper}"
  set +e
  CASE_OUTPUT="$(bash "${wrapper}" 2>&1)"
  CASE_RC=$?
  set -e
  CASE_SCENARIO_DIR="${scenario_dir}"
}

event_line() {
  grep -n "^$2\$" "$1/events.log" 2>/dev/null | head -1 | cut -d: -f1
}

# ── stageA: prod_task168_main stageA, then a hard stop -- no compose up,
#    no nginx, no health/digest, no verify, no promote ────────────────────
run_case stageA a
if [[ "${CASE_RC}" -eq 0 ]]; then
  ok "stageA: segment exits 0"
else
  bad "stageA: expected exit 0, got ${CASE_RC}: ${CASE_OUTPUT}"
fi
if grep -qx 'TASK168:stageA' "${CASE_SCENARIO_DIR}/events.log"; then
  ok "stageA: prod_task168_main was called with stageA"
else
  bad "stageA: prod_task168_main stageA was never called"
fi
if grep -q '^COMPOSE:up -d' "${CASE_SCENARIO_DIR}/events.log"; then
  bad "stageA: a compose 'up -d' call happened -- Stage A must never bring up containers"
else
  ok "stageA: no compose 'up -d' call happened"
fi
for forbidden in HEALTH DIGEST PROMOTE 'TASK168:verify' 'TASK168:stageB' M11_GUARD LEGACY_STATE; do
  if grep -qx "${forbidden}" "${CASE_SCENARIO_DIR}/events.log"; then
    bad "stageA: unexpected event reached: ${forbidden}"
  fi
done
ok "stageA: none of health/digest/promote/verify/M11-guard/legacy-state fired"
manifest_copy="${CASE_SCENARIO_DIR}/state/task168/3333333333333333333333333333333333333333/manifest.json"
if [[ -f "${manifest_copy}" ]]; then
  ok "stageA: candidate manifest kept at task168/<sha>/manifest.json"
else
  bad "stageA: candidate manifest was not preserved at ${manifest_copy}"
fi
if [[ ! -e "${CASE_SCENARIO_DIR}/state/candidate.json" ]]; then
  ok "stageA: the never-promoted PROD_CANDIDATE_MANIFEST was cleaned up"
else
  bad "stageA: PROD_CANDIDATE_MANIFEST was left behind despite never being promoted"
fi

# ── stageB: stageB runs BEFORE compose up, verify runs AFTER health+digest
#    and BEFORE promote; the ordinary compose-up/nginx/health/digest tail
#    still runs (unlike stageA) ────────────────────────────────────────────
run_case stageB b
if [[ "${CASE_RC}" -eq 0 ]]; then
  ok "stageB: segment exits 0"
else
  bad "stageB: expected exit 0, got ${CASE_RC}: ${CASE_OUTPUT}"
fi
stageb_line="$(event_line "${CASE_SCENARIO_DIR}" 'TASK168:stageB')"
upd_line="$(event_line "${CASE_SCENARIO_DIR}" 'COMPOSE:up -d')"
health_line="$(event_line "${CASE_SCENARIO_DIR}" 'HEALTH')"
digest_line="$(event_line "${CASE_SCENARIO_DIR}" 'DIGEST')"
verify_line="$(event_line "${CASE_SCENARIO_DIR}" 'TASK168:verify')"
promote_line="$(event_line "${CASE_SCENARIO_DIR}" 'PROMOTE')"
if [[ -n "${stageb_line}" && -n "${upd_line}" && -n "${health_line}" && -n "${digest_line}" && -n "${verify_line}" && -n "${promote_line}" ]] &&
  [[ "${stageb_line}" -lt "${upd_line}" && "${upd_line}" -lt "${health_line}" && "${health_line}" -lt "${digest_line}" && "${digest_line}" -lt "${verify_line}" && "${verify_line}" -lt "${promote_line}" ]]; then
  ok "stageB: order is stageB -> compose up -> health -> digest -> verify -> promote"
else
  bad "stageB: expected ordering not observed (stageB=${stageb_line} up-d=${upd_line} health=${health_line} digest=${digest_line} verify=${verify_line} promote=${promote_line})"
  cat "${CASE_SCENARIO_DIR}/events.log" >&2
fi
if grep -qx M11_GUARD "${CASE_SCENARIO_DIR}/events.log"; then
  bad "stageB: assert_task168_m11_guard was called -- Stage B must never go through the M11 guard"
else
  ok "stageB: assert_task168_m11_guard was not called"
fi

if [[ "${failures}" -ne 0 ]]; then
  echo "[task168-deploy-prod-stage-routing] FAILED: ${failures} case(s)" >&2
  exit 1
fi
echo "[task168-deploy-prod-stage-routing] passed"

#!/usr/bin/env bash
# Task 175 Task 4 fix round 1, Important 3: restore_active_release()
# (deploy/prod-release-common.sh) is the automatic recovery path an
# ORDINARY (non-Task168) deploy takes when it fails at its own health
# check. If a Stage B run already applied M11 and then failed at
# verify/health BEFORE promoting, `active` in state.json is still the
# pre-M11 release -- restore_active_release() must refuse to redeploy that
# stale release's images against the now-post-M11 database, exactly like
# rollback-prod.sh already refuses an explicit rollback to the same target.
# Both now share assert_task168_m11_restore_target_safe().
#
# Calls the real restore_active_release() directly against a real state.json
# + stored manifests (same fixture shape as scripts/qa/test-prod-release-state.sh),
# with activate_prod_release_source() REDEFINED (after sourcing -- last
# definition wins) as a marker-recording stub: the guard sits BEFORE that
# call in the real function, so "was activate_prod_release_source reached"
# is exactly "did the guard let this through", without needing to mock the
# rest of the real function's docker/curl calls too.

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

readonly M11_NAME=20260911090000_retire_tournament_fixture_tables
readonly ACTIVE_SHA=1111111111111111111111111111111111111111
readonly REGISTRY=851725525576.dkr.ecr.ap-northeast-2.amazonaws.com
readonly DIGEST="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

mock_bin="${TEST_ROOT}/bin"
mkdir -p "${mock_bin}"
printf '#!/bin/sh\nexec "$@"\n' > "${mock_bin}/sudo"
chmod +x "${mock_bin}/sudo"
export PATH="${mock_bin}:${PATH}"

reached_activate_log="${TEST_ROOT}/reached-activate.log"

make_manifest() {
  local sha="$1" output="$2"
  jq -Sn --arg sha "${sha}" --arg registry "${REGISTRY}" --arg digest "${DIGEST}" '{
    schemaVersion:1, environment:"production",
    release:{sha:$sha, version:"1.0.0", createdAt:"2026-07-19T00:00:00Z"},
    source:{transfer:"ssh-rsync", sha256:("c"*64)},
    database:{migrationPolicy:"expand-contract", rollbackMode:"application-images-only",
      compatibilityCheck:"expand-contract-sql-v1",
      migrationValidatedFrom:null, rollbackCompatibleWith:null},
    images:{
      api:{repository:($registry+"/teameet-prod-v1-api"),digest:$digest,uri:($registry+"/teameet-prod-v1-api@"+$digest)},
      web:{repository:($registry+"/teameet-prod-v1-web"),digest:$digest,uri:($registry+"/teameet-prod-v1-web@"+$digest)}
    }
  }' > "${output}"
}

failures=0
ok() { echo "OK: $1"; }
bad() { echo "FAILED: $1" >&2; failures=$((failures + 1)); }

setup_state() {
  local home="$1" with_receipt="$2" active_has_m11="$3" state_dir active_m active_checksum
  state_dir="${home}/.teameet-prod-releases"
  install -d -m 700 "${state_dir}"
  active_m="${state_dir}/.active-fixture.json"
  make_manifest "${ACTIVE_SHA}" "${active_m}"
  active_checksum="$(sha256sum "${active_m}" | awk '{print $1}')"
  jq -n --slurpfile active "${active_m}" --arg activeChecksum "${active_checksum}" \
    '{schemaVersion:1, active:$active[0], activeManifestSha256:$activeChecksum, previous:null, previousManifestSha256:null}' \
    > "${state_dir}/state.json"

  mkdir -p "${state_dir}/sources/${ACTIVE_SHA}/apps/v1_api/prisma/migrations"
  if [[ "${active_has_m11}" == true ]]; then
    mkdir -p "${state_dir}/sources/${ACTIVE_SHA}/apps/v1_api/prisma/migrations/${M11_NAME}"
  fi
  if [[ "${with_receipt}" == true ]]; then
    install -d -m 700 "${state_dir}/task168/9999999999999999999999999999999999999999"
    printf '{"schemaVersion":1,"kind":"transition","status":"COMPLETED"}' \
      > "${state_dir}/task168/9999999999999999999999999999999999999999/transition.json"
  fi
  printf '%s' "${state_dir}"
}

run_restore() {
  local state_dir="$1"
  PROD_RELEASE_STATE_DIR="${state_dir}" \
  PROD_RELEASE_STATE_FILE="${state_dir}/state.json" \
  PROD_SOURCE_RELEASES_DIR="${state_dir}/sources" \
  PROD_ECR_REGISTRY="${REGISTRY}" \
  bash -c '
    set -Eeuo pipefail
    source "'"${ROOT_DIR}"'/deploy/prod-release-common.sh"
    activate_prod_release_source() { printf "called with %s\n" "$1" >> "'"${reached_activate_log}"'"; return 1; }
    restore_active_release
  ' 2>&1
}

# ── (1) receipt exists + active source has NO M11 -> refused, never reached
#        activate_prod_release_source ─────────────────────────────────────
: > "${reached_activate_log}"
home1="${TEST_ROOT}/home1"; mkdir -p "${home1}"
state1="$(setup_state "${home1}" true false)"
out1="$(run_restore "${state1}")" && rc1=0 || rc1=$?
if [[ "${rc1}" -ne 0 && "${out1}" == *"Refusing"*"predates the M11 migration"* ]]; then
  ok "receipt present + active lacks M11 -> restore_active_release refused (rc=${rc1})"
else
  bad "receipt present + active lacks M11 -> expected refusal, got rc=${rc1}: ${out1}"
fi
if [[ -s "${reached_activate_log}" ]]; then
  bad "rejection case reached activate_prod_release_source -- the guard did not stop it in time: $(cat "${reached_activate_log}")"
else
  ok "rejection case never reached activate_prod_release_source"
fi

# ── (2) receipt exists + active source DOES have M11 -> guard passes ──────
: > "${reached_activate_log}"
home2="${TEST_ROOT}/home2"; mkdir -p "${home2}"
state2="$(setup_state "${home2}" true true)"
run_restore "${state2}" >/dev/null 2>&1 || true
if grep -q "called with ${ACTIVE_SHA}" "${reached_activate_log}" 2>/dev/null; then
  ok "receipt present + active ships M11 -> guard does not block (reached activate_prod_release_source)"
else
  bad "receipt present + active ships M11 -> expected the guard to pass through, activate_prod_release_source was not reached"
fi

# ── (3) no transition receipt anywhere -> guard is a no-op ────────────────
: > "${reached_activate_log}"
home3="${TEST_ROOT}/home3"; mkdir -p "${home3}"
state3="$(setup_state "${home3}" false false)"
run_restore "${state3}" >/dev/null 2>&1 || true
if grep -q "called with ${ACTIVE_SHA}" "${reached_activate_log}" 2>/dev/null; then
  ok "no transition receipt anywhere -> guard is a no-op (reached activate_prod_release_source)"
else
  bad "no transition receipt anywhere -> expected the guard to pass through, activate_prod_release_source was not reached"
fi

if [[ "${failures}" -ne 0 ]]; then
  echo "[task168-restore-active-release-guard] FAILED: ${failures} case(s)" >&2
  exit 1
fi
echo "[task168-restore-active-release-guard] passed"

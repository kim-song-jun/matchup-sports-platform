#!/usr/bin/env bash
# Task 175 Task 4 fix round 2 (Ruling R11) + fix round 3 (Critical H1):
# assert_task168_m11_restore_target_safe() (deploy/prod-release-common.sh)
# refuses a restore/rollback only when ALL THREE hold: a transition receipt
# exists, the migration ledger shows M11 finished, AND the restore TARGET's
# own stored source predates M11. Round 1's transition.json-existence +
# target-source-only check produced a real false rejection (Stage A done,
# Stage B's M11 migrate not run yet); round 2's ledger-only replacement then
# refused EVERY target forever once M11 really was applied. See the
# function's own doc comment for the full history.
#
# Calls the real restore_active_release() directly against a real state.json
# + stored manifest (same fixture shape as
# scripts/qa/test-prod-release-state.sh), with activate_prod_release_source()
# redefined (after sourcing -- last definition wins) as a marker-recording
# stub: the guard sits BEFORE that call in the real function, so "was
# activate_prod_release_source reached" is exactly "did the guard let this
# through". The ledger query itself is faked via a real `docker` executable
# on PATH (compose's own DB-URL fetch is a plain bash function instead,
# since it goes through the `compose` array, not a bare `sudo docker` call).

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

readonly ACTIVE_SHA=1111111111111111111111111111111111111111
readonly REGISTRY=851725525576.dkr.ecr.ap-northeast-2.amazonaws.com
readonly DIGEST="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

mock_bin="${TEST_ROOT}/bin"
mkdir -p "${mock_bin}"
printf '#!/bin/sh\nexec "$@"\n' > "${mock_bin}/sudo"
chmod +x "${mock_bin}/sudo"
export PATH="${mock_bin}:${PATH}"

reached_activate_log="${TEST_ROOT}/reached-activate.log"
ledger_calls_log="${TEST_ROOT}/ledger-calls.log"

# $1: fake finished-M11-count the psql query should report ("0" or "1"+).
# $2: "fail" makes the docker run (the psql query itself) exit nonzero
#     instead, simulating an unreadable ledger.
write_fake_docker() {
  local m11_count="$1" should_fail="$2"
  cat > "${mock_bin}/docker" <<FAKE
#!/bin/sh
printf '%s\n' "\$1" >> "${ledger_calls_log}"
case "\$1" in
  network)
    echo deploy_default
    exit 0
    ;;
  run)
    if [ "${should_fail}" = fail ]; then
      echo "fake psql failure injected by test" >&2
      exit 1
    fi
    echo "${m11_count}"
    exit 0
    ;;
  *)
    echo "unexpected docker invocation: \$*" >&2
    exit 92
    ;;
esac
FAKE
  chmod +x "${mock_bin}/docker"
}

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

# setup_state HOME WITH_RECEIPT [TARGET_SOURCE=none|no-m11|has-m11] -> prints
# state_dir. TARGET_SOURCE controls ACTIVE_SHA's own stored source tree
# (fix round 3, Critical H1: condition (3) of the guard) -- "none" (default)
# means the release's stored source was never captured/was pruned, "no-m11"
# means it exists but predates the M11 migration, "has-m11" means it already
# carries M11 (built to handle the post-cutover schema).
setup_state() {
  local home="$1" with_receipt="$2" target_source="${3:-none}" state_dir active_m active_checksum
  state_dir="${home}/.teameet-prod-releases"
  install -d -m 700 "${state_dir}"
  active_m="${state_dir}/.active-fixture.json"
  make_manifest "${ACTIVE_SHA}" "${active_m}"
  active_checksum="$(sha256sum "${active_m}" | awk '{print $1}')"
  jq -n --slurpfile active "${active_m}" --arg activeChecksum "${active_checksum}" \
    '{schemaVersion:1, active:$active[0], activeManifestSha256:$activeChecksum, previous:null, previousManifestSha256:null}' \
    > "${state_dir}/state.json"

  case "${target_source}" in
    none) : ;; # ${state_dir}/sources/${ACTIVE_SHA} is simply never created
    no-m11)
      install -d -m 700 "${state_dir}/sources/${ACTIVE_SHA}/apps/v1_api/prisma/migrations"
      ;;
    has-m11)
      install -d -m 700 "${state_dir}/sources/${ACTIVE_SHA}/apps/v1_api/prisma/migrations/20260911090000_retire_tournament_fixture_tables"
      ;;
    *) echo "setup_state: unknown target_source '${target_source}'" >&2; exit 1 ;;
  esac

  if [[ "${with_receipt}" == true ]]; then
    install -d -m 700 "${state_dir}/task168/9999999999999999999999999999999999999999"
    printf '{"schemaVersion":1,"kind":"transition","status":"COMPLETED"}' \
      > "${state_dir}/task168/9999999999999999999999999999999999999999/transition.json"
  fi
  printf '%s' "${state_dir}"
}

run_restore() {
  local state_dir="$1" state_root_override="${2:-}"
  PROD_RELEASE_STATE_DIR="${state_dir}" \
  PROD_RELEASE_STATE_FILE="${state_dir}/state.json" \
  PROD_SOURCE_RELEASES_DIR="${state_dir}/sources" \
  PROD_TASK168_STATE_ROOT="${state_root_override}" \
  PROD_ECR_REGISTRY="${REGISTRY}" \
  PATH="${PATH}" \
  bash -c '
    set -Eeuo pipefail
    source "'"${ROOT_DIR}"'/deploy/prod-release-common.sh"
    compose_mock() { printf fake-db-url; }
    compose=(compose_mock)
    activate_prod_release_source() { printf "called with %s\n" "$1" >> "'"${reached_activate_log}"'"; return 1; }
    restore_active_release
  ' 2>&1
}

# ── (1) receipt exists + ledger shows M11 NOT applied -> passes through ────
write_fake_docker 0 no
: > "${reached_activate_log}"; : > "${ledger_calls_log}"
home1="${TEST_ROOT}/home1"; mkdir -p "${home1}"
state1="$(setup_state "${home1}" true)"
run_restore "${state1}" >/dev/null 2>&1 || true
if grep -q "called with ${ACTIVE_SHA}" "${reached_activate_log}" 2>/dev/null; then
  ok "receipt present + ledger M11 not applied -> guard passes (reached activate_prod_release_source)"
else
  bad "receipt present + ledger M11 not applied -> expected the guard to pass through, it did not"
fi

# ── (2a) receipt + ledger M11 applied + target source never captured/pruned
#         -> refused (fail-closed, cannot verify) ──────────────────────────
write_fake_docker 1 no
: > "${reached_activate_log}"; : > "${ledger_calls_log}"
home2a="${TEST_ROOT}/home2a"; mkdir -p "${home2a}"
state2a="$(setup_state "${home2a}" true none)"
out2a="$(run_restore "${state2a}")" && rc2a=0 || rc2a=$?
if [[ "${rc2a}" -ne 0 && "${out2a}" == *"M11 already applied"*"no longer retained"* ]]; then
  ok "receipt + ledger M11 applied + target source not retained -> refused fail-closed"
else
  bad "receipt + ledger M11 applied + target source not retained -> expected refusal, got rc=${rc2a}: ${out2a}"
fi
if [[ -s "${reached_activate_log}" ]]; then
  bad "target-source-missing case reached activate_prod_release_source"
fi

# ── (2b) receipt + ledger M11 applied + target source EXISTS but predates
#         M11 -> refused (Critical H1's condition 3, restored) ─────────────
: > "${reached_activate_log}"; : > "${ledger_calls_log}"
home2b="${TEST_ROOT}/home2b"; mkdir -p "${home2b}"
state2b="$(setup_state "${home2b}" true no-m11)"
out2b="$(run_restore "${state2b}")" && rc2b=0 || rc2b=$?
if [[ "${rc2b}" -ne 0 && "${out2b}" == *"M11 already applied"*"predates the M11 migration"* ]]; then
  ok "receipt + ledger M11 applied + target source predates M11 -> refused"
else
  bad "receipt + ledger M11 applied + target source predates M11 -> expected refusal, got rc=${rc2b}: ${out2b}"
fi
if [[ -s "${reached_activate_log}" ]]; then
  bad "target-source-predates-M11 case reached activate_prod_release_source"
fi

# ── (2c) receipt + ledger M11 applied + target source ALREADY carries M11 --
#         Critical H1: this must now PASS (round 2 wrongly refused it) ─────
: > "${reached_activate_log}"; : > "${ledger_calls_log}"
home2c="${TEST_ROOT}/home2c"; mkdir -p "${home2c}"
state2c="$(setup_state "${home2c}" true has-m11)"
run_restore "${state2c}" >/dev/null 2>&1 || true
if grep -q "called with ${ACTIVE_SHA}" "${reached_activate_log}" 2>/dev/null; then
  ok "receipt + ledger M11 applied + target source already carries M11 -> guard passes (reached activate_prod_release_source)"
else
  bad "receipt + ledger M11 applied + target source already carries M11 -> expected the guard to pass through, it did not"
fi

# ── (3) receipt exists + ledger query itself fails -> refused, fail-closed ─
write_fake_docker 0 fail
: > "${reached_activate_log}"; : > "${ledger_calls_log}"
home3="${TEST_ROOT}/home3"; mkdir -p "${home3}"
state3="$(setup_state "${home3}" true)"
out3="$(run_restore "${state3}")" && rc3=0 || rc3=$?
if [[ "${rc3}" -ne 0 && "${out3}" == *"could not query the migration ledger"* ]]; then
  ok "receipt present + ledger query fails -> refused fail-closed (rc=${rc3}), reason asserted"
else
  bad "receipt present + ledger query fails -> expected a fail-closed refusal with a diagnosable reason, got rc=${rc3}: ${out3}"
fi
if [[ -s "${reached_activate_log}" ]]; then
  bad "query-failure case reached activate_prod_release_source -- fail-closed did not hold"
else
  ok "query-failure case never reached activate_prod_release_source"
fi

# ── (4) no transition receipt anywhere -> no-op, ledger never queried ──────
write_fake_docker 1 no # would refuse if queried -- proves case (4) truly skips the query
: > "${reached_activate_log}"; : > "${ledger_calls_log}"
home4="${TEST_ROOT}/home4"; mkdir -p "${home4}"
state4="$(setup_state "${home4}" false)"
run_restore "${state4}" >/dev/null 2>&1 || true
if grep -q "called with ${ACTIVE_SHA}" "${reached_activate_log}" 2>/dev/null; then
  ok "no transition receipt anywhere -> guard is a no-op (reached activate_prod_release_source)"
else
  bad "no transition receipt anywhere -> expected the guard to pass through, it did not"
fi
if [[ -s "${ledger_calls_log}" ]]; then
  bad "no transition receipt anywhere -> the ledger was queried anyway (should short-circuit before any DB round-trip): $(cat "${ledger_calls_log}")"
else
  ok "no transition receipt anywhere -> the ledger was never queried"
fi

# ── (5) Minor (fix round 2): PROD_TASK168_STATE_ROOT override is honored --
#        receipt placed ONLY under a non-default state root; the guard must
#        follow the SAME env var Stage A itself writes under
#        (deploy/prod-task168-common.sh), not a hardcoded
#        ${PROD_RELEASE_STATE_DIR}/task168. Ledger reports M11 applied, so a
#        guard that ignored the override (and found no receipt at the
#        default location) would wrongly ALLOW; one that honors it correctly
#        REFUSES.
write_fake_docker 1 no
: > "${reached_activate_log}"; : > "${ledger_calls_log}"
home5="${TEST_ROOT}/home5"; mkdir -p "${home5}"
state5="$(setup_state "${home5}" false)" # no receipt at the DEFAULT location
custom_root5="${home5}/custom-task168-state-root"
install -d -m 700 "${custom_root5}/9999999999999999999999999999999999999999"
printf '{"schemaVersion":1,"kind":"transition","status":"COMPLETED"}' \
  > "${custom_root5}/9999999999999999999999999999999999999999/transition.json"
out5="$(run_restore "${state5}" "${custom_root5}")" && rc5=0 || rc5=$?
if [[ "${rc5}" -ne 0 && "${out5}" == *"M11 already applied"* ]]; then
  ok "PROD_TASK168_STATE_ROOT override is honored -- receipt found there, guard refused"
else
  bad "PROD_TASK168_STATE_ROOT override was ignored -- expected a refusal driven by the receipt at the override path, got rc=${rc5}: ${out5}"
fi

if [[ "${failures}" -ne 0 ]]; then
  echo "[task168-restore-active-release-guard] FAILED: ${failures} case(s)" >&2
  exit 1
fi
echo "[task168-restore-active-release-guard] passed"

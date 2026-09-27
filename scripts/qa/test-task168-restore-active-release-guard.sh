#!/usr/bin/env bash
# Task 175 Task 4 fix round 2, Ruling R11: assert_task168_m11_restore_target_safe()
# (deploy/prod-release-common.sh) must gate on the ACTUAL migration ledger
# (M11 finished, not rolled back), not on transition.json's mere existence
# combined with the target release's own stored-source folder -- see the
# function's own doc comment for why fix round 1's version produced a real
# false rejection (Stage A done, Stage B's M11 migrate not run yet).
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

# setup_state HOME WITH_RECEIPT -> prints state_dir. Note: no per-release
# source-tree fixture anymore -- fix round 2 dropped that signal entirely.
setup_state() {
  local home="$1" with_receipt="$2" state_dir active_m active_checksum
  state_dir="${home}/.teameet-prod-releases"
  install -d -m 700 "${state_dir}"
  active_m="${state_dir}/.active-fixture.json"
  make_manifest "${ACTIVE_SHA}" "${active_m}"
  active_checksum="$(sha256sum "${active_m}" | awk '{print $1}')"
  jq -n --slurpfile active "${active_m}" --arg activeChecksum "${active_checksum}" \
    '{schemaVersion:1, active:$active[0], activeManifestSha256:$activeChecksum, previous:null, previousManifestSha256:null}' \
    > "${state_dir}/state.json"

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

# ── (2) receipt exists + ledger shows M11 applied -> refused ───────────────
write_fake_docker 1 no
: > "${reached_activate_log}"; : > "${ledger_calls_log}"
home2="${TEST_ROOT}/home2"; mkdir -p "${home2}"
state2="$(setup_state "${home2}" true)"
out2="$(run_restore "${state2}")" && rc2=0 || rc2=$?
if [[ "${rc2}" -ne 0 && "${out2}" == *"Refusing"*"M11 already applied"* ]]; then
  ok "receipt present + ledger M11 applied -> restore_active_release refused (rc=${rc2})"
else
  bad "receipt present + ledger M11 applied -> expected refusal, got rc=${rc2}: ${out2}"
fi
if [[ -s "${reached_activate_log}" ]]; then
  bad "M11-applied case reached activate_prod_release_source -- the guard did not stop it in time: $(cat "${reached_activate_log}")"
else
  ok "M11-applied case never reached activate_prod_release_source"
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

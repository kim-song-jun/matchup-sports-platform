#!/usr/bin/env bash

# D-5 guard contract test. Exercises the REAL guard function
# (assert_task168_m11_absent, deploy/alpha-release-common.sh) that
# deploy/deploy-alpha.sh calls — not a reimplementation or a hand-copied
# excerpt of its SQL — against a fake docker/psql on PATH, plus a static
# check that the call site in deploy-alpha.sh still precedes source
# activation.
#
# deploy-alpha.sh's LIVE_DIR/lock path are fixed operational paths
# (/home/ec2-user/...), not test-only environment-variable hooks, so this
# test cannot drive the whole script end-to-end without root access to
# /home. The guard's actual decision logic lives in
# assert_task168_m11_absent precisely so it can be unit-tested directly
# instead of requiring that.

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_SCRIPT="${ROOT}/deploy/deploy-alpha.sh"
COMMON_LIB="${ROOT}/deploy/alpha-release-common.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

PASS=0
FAIL=0
SKIP=0
pass() { PASS=$((PASS + 1)); echo "  ok: $*"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $*" >&2; }
skip() { SKIP=$((SKIP + 1)); echo "  skip: $*"; }

echo "== test-task168-d5-guard =="

# ── Unit: assert_task168_m11_absent against a fake docker/psql on PATH ─────
# $1 = case root, $2 = M11 row count the fake DB reports (0 or 1+).
run_guard_case() {
  local root="$1" m11_rows="$2"
  local log="${root}/calls.log"
  mkdir -p "${root}/bin"
  : > "${log}"

  cat > "${root}/bin/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "docker \$*" >> "${log}"
case "\$*" in
  *"up -d v1_postgres"*) exit 0 ;;
  *"pg_isready"*) exit 0 ;;
  *"_prisma_migrations"*) echo "${m11_rows}"; exit 0 ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "${root}/bin/docker"

  local script="${root}/run.sh"
  cat > "${script}" <<EOF
set -Eeuo pipefail
export PATH="${root}/bin:\${PATH}"
source "${COMMON_LIB}"
compose=(docker compose)
assert_task168_m11_absent compose
EOF
  local rc=0
  bash "${script}" > "${root}/stdout" 2> "${root}/stderr" || rc=$?
  echo "${rc}"
}

neg_root="${WORK}/guard-negative"
mkdir -p "${neg_root}"
rc="$(run_guard_case "${neg_root}" 1)"
[[ "${rc}" -ne 0 ]] && pass "assert_task168_m11_absent refuses when M11 is already in the ledger (rc=${rc})" \
  || fail "assert_task168_m11_absent did not fail with an M11 row present"
grep -q "already present in the ledger" "${neg_root}/stderr" \
  && pass "refusal message names the reason" \
  || fail "no ledger-present message in stderr: $(cat "${neg_root}/stderr")"

pos_root="${WORK}/guard-positive"
mkdir -p "${pos_root}"
rc="$(run_guard_case "${pos_root}" 0)"
[[ "${rc}" -eq 0 ]] && pass "assert_task168_m11_absent succeeds when no M11 row exists" \
  || fail "assert_task168_m11_absent failed with rc=${rc} despite no M11 row: $(cat "${pos_root}/stderr")"
grep -q "up -d v1_postgres" "${pos_root}/calls.log" \
  && pass "the guard brought up v1_postgres before querying it" \
  || fail "the guard never invoked docker compose up"

# ── Static wiring: the call site in deploy-alpha.sh must still exist and
# must textually precede source activation. Combined with the unit test
# above (which proves the function itself is correct), this catches "the
# guard call was removed" or "the guard call was moved to after
# activation" without needing to run the whole script.
call_line="$(grep -n 'assert_task168_m11_absent compose' "${DEPLOY_SCRIPT}" | head -1 | cut -d: -f1)" || true
refusal_line="$(grep -n "Refusing a Stage A manifest" "${DEPLOY_SCRIPT}" | head -1 | cut -d: -f1)" || true
activate_line="$(grep -n 'activate_alpha_release_source "\${source_key}"' "${DEPLOY_SCRIPT}" | head -1 | cut -d: -f1)" || true

if [[ -n "${call_line}" && -n "${activate_line}" && "${call_line}" -lt "${activate_line}" ]]; then
  pass "assert_task168_m11_absent call (line ${call_line}) precedes source activation (line ${activate_line})"
else
  fail "the D-5 guard call does not textually precede source activation (call=${call_line:-missing}, activate=${activate_line:-missing})"
fi

if [[ -n "${refusal_line}" && -n "${activate_line}" && "${refusal_line}" -lt "${activate_line}" ]]; then
  pass "refusal message (line ${refusal_line}) precedes source activation (line ${activate_line})"
else
  fail "the D-5 refusal message does not textually precede source activation (refusal=${refusal_line:-missing}, activate=${activate_line:-missing})"
fi

# ── Regression: deploy-alpha.sh and rollback-alpha.sh must not carry
# test-only environment-variable override hooks for their live paths — the
# instruction that created assert_task168_m11_absent exists specifically to
# let this test avoid needing them.
if grep -qE '\$\{ALPHA_LIVE_DIR:-|\$\{ALPHA_HOME_DIR:-' "${DEPLOY_SCRIPT}"; then
  fail "deploy-alpha.sh still has a test-only ALPHA_LIVE_DIR/ALPHA_HOME_DIR override hook"
else
  pass "deploy-alpha.sh has no test-only path override hooks"
fi

# ── Shared deploy lock: deploy-alpha-stage-b.sh must also take
# the same .teameet-alpha-deploy.lock that deploy-alpha.sh and
# rollback-alpha.sh take, so a StageB host run in progress blocks a StageA
# push deploy queued behind it (and vice versa) rather than both running
# concurrently against the same containers/database.
STAGE_B_SCRIPT="${ROOT}/deploy/deploy-alpha-stage-b.sh"
if grep -q '\.teameet-alpha-deploy\.lock' "${STAGE_B_SCRIPT}"; then
  pass "deploy-alpha-stage-b.sh references the shared .teameet-alpha-deploy.lock"
else
  fail "deploy-alpha-stage-b.sh no longer references the shared .teameet-alpha-deploy.lock"
fi

if command -v flock >/dev/null 2>&1; then
  lock_root="${WORK}/lock-held"
  mkdir -p "${lock_root}"
  (
    exec 9>"${lock_root}/.teameet-alpha-deploy.lock"
    flock -x 9
    sleep 5
  ) &
  holder_pid=$!
  # Give the background subshell time to actually acquire the lock before we
  # race it.
  for _ in $(seq 1 20); do
    [[ -e "${lock_root}/.teameet-alpha-deploy.lock" ]] && break
    sleep 0.1
  done
  sleep 0.2

  rc=0
  ALPHA_SHA=1111111111111111111111111111111111111111 \
    ALPHA_HOME_DIR="${lock_root}" \
    TASK168_STAGE=stageBRecover \
    bash "${STAGE_B_SCRIPT}" > "${lock_root}/stdout" 2> "${lock_root}/stderr" || rc=$?
  kill "${holder_pid}" 2>/dev/null || true
  wait "${holder_pid}" 2>/dev/null || true

  [[ "${rc}" -ne 0 ]] && grep -q "holds the deploy lock" "${lock_root}/stderr" \
    && pass "stageBRecover refuses while the shared deploy lock is held" \
    || fail "stageBRecover did not refuse a held shared deploy lock: rc=${rc} $(cat "${lock_root}/stderr" 2>/dev/null)"
else
  skip "shared-lock contention case (no real flock(1) on this machine — covered by CI on ubuntu)"
fi

echo "== ${PASS} passed, ${FAIL} failed, ${SKIP} skipped =="
(( FAIL == 0 ))

#!/usr/bin/env bash
# Task 175 Task 4, Review Focus 4: deploy/rollback-prod.sh must refuse a
# rollback whenever (a) a Task168 Stage A transition receipt exists anywhere
# in this environment's task168 state AND (b) the rollback target's own
# stored source tree does not carry the M11 (tournament-fixture retirement)
# migration -- and must proceed past that guard, unchanged, in every other
# case (no receipt at all; receipt present but the target DOES ship M11).
#
# Runs the real deploy/rollback-prod.sh (same convention as
# scripts/qa/test-prod-rollback-guards.sh) with sudo/aws/docker/flock faked
# and a full valid active+previous manifest pair in state.json -- real enough
# to reach the M11 guard (past validate_stored_prod_manifest, the
# rollbackCompatibleWith check, and the stale-active check).
#
# `aws ecr get-login-password` and `resolve_compose_binary`'s own `docker
# compose version` probe both run UNCONDITIONALLY, well BEFORE the M11 guard
# -- they cannot serve as an "did we get past the guard" marker (an earlier
# draft of this test wrongly assumed they ran after it). The marker instead
# is the `docker ... compose ... config` call `assert_compose_variables_
# resolve()` makes, which happens only AFTER the guard (inside the
# `rollback_started=true` / ERR-trap-armed section). A rejected run never
# reaches it; an allowed run does. The marker is a FILE, not captured
# output -- assert_compose_variables_resolve() redirects that call's own
# stderr to a tempfile and rm -f's it on the success path, so anything
# written to stdout/stderr there is silently discarded (verified empirically
# in this session: an echo-based marker never appeared in the captured
# output even on an allowed run). This test only asserts the marker file's
# presence/absence -- it does not need (and does not attempt) to complete an
# actual rollback.

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly SCRIPT="${ROOT_DIR}/deploy/rollback-prod.sh"
[[ -f "${SCRIPT}" ]] || { echo "deploy/rollback-prod.sh is missing" >&2; exit 1; }

readonly M11_NAME=20260911090000_retire_tournament_fixture_tables
readonly ACTIVE_SHA=1111111111111111111111111111111111111111
readonly PREVIOUS_SHA=2222222222222222222222222222222222222222
readonly REGISTRY=851725525576.dkr.ecr.ap-northeast-2.amazonaws.com
readonly DIGEST="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

mock_bin="${TEST_ROOT}/bin"
mkdir -p "${mock_bin}"
# Real sudo parses its OWN leading `-`-style options (e.g.
# `--preserve-env=...`) before the command it execs -- a naive `exec "$@"`
# passthrough (as scripts/qa/test-prod-rollback-guards.sh uses, since it
# never reaches this far) would instead try to exec the flag string itself
# as a command and fail immediately.
cat > "${mock_bin}/sudo" <<'FAKE'
#!/bin/sh
while [ "$#" -gt 0 ]; do
  case "$1" in
    -*) shift ;;
    *) break ;;
  esac
done
exec "$@"
FAKE
printf '#!/bin/sh\nexit 0\n' > "${mock_bin}/flock"
cat > "${mock_bin}/aws" <<'FAKE'
#!/bin/sh
echo fake-ecr-password
exit 0
FAKE
cat > "${mock_bin}/docker" <<FAKE
#!/bin/sh
case "\$*" in
  'compose version') exit 0 ;;
  'login --username AWS --password-stdin ${REGISTRY}') cat >/dev/null; exit 0 ;;
  'compose --project-name deploy'*' config')
    # assert_compose_variables_resolve() (deploy/prod-release-common.sh)
    # redirects this call's OWN stderr to a tempfile and only ever prints or
    # keeps it when an "variable is not set" warning is found in it --
    # otherwise it rm -f's that tempfile on the success path. A plain echo
    # here would be silently discarded along with it, so the marker is a
    # file instead: it survives regardless of what the caller does with
    # this process's stdout/stderr.
    : "\${GUARD_MARKER_FILE:?}"
    echo reached >> "\${GUARD_MARKER_FILE}"
    exit 0
    ;;
  *) echo "unexpected docker invocation in this guard test: \$*" >&2; exit 92 ;;
esac
FAKE
chmod +x "${mock_bin}/sudo" "${mock_bin}/flock" "${mock_bin}/docker" "${mock_bin}/aws"

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

# Builds a fresh HOME with: .env, docker-compose.prod.yml stub, a state.json
# whose active manifest declares rollbackCompatibleWith = PREVIOUS_SHA (so the
# compatibility + stale-active checks both pass), and PROD_SOURCE_RELEASES_DIR
# entries for both releases -- with or without the previous release's M11
# migration folder, and with or without a task168 transition receipt.
setup_env() {
  local home="$1" with_receipt="$2" previous_has_m11="$3"
  local live="${home}/teameet"
  mkdir -p "${live}/deploy"
  cp "${ROOT_DIR}/deploy/prod-release-common.sh" "${ROOT_DIR}/deploy/prod-source-common.sh" \
    "${ROOT_DIR}/deploy/prod-manifest-common.sh" "${live}/deploy/"
  printf 'FOO=bar\n' > "${live}/deploy/.env"
  printf 'services: {}\n' > "${live}/deploy/docker-compose.prod.yml"

  local state_dir="${home}/.teameet-prod-releases"
  local active_m active_checksum previous_m previous_checksum
  active_m="${TEST_ROOT}/active-${home##*/}.json"
  previous_m="${TEST_ROOT}/previous-${home##*/}.json"
  make_manifest "${ACTIVE_SHA}" "${active_m}"
  jq --arg prev "${PREVIOUS_SHA}" '.database.rollbackCompatibleWith = $prev' "${active_m}" > "${active_m}.tmp"
  mv "${active_m}.tmp" "${active_m}"
  make_manifest "${PREVIOUS_SHA}" "${previous_m}"
  active_checksum="$(sha256sum "${active_m}" | awk '{print $1}')"
  previous_checksum="$(sha256sum "${previous_m}" | awk '{print $1}')"

  install -d -m 700 "${state_dir}"
  jq -n --slurpfile active "${active_m}" --slurpfile previous "${previous_m}" \
    --arg activeChecksum "${active_checksum}" --arg previousChecksum "${previous_checksum}" \
    '{schemaVersion:1, active:$active[0], activeManifestSha256:$activeChecksum,
      previous:$previous[0], previousManifestSha256:$previousChecksum}' \
    > "${state_dir}/state.json"

  # Both releases' own immutable stored source trees -- required for
  # validate_stored_prod_manifest's own optional source_dir comparison to be
  # harmless (neither manifest carries database.task168, so it is a no-op),
  # and for the M11 guard itself to have something to check on the previous
  # release's side.
  mkdir -p "${state_dir}/sources/${ACTIVE_SHA}" "${state_dir}/sources/${PREVIOUS_SHA}/apps/v1_api/prisma/migrations"
  if [[ "${previous_has_m11}" == true ]]; then
    mkdir -p "${state_dir}/sources/${PREVIOUS_SHA}/apps/v1_api/prisma/migrations/${M11_NAME}"
  fi

  if [[ "${with_receipt}" == true ]]; then
    install -d -m 700 "${state_dir}/task168/${ACTIVE_SHA}"
    printf '{"schemaVersion":1,"kind":"transition","status":"COMPLETED"}' \
      > "${state_dir}/task168/${ACTIVE_SHA}/transition.json"
  fi

  printf '%s' "${state_dir}"
}

run_rollback() {
  local home="$1" state_dir="$2" marker_file="$3"
  PATH="${mock_bin}:/usr/bin:/bin:/usr/sbin:/sbin" \
  HOME="${home}" \
  PROD_HOME_DIR="${home}" \
  PROD_LIVE_DIR="${home}/teameet" \
  PROD_RELEASE_STATE_DIR="${state_dir}" \
  PROD_RELEASE_STATE_FILE="${state_dir}/state.json" \
  PROD_SOURCE_RELEASES_DIR="${state_dir}/sources" \
  PROD_ECR_REGISTRY="${REGISTRY}" \
  PROD_AWS_REGION=ap-northeast-2 \
  PROD_EXPECTED_ACTIVE_SHA="${ACTIVE_SHA}" \
  GUARD_MARKER_FILE="${marker_file}" \
  bash "${SCRIPT}" 2>&1
}

guard_was_passed() {
  local marker_file="$1"
  [[ -s "${marker_file}" ]]
}

failures=0
ok() { echo "OK: $1"; }
bad() { echo "FAILED: $1" >&2; failures=$((failures + 1)); }

# ── (1) receipt exists + previous source has NO M11 folder -> reject ───────
home1="${TEST_ROOT}/home1"; mkdir -p "${home1}"
state1="$(setup_env "${home1}" true false)"
marker1="${TEST_ROOT}/marker1"
out1="$(run_rollback "${home1}" "${state1}" "${marker1}")" && rc1=0 || rc1=$?
if [[ "${rc1}" -ne 0 && "${out1}" == *"Refusing"*"predates the M11 migration"* ]]; then
  ok "receipt present + previous lacks M11 -> rollback refused (rc=${rc1})"
else
  bad "receipt present + previous lacks M11 -> expected refusal, got rc=${rc1}: ${out1}"
fi
if guard_was_passed "${marker1}"; then
  bad "rejection case reached the post-guard docker compose config call -- the guard did not actually stop the script before any side effect"
fi

# ── (2) receipt exists + previous source DOES have M11 -> guard does not
#        block (execution proceeds past the guard into the real machinery) ─
home2="${TEST_ROOT}/home2"; mkdir -p "${home2}"
state2="$(setup_env "${home2}" true true)"
marker2="${TEST_ROOT}/marker2"
out2="$(run_rollback "${home2}" "${state2}" "${marker2}")" && rc2=0 || rc2=$?
if guard_was_passed "${marker2}"; then
  ok "receipt present + previous ships M11 -> guard does not block (reached past the guard)"
else
  bad "receipt present + previous ships M11 -> expected the guard to pass through, got rc=${rc2}: ${out2}"
fi

# ── (3) no transition receipt anywhere -> guard is a no-op regardless of
#        the previous release's M11 folder (ordinary, non-Task168 rollback) ─
home3="${TEST_ROOT}/home3"; mkdir -p "${home3}"
state3="$(setup_env "${home3}" false false)"
marker3="${TEST_ROOT}/marker3"
out3="$(run_rollback "${home3}" "${state3}" "${marker3}")" && rc3=0 || rc3=$?
if guard_was_passed "${marker3}"; then
  ok "no transition receipt anywhere -> guard is a no-op (reached past the guard) regardless of M11 folder"
else
  bad "no transition receipt anywhere -> expected the guard to pass through, got rc=${rc3}: ${out3}"
fi

if [[ "${failures}" -ne 0 ]]; then
  echo "[task168-prod-rollback-guard] FAILED: ${failures} case(s)" >&2
  exit 1
fi
echo "[task168-prod-rollback-guard] passed"

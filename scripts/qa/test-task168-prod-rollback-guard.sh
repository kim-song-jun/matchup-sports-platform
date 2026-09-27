#!/usr/bin/env bash
# deploy/rollback-prod.sh must refuse a rollback when ALL THREE hold: (a) a
# Task168 Stage A transition receipt exists, (b) the ledger shows M11 as a
# finished row, (c) the rollback TARGET's stored source predates M11 -- and
# must get past the guard otherwise (no receipt: ledger never queried; M11
# not applied; target source carries M11). A failing ledger query refuses.
#
# Runs the real rollback-prod.sh with sudo/aws/docker/flock faked. The
# "got past the guard" marker is a FILE written by the first image pull
# (pull_release_images runs right after the guard). The fake compose refuses
# `run v1_api` while V1_API_IMAGE is empty, as real compose does -- that
# pins the guard after load_prod_release_manifest.

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly SCRIPT="${ROOT_DIR}/deploy/rollback-prod.sh"
[[ -f "${SCRIPT}" ]] || { echo "deploy/rollback-prod.sh is missing" >&2; exit 1; }

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
chmod +x "${mock_bin}/sudo" "${mock_bin}/flock" "${mock_bin}/aws"

ledger_calls_log="${TEST_ROOT}/ledger-calls.log"

# $1: fake finished-M11-count the ledger psql query reports ("0" or "1"+).
# $2: "fail" makes that same docker run (the psql query) exit nonzero
#     instead, simulating an unreadable ledger.
# Dispatches on docker's OWN first arg: `compose` for everything routed
# through the `compose` array (DB-URL fetch, resolve_compose_binary's probe,
# assert_compose_variables_resolve's `config` call), vs `network`/
# `run`/`login` for the guard's OWN bare `sudo docker ...` calls.
write_fake_docker() {
  local m11_count="$1" should_fail="$2"
  cat > "${mock_bin}/docker" <<FAKE
#!/bin/sh
case "\$1" in
  login)
    cat >/dev/null
    exit 0
    ;;
  pull)
    : "\${GUARD_MARKER_FILE:?}"
    echo reached >> "\${GUARD_MARKER_FILE}"
    exit 0
    ;;
  network)
    printf 'network\n' >> "${ledger_calls_log}"
    echo deploy_default
    exit 0
    ;;
  run)
    printf 'run\n' >> "${ledger_calls_log}"
    if [ "${should_fail}" = fail ]; then
      echo "fake psql failure injected by test" >&2
      exit 1
    fi
    echo "${m11_count}"
    exit 0
    ;;
  compose)
    shift
    case "\$*" in
      version) exit 0 ;;
      *'run --rm --no-deps -T v1_api sh -c printf "%s" "\$DATABASE_URL"')
        # Real compose cannot resolve the v1_api service without its image.
        [ -n "\${V1_API_IMAGE:-}" ] || { echo "fake compose: V1_API_IMAGE is empty" >&2; exit 94; }
        echo fake-db-url
        exit 0
        ;;
      *' config') exit 0 ;;
      *)
        echo "unexpected docker compose invocation: \$*" >&2
        exit 93
        ;;
    esac
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

# Builds a fresh HOME with: .env, docker-compose.prod.yml stub, a state.json
# whose active manifest declares rollbackCompatibleWith = PREVIOUS_SHA (so the
# compatibility + stale-active checks both pass), and (optionally) a task168
# transition receipt. PREVIOUS_TARGET_SOURCE (none|no-m11|has-m11, default
# none) controls the rollback TARGET's (PREVIOUS_SHA's) own stored source
# tree -- fix round 3, Critical H1: condition (3) of the guard, restored.
setup_env() {
  local home="$1" with_receipt="$2" previous_target_source="${3:-none}"
  local live="${home}/teameet"
  mkdir -p "${live}/deploy"
  # prod-task168-common.sh is a sibling prod-release-common.sh now sources
  # too (fix round 3, state-root unification) -- must be copied alongside or
  # that source line fails before rollback-prod.sh's own logic ever runs.
  cp "${ROOT_DIR}/deploy/prod-release-common.sh" "${ROOT_DIR}/deploy/prod-source-common.sh" \
    "${ROOT_DIR}/deploy/prod-manifest-common.sh" "${ROOT_DIR}/deploy/prod-task168-common.sh" "${live}/deploy/"
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

  # Neither manifest carries database.task168, so validate_stored_prod_manifest's
  # optional source_dir comparison is a no-op regardless of what these hold.
  mkdir -p "${state_dir}/sources/${ACTIVE_SHA}"
  case "${previous_target_source}" in
    none) : ;; # ${state_dir}/sources/${PREVIOUS_SHA} is simply never created
    no-m11)
      install -d -m 700 "${state_dir}/sources/${PREVIOUS_SHA}/apps/v1_api/prisma/migrations"
      ;;
    has-m11)
      install -d -m 700 "${state_dir}/sources/${PREVIOUS_SHA}/apps/v1_api/prisma/migrations/20260911090000_retire_tournament_fixture_tables"
      ;;
    *) echo "setup_env: unknown previous_target_source '${previous_target_source}'" >&2; exit 1 ;;
  esac

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

# ── (1) receipt exists + ledger M11 NOT applied -> guard passes through ────
write_fake_docker 0 no
: > "${ledger_calls_log}"
home1="${TEST_ROOT}/home1"; mkdir -p "${home1}"
state1="$(setup_env "${home1}" true)"
marker1="${TEST_ROOT}/marker1"
out1="$(run_rollback "${home1}" "${state1}" "${marker1}")" && rc1=0 || rc1=$?
if guard_was_passed "${marker1}"; then
  ok "receipt present + ledger M11 not applied -> guard passes (reached past the guard)"
else
  bad "receipt present + ledger M11 not applied -> expected the guard to pass through, got rc=${rc1}: ${out1}"
fi

# ── (2a) receipt + ledger M11 applied + rollback target's source never
#         captured/pruned -> refused (fail-closed, cannot verify) ──────────
write_fake_docker 1 no
: > "${ledger_calls_log}"
home2a="${TEST_ROOT}/home2a"; mkdir -p "${home2a}"
state2a="$(setup_env "${home2a}" true none)"
marker2a="${TEST_ROOT}/marker2a"
out2a="$(run_rollback "${home2a}" "${state2a}" "${marker2a}")" && rc2a=0 || rc2a=$?
if [[ "${rc2a}" -ne 0 && "${out2a}" == *"M11 already applied"*"no longer retained"* ]]; then
  ok "receipt + ledger M11 applied + rollback target source not retained -> refused fail-closed"
else
  bad "receipt + ledger M11 applied + rollback target source not retained -> expected refusal, got rc=${rc2a}: ${out2a}"
fi
if guard_was_passed "${marker2a}"; then
  bad "target-source-missing case reached the post-guard image pull"
fi

# ── (2b) receipt + ledger M11 applied + rollback target's source EXISTS but
#         predates M11 -> refused (Critical H1's condition 3, restored) ────
write_fake_docker 1 no
: > "${ledger_calls_log}"
home2b="${TEST_ROOT}/home2b"; mkdir -p "${home2b}"
state2b="$(setup_env "${home2b}" true no-m11)"
marker2b="${TEST_ROOT}/marker2b"
out2b="$(run_rollback "${home2b}" "${state2b}" "${marker2b}")" && rc2b=0 || rc2b=$?
if [[ "${rc2b}" -ne 0 && "${out2b}" == *"M11 already applied"*"predates the M11 migration"* ]]; then
  ok "receipt + ledger M11 applied + rollback target source predates M11 -> refused"
else
  bad "receipt + ledger M11 applied + rollback target source predates M11 -> expected refusal, got rc=${rc2b}: ${out2b}"
fi
if guard_was_passed "${marker2b}"; then
  bad "target-source-predates-M11 case reached the post-guard image pull"
fi

# ── (2c) receipt + ledger M11 applied + rollback target's source ALREADY
#         carries M11 -- Critical H1: this must now PASS (round 2 wrongly
#         refused it, having dropped this check entirely) ──────────────────
write_fake_docker 1 no
: > "${ledger_calls_log}"
home2c="${TEST_ROOT}/home2c"; mkdir -p "${home2c}"
state2c="$(setup_env "${home2c}" true has-m11)"
marker2c="${TEST_ROOT}/marker2c"
out2c="$(run_rollback "${home2c}" "${state2c}" "${marker2c}")" && rc2c=0 || rc2c=$?
if guard_was_passed "${marker2c}"; then
  ok "receipt + ledger M11 applied + rollback target source already carries M11 -> guard does not block (reached past the guard)"
else
  bad "receipt + ledger M11 applied + rollback target source already carries M11 -> expected the guard to pass through, got rc=${rc2c}: ${out2c}"
fi

# ── (3) receipt exists + ledger query itself fails -> refused, fail-closed ─
write_fake_docker 0 fail
: > "${ledger_calls_log}"
home3="${TEST_ROOT}/home3"; mkdir -p "${home3}"
state3="$(setup_env "${home3}" true)"
marker3="${TEST_ROOT}/marker3"
out3="$(run_rollback "${home3}" "${state3}" "${marker3}")" && rc3=0 || rc3=$?
if [[ "${rc3}" -ne 0 && "${out3}" == *"could not query the migration ledger"* ]]; then
  ok "receipt present + ledger query fails -> refused fail-closed (rc=${rc3}), reason asserted"
else
  bad "receipt present + ledger query fails -> expected a fail-closed refusal with a diagnosable reason, got rc=${rc3}: ${out3}"
fi
if guard_was_passed "${marker3}"; then
  bad "query-failure case reached the post-guard image pull -- fail-closed did not hold"
fi

# ── (4) no transition receipt anywhere -> guard is a no-op, ledger never
#        queried (would refuse if queried -- proves the short-circuit) ─────
write_fake_docker 1 no
: > "${ledger_calls_log}"
home4="${TEST_ROOT}/home4"; mkdir -p "${home4}"
state4="$(setup_env "${home4}" false)"
marker4="${TEST_ROOT}/marker4"
out4="$(run_rollback "${home4}" "${state4}" "${marker4}")" && rc4=0 || rc4=$?
if guard_was_passed "${marker4}"; then
  ok "no transition receipt anywhere -> guard is a no-op (reached past the guard)"
else
  bad "no transition receipt anywhere -> expected the guard to pass through, got rc=${rc4}: ${out4}"
fi
if [[ -s "${ledger_calls_log}" ]]; then
  bad "no transition receipt anywhere -> the ledger was queried anyway (should short-circuit before any DB round-trip): $(cat "${ledger_calls_log}")"
else
  ok "no transition receipt anywhere -> the ledger was never queried"
fi

if [[ "${failures}" -ne 0 ]]; then
  echo "[task168-prod-rollback-guard] FAILED: ${failures} case(s)" >&2
  exit 1
fi
echo "[task168-prod-rollback-guard] passed"

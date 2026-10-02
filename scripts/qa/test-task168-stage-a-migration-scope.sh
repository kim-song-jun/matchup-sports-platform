#!/usr/bin/env bash
# Task 175 Task 4 fix round 1, Ruling R9: with C2 (Stage A and Stage B share
# the SAME dev source tree), PROD_SOURCE_DIR legitimately carries the M11
# folder during Stage A too, so deploy/prod-task168.sh no longer rejects on
# its mere presence (removed in this fix round). The real safety invariant
# is that _stage_a_run_migrations() (deploy/prod-task168.sh) builds its OWN
# throwaway migration tree by copying named folders one at a time and never
# calls copy_migration for M11 (or anything after M10) -- regardless of
# what the real source tree contains. This test locks that invariant against
# the REAL function (not a re-implementation of its copy logic), using a
# fixture source tree that DOES contain M11 (and one post-M11 decoy) so a
# regression that started copying it would be caught.
#
# _stage_a_run_migrations's temp dir is deleted by its own `trap ... EXIT`
# before the function returns, so this cannot inspect it after the call --
# instead a fake `docker` (the last thing the function invokes, mounting the
# temp dir read-write) records the temp dir's own migrations/ listing to a
# result file BEFORE the subshell exits and its trap fires.

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

export PROD_HOME_DIR="${TEST_ROOT}/home"
source "${ROOT_DIR}/deploy/prod-task168-common.sh"
source "${ROOT_DIR}/deploy/prod-task168.sh"

readonly M11_NAME=20260911090000_retire_tournament_fixture_tables
readonly PRE_M1_NAME=20260101000000_some_old_migration
readonly POST_M11_DECOY=20261231000000_a_migration_after_m11

source_dir="${TEST_ROOT}/source"
mkdir -p "${source_dir}/apps/v1_api/prisma/migrations"
printf 'provider = "postgresql"\n' > "${source_dir}/apps/v1_api/prisma/migrations/migration_lock.toml"
printf 'datasource db {}\n' > "${source_dir}/apps/v1_api/prisma/schema.prisma"
for name in "${PRE_M1_NAME}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" \
  "${PROD_TASK168_M10}" "${M11_NAME}" "${POST_M11_DECOY}"; do
  mkdir -p "${source_dir}/apps/v1_api/prisma/migrations/${name}"
  printf -- '-- fixture\n' > "${source_dir}/apps/v1_api/prisma/migrations/${name}/migration.sql"
done

mock_bin="${TEST_ROOT}/bin"
mkdir -p "${mock_bin}"
cat > "${mock_bin}/fakedocker" <<'FAKE'
#!/bin/sh
case "$1" in
  network)
    echo "${PROD_TASK168_DB_NETWORK}"
    exit 0
    ;;
  run)
    prev=""
    tmp_path=""
    for arg in "$@"; do
      if [ "$prev" = "-v" ]; then
        tmp_path="${arg%%:*}"
      fi
      prev="$arg"
    done
    [ -n "${tmp_path}" ] || { echo "fakedocker: no -v mount found in: $*" >&2; exit 90; }
    cat >/dev/null # consume the --env-file /dev/stdin payload
    find "${tmp_path}/migrations" -mindepth 1 -maxdepth 1 -type d -exec basename '{}' \; | LC_ALL=C sort > "${RESULT_FILE}"
    exit 0
    ;;
  *)
    echo "fakedocker: unrecognized invocation: $*" >&2
    exit 91
    ;;
esac
FAKE
chmod +x "${mock_bin}/fakedocker"

export PROD_SOURCE_DIR="${source_dir}"
export PROD_TASK168_DOCKER="${mock_bin}/fakedocker"
export PROD_TASK168_DATABASE_URL="postgresql://fake/fake"
# fakedocker is a genuinely separate process (exec'd via _prod_task168_docker_argv,
# not a subshell fork), so it only sees EXPORTED vars -- prod-task168-common.sh
# assigns this one as a plain (non-exported) global.
export PROD_TASK168_DB_NETWORK

failures=0
ok() { echo "OK: $1"; }
bad() { echo "FAILED: $1" >&2; failures=$((failures + 1)); }

assert_scope() {
  local phase="$1" result_file="$2" expected_csv="$3" actual
  actual="$(paste -sd, "${result_file}" 2>/dev/null || true)"
  if [[ "${actual}" == "${expected_csv}" ]]; then
    ok "phase=${phase}: temp migration tree is exactly {${expected_csv}}"
  else
    bad "phase=${phase}: expected {${expected_csv}}, got {${actual}}"
  fi
  if grep -qx "${M11_NAME}" "${result_file}" 2>/dev/null; then
    bad "phase=${phase}: M11 was copied into the throwaway migration tree"
  fi
  if grep -qx "${POST_M11_DECOY}" "${result_file}" 2>/dev/null; then
    bad "phase=${phase}: a post-M11 migration was copied into the throwaway migration tree"
  fi
}

expected_pre="$(printf '%s\n' "${PRE_M1_NAME}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M10}" | LC_ALL=C sort | paste -sd, -)"
expected_post="$(printf '%s\n' "${PRE_M1_NAME}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}" | LC_ALL=C sort | paste -sd, -)"

RESULT_FILE="${TEST_ROOT}/pre-scope.txt"
export RESULT_FILE
_stage_a_run_migrations pre "fake-api-image:latest"
assert_scope pre "${RESULT_FILE}" "${expected_pre}"

RESULT_FILE="${TEST_ROOT}/post-scope.txt"
export RESULT_FILE
_stage_a_run_migrations post "fake-api-image:latest"
assert_scope post "${RESULT_FILE}" "${expected_post}"

if [[ "${failures}" -ne 0 ]]; then
  echo "[task168-stage-a-migration-scope] FAILED: ${failures} case(s)" >&2
  exit 1
fi
echo "[task168-stage-a-migration-scope] passed"

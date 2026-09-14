#!/usr/bin/env bash
# Real-Postgres regression test for deploy/task168-final-steady-migrate.sh's
# --check-only mode. scripts/qa/test-task168-final-steady.sh and
# scripts/qa/test-task168-alpha-steady-wiring.sh both fake
# `docker compose ... exec v1_postgres psql` and hand the script hardcoded
# 't'/'f' tokens for the finished_at/rolled_back_at/table-exists booleans --
# a fake-only suite cannot catch a mismatch between what those fakes hand
# back and what Postgres actually returns for the SQL that produces them.
# That mismatch happened for real once: `(finished_at IS NOT NULL)::text`
# returns 'true'/'false' on Postgres, not the 't'/'f' the fakes always fed
# the script, so `[[ "${finished}" == t ]]` never matched and every real
# deploy failed L2 while both fake-only suites stayed green.
#
# This test runs the real script's --check-only mode, unmodified, against a
# real Postgres database that already has the actual current migration chain
# applied via `prisma migrate deploy` -- the same database the API job's "V1
# migration replay + drift gate" step (deploy.yml) just built -- through a
# thin `docker` shim that forwards `compose ... exec v1_postgres psql` calls
# to a direct `psql` connection instead of a container.
#
# Requires: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE naming a database
# with the repo's current full migration chain already applied, and `psql`
# on PATH.
set -Eeuo pipefail

: "${PGHOST:?PGHOST is required (a live Postgres with the current migration chain applied)}"
: "${PGPORT:?PGPORT is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${PGDATABASE:?PGDATABASE is required}"
command -v psql >/dev/null 2>&1 || { echo "psql is required on PATH" >&2; exit 1; }

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly SCRIPT="${ROOT_DIR}/deploy/task168-final-steady-migrate.sh"
readonly M11_NAME=20260911090000_retire_tournament_fixture_tables
readonly M11_SOURCE="${ROOT_DIR}/apps/v1_api/prisma/migrations/${M11_NAME}/migration.sql"
readonly M11_SHA=08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323

[[ -s "${M11_SOURCE}" ]] || { echo "fixture setup: M11 migration.sql is missing" >&2; exit 1; }
[[ "$(sha256sum "${M11_SOURCE}" | awk '{print $1}')" == "${M11_SHA}" ]] || {
  echo "fixture setup: M11 migration.sql does not match the pinned checksum" >&2
  exit 1
}

readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

# ── fake docker: forward "... exec -T v1_postgres psql <args>" to a direct
#    `psql <args>` against the real, already-migrated database (PGHOST/etc
#    below) instead of a container -- the whole point of this file is a
#    REAL Postgres backing the script's queries, not another fake one.
mock_bin="${TEST_ROOT}/mockbin"
mkdir -p "${mock_bin}"
cat > "${mock_bin}/docker" <<'DOCKEREOF'
#!/usr/bin/env bash
set -Eeuo pipefail
args=("$@")
psql_idx=-1
for i in "${!args[@]}"; do
  [[ "${args[$i]}" == psql ]] && { psql_idx=$i; break; }
done
[[ "${psql_idx}" -ge 0 ]] || { echo "fake docker: unrecognized invocation: $*" >&2; exit 1; }
exec psql "${args[@]:$((psql_idx+1))}"
DOCKEREOF
chmod +x "${mock_bin}/docker"
export PATH="${mock_bin}:${PATH}"
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
export V1_DB_USER="${PGUSER}" V1_DB_NAME="${PGDATABASE}"

: > "${TEST_ROOT}/compose-prod.yml"
: > "${TEST_ROOT}/compose-alpha.yml"
: > "${TEST_ROOT}/env-file"

# ── StageB receipt bound to THIS live database's real identity ─────────────
db_id="$(psql -At -c "SELECT current_database() || '|' || current_user || '|' || COALESCE(inet_server_addr()::text,'local') || '|' || COALESCE(inet_server_port()::text,'local')")"
state_dir="${TEST_ROOT}/state/task168/1111111111111111111111111111111111111111"
mkdir -p "${state_dir}"
# A fresh `prisma migrate deploy` replay (the "V1 migration replay + drift
# gate" step this test rides on) never leaves a resolved (finished_at NULL,
# rolled_back_at NOT NULL) row, so the manifest's resolved-attempt snapshot
# is the sha256 of an empty string -- same value
# deploy/task168-final-steady-migrate.sh computes when the live query
# returns no rows.
empty_resolved_sha="$(printf '%s' '' | sha256sum | awk '{print $1}')"
manifest_path="${state_dir}/manifest.json"
cat > "${manifest_path}" <<EOF
{"database":{"task168":{"resolvedMigrationAttemptsSha256":"${empty_resolved_sha}"}}}
EOF
manifest_sha="$(sha256sum "${manifest_path}" | awk '{print $1}')"
cat > "${state_dir}/migration-stage.json" <<EOF
{"schemaVersion":1,"kind":"task168StageBMigration","status":"MIGRATION_COMMITTED","stage":"stageBFinal","releaseSha":"1111111111111111111111111111111111111111","databaseIdentity":"${db_id}","m11Sha256":"${M11_SHA}","manifest":"${manifest_path}","manifestSha256":"${manifest_sha}","completedAt":"2026-09-14T00:00:00Z"}
EOF
migration_receipt_sha="$(sha256sum "${state_dir}/migration-stage.json" | awk '{print $1}')"
cat > "${state_dir}/runtime-verification.json" <<EOF
{"schemaVersion":1,"kind":"task168StageBRuntimeVerification","migrationReceiptSha256":"${migration_receipt_sha}","ledgerCount":11,"completedAt":"2026-09-14T00:05:00Z"}
EOF
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/state"

set +e
output="$(bash "${SCRIPT}" --check-only --source-dir "${ROOT_DIR}" \
  --compose-prod "${TEST_ROOT}/compose-prod.yml" --compose-alpha "${TEST_ROOT}/compose-alpha.yml" \
  --env-file "${TEST_ROOT}/env-file" 2>&1)"
rc=$?
set -e

echo "${output}"
if [[ "${rc}" -ne 0 ]]; then
  echo "[task168-final-steady-real-db] FAILED: --check-only rejected a genuinely fully-migrated, real Postgres database (rc=${rc})" >&2
  exit 1
fi
[[ "${output}" == *'check-only passed: StageB receipts present and bound to this database'* ]] || {
  echo "[task168-final-steady-real-db] FAILED: exit 0 but the expected pass message is missing" >&2
  exit 1
}
echo "[task168-final-steady-real-db] passed: --check-only accepted the real, fully-migrated database"

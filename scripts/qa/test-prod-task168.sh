#!/usr/bin/env bash
# Real tests for deploy/prod-task168-common.sh and deploy/prod-task168.sh
# (Task 175 Task 1-3): the production Task168 Stage A/B transition runner.
#
# Same docker-shim convention as scripts/qa/test-task168-prod-guard.sh: fakes
# `docker` as a real executable on PATH (so `"${_PROD_TASK168_DOCKER_ARGV[@]}"`
# calls are actually recorded, not skipped by a shell-function trick), and
# extracts SQL query TYPE (identity/ledger/seals/anomaly-guard) from the
# literal query text so a Python evaluator can answer from a per-scenario
# fixture instead of a real database.
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMMON_SH="${ROOT_DIR}/deploy/prod-task168-common.sh"
RUNNER_SH="${ROOT_DIR}/deploy/prod-task168.sh"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

failures=0
ok() { echo "OK: $*"; }
bad() { echo "FAILED: $*" >&2; failures=$((failures + 1)); }

[[ -f "${COMMON_SH}" && -f "${RUNNER_SH}" ]] || { echo "fixture setup: runner files missing" >&2; exit 1; }

# Pull the pinned migration-name constants straight from the runner under
# test so this file cannot drift from them independently.
source "${RUNNER_SH}"

[[ "${PROD_TASK168_M11_PINNED_SHA256}" == "$(sha256sum "${ROOT_DIR}/apps/v1_api/prisma/migrations/${PROD_TASK168_M11}/migration.sql" | awk '{print $1}')" ]] ||
  { echo "fixture setup: M11 migration.sql does not match the pinned checksum" >&2; exit 1; }

ALL_NAMES=("${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}" "${PROD_TASK168_M11}")

# ── fake `docker` as a real executable on PATH ──────────────────────────────
mock_bin="${TEST_ROOT}/mockbin"
mkdir -p "${mock_bin}"

SQL_EVAL="${TEST_ROOT}/eval_sql.py"
cat > "${SQL_EVAL}" <<'PYEOF'
import os, sys

def readfile(path, default=''):
    if path and os.path.exists(path):
        return open(path).read()
    return default

sql = sys.argv[1]
if 'pg_control_system' in sql:
    if os.environ.get('FAKE_IDENTITY_FULL_SHOULD_FAIL') == 'true':
        sys.stderr.write('permission denied for function pg_control_system\n')
        sys.exit(1)
    print(os.environ.get('FAKE_IDENTITY_FULL', ''), end='')
elif sql.strip() == "SELECT current_database() || '|' || current_user":
    print(os.environ.get('FAKE_IDENTITY_BASIC', ''), end='')
elif 'NOT (finished_at IS NOT NULL AND rolled_back_at IS NULL)' in sql:
    print(os.environ.get('FAKE_BAD_COUNT', '0'), end='')
elif sql.strip().startswith('SELECT count(*) FROM "_prisma_migrations" WHERE migration_name = \''):
    print(os.environ.get('FAKE_M11_PRESENT', '0'), end='')
elif 'pg_trigger' in sql:
    print(readfile(os.environ.get('FAKE_SEALS_FILE'), '0|0|0|0|0|0'), end='')
elif 'ORDER BY migration_name' in sql:
    print(readfile(os.environ.get('FAKE_LEDGER_FILE'), ''), end='')
else:
    sys.stderr.write('SQL_EVAL: unrecognized query: ' + sql + '\n')
    sys.exit(1)
PYEOF

cat > "${mock_bin}/docker" <<'DOCKEREOF'
#!/usr/bin/env bash
set -Eeuo pipefail
: "${CALL_LOG:?}"
printf '%s\n' "$*" >> "${CALL_LOG}"
# Real docker opens and reads --env-file's path itself (that is how the
# writer end of `--env-file <(printf ...)` process substitution gets
# unblocked -- a FIFO opened for writing blocks until some reader opens the
# other end). This fake must do the same or every prod_dbq-style call hangs
# forever on the process substitution, never reaching the case dispatch.
prev=''
for arg in "$@"; do
  [[ "${prev}" != '--env-file' ]] || cat "${arg}" > /dev/null
  prev="${arg}"
done
case "$*" in
  *'network ls --filter name=^deploy_default$ --format {{.Name}}'*)
    printf 'deploy_default'
    ;;
  *'postgres:16-alpine sh -c exec psql'*)
    if [[ "${PSQL_SHOULD_FAIL:-false}" == true ]]; then
      echo "fake docker: injected psql failure" >&2
      exit 1
    fi
    sql="${*: -1}"
    python3 "${SQL_EVAL}" "${sql}"
    ;;
  *'postgres:16-alpine sh -c exec pg_dump'*)
    if [[ "${PG_DUMP_SHOULD_FAIL:-false}" == true ]]; then
      echo "fake docker: injected pg_dump failure" >&2
      exit 1
    fi
    printf 'FAKE-DUMP-BYTES'
    ;;
  *'postgres:16-alpine pg_restore --list'*)
    if [[ "${PG_RESTORE_SHOULD_FAIL:-false}" == true ]]; then
      echo "fake docker: injected pg_restore failure" >&2
      exit 1
    fi
    echo '; fake archive TOC'
    ;;
  *"${API_IMAGE:-__no_api__} sh -c cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy --schema /tmp/task168/schema.prisma"*)
    printf 'MIGRATE_DEPLOY_CRAFTED\n' >> "${CALL_LOG}"
    [[ "${MIGRATE_CRAFTED_SHOULD_FAIL:-false}" != true ]] || { echo "fake docker: injected migrate failure" >&2; exit 1; }
    ;;
  *"${API_IMAGE:-__no_api__} sh -c cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy --schema /tmp/task168-prisma/schema.prisma"*)
    printf 'MIGRATE_DEPLOY_STAGE_B\n' >> "${CALL_LOG}"
    [[ "${MIGRATE_STAGE_B_SHOULD_FAIL:-false}" != true ]] || { echo "fake docker: injected M11 migrate failure" >&2; exit 1; }
    ;;
  *"${API_IMAGE:-__no_api__} sh -c cd /app/apps/v1_api && node dist/src/tournaments/migration/tournament-award-recipient-backfill.cli.js"*)
    printf 'BACKFILL_CALLED\n' >> "${CALL_LOG}"
    ;;
  *"${TOOL_IMAGE:-__no_tool__} --report"*)
    printf 'TOOL_CALLED\n' >> "${CALL_LOG}"
    exit "${TOOL_RC:-0}"
    ;;
  *)
    echo "fake docker: unrecognized invocation: $*" >&2
    exit 1
    ;;
esac
DOCKEREOF
chmod +x "${mock_bin}/docker"
export PATH="${mock_bin}:${PATH}"
export SQL_EVAL
export PROD_TASK168_DATABASE_URL='postgresql://produser:sekret@rds.example:5432/proddb'
export PROD_TASK168_DOCKER=docker

compose_mock() {
  printf 'compose %s\n' "$*" >> "${CALL_LOG}"
  case "$*" in
    'stop v1_api v1_game_operations_worker') return 0 ;;
    'ps -q v1_api') return 0 ;;
    'ps -q v1_game_operations_worker') return 0 ;;
    *) echo "compose_mock: unrecognized invocation: $*" >&2; return 1 ;;
  esac
}
export -f compose_mock

# run_case NEEDS_COMPOSE BODY -> sets CASE_OUTPUT, CASE_RC
run_case() {
  local needs_compose="$1" body="$2" wrapper="${TEST_ROOT}/wrapper.sh"
  {
    printf '#!/usr/bin/env bash\nset -Eeuo pipefail\n'
    printf 'source %q\n' "${RUNNER_SH}"
    [[ "${needs_compose}" != true ]] || printf 'compose=(compose_mock)\n'
    printf '%s\n' "${body}"
  } > "${wrapper}"
  set +e
  CASE_OUTPUT="$(bash "${wrapper}" 2>&1)"
  CASE_RC=$?
  set -e
}

# ═══════════════════════ Task 1: prod-task168-common.sh ═══════════════════

export CALL_LOG="${TEST_ROOT}/c-argv.log"; : > "${CALL_LOG}"
export FAKE_IDENTITY_BASIC='x'
run_case false 'prod_dbq "SELECT current_database() || '"'"'|'"'"' || current_user"'
if grep -qF -- '--env-file /dev/fd/' "${CALL_LOG}" && ! grep -qF 'sekret' "${CALL_LOG}" && ! grep -qF "${PROD_TASK168_DATABASE_URL}" "${CALL_LOG}"; then
  ok "prod_dbq: DATABASE_URL never appears in docker argv; --env-file /dev/fd/* present"
else
  bad "prod_dbq: expected --env-file /dev/fd/* and no URL/password in argv; log: $(cat "${CALL_LOG}")"
fi

export CALL_LOG="${TEST_ROOT}/c-psqlfail.log"; : > "${CALL_LOG}"
export PSQL_SHOULD_FAIL=true
run_case false 'prod_dbq "SELECT current_database() || '"'"'|'"'"' || current_user"'
unset PSQL_SHOULD_FAIL
if [[ "${CASE_RC}" -ne 0 ]]; then
  ok "prod_dbq: psql failure propagates as nonzero"
else
  bad "prod_dbq: psql failure did not propagate (rc=${CASE_RC})"
fi

run_case false 'p="'"${TEST_ROOT}"'/receipt-c3.json"
if prod_write_receipt "$p" "{\"a\":1}"; then echo WRITE1_OK; else echo WRITE1_FAIL; fi
if prod_write_receipt "$p" "{\"a\":1}"; then echo REWRITE_SAME_OK; else echo REWRITE_SAME_FAIL; fi
if prod_write_receipt "$p" "{\"a\":2}"; then echo REWRITE_DIFF_OK; else echo REWRITE_DIFF_FAIL; fi
[[ "$(stat -f%p "$p" 2>/dev/null || stat -c%a "$p")" == *600 ]] && echo PERM_600'
if grep -q WRITE1_OK <<< "${CASE_OUTPUT}" && grep -q REWRITE_SAME_OK <<< "${CASE_OUTPUT}" && grep -q REWRITE_DIFF_FAIL <<< "${CASE_OUTPUT}" && grep -q PERM_600 <<< "${CASE_OUTPUT}"; then
  ok "prod_write_receipt: idempotent on same content, refuses a differing rewrite, 0600"
else
  bad "prod_write_receipt: unexpected result: ${CASE_OUTPUT}"
fi

# R4: pg_control_system() unreadable -> falls back to a DATABASE_URL host:port
# component instead of failing outright.
export FAKE_IDENTITY_FULL_SHOULD_FAIL=true
export FAKE_IDENTITY_BASIC='proddb|produser'
run_case false 'prod_db_identity'
unset FAKE_IDENTITY_FULL_SHOULD_FAIL
expected_fallback="$(printf '%s|%s' 'proddb|produser' 'rds.example:5432' | sha256sum | awk '{print $1}')"
if [[ "${CASE_RC}" -eq 0 && "$(tr -d '\n' <<< "${CASE_OUTPUT}")" == "${expected_fallback}" ]]; then
  ok "prod_db_identity: falls back to host:port when pg_control_system() is unreadable"
else
  bad "prod_db_identity: expected fallback hash ${expected_fallback}, got rc=${CASE_RC} output=${CASE_OUTPUT}"
fi

# ═══════════════════════ shared fixtures for Task 2/3 ══════════════════════

FAKE_DIGEST_HEX="$(printf '0%.0s' {1..64})"
API_IMAGE_STAGE_A='test-api-image:stageA'
API_IMAGE_STAGE_B='test-api-image:stageB'
TOOL_IMAGE='test-tool-image:v1'

migrations_json_entries=()
for name in "${ALL_NAMES[@]}"; do
  sha="$(sha256sum "${ROOT_DIR}/apps/v1_api/prisma/migrations/${name}/migration.sql" | awk '{print $1}')"
  migrations_json_entries+=("$(jq -nc --arg n "${name}" --arg s "${sha}" '{name:$n,sha256:$s}')")
done
MIGRATIONS_JSON="$(printf '%s\n' "${migrations_json_entries[@]}" | jq -sc '.')"

write_manifest() {
  local path="$1" stage="$2" release_sha="$3" api_image="$4" include_tool="$5" images_json
  if [[ "${include_tool}" == true ]]; then
    images_json="$(jq -nc --arg api "${api_image}" --arg digest "sha256:${FAKE_DIGEST_HEX}" --arg tool "${TOOL_IMAGE}" \
      '{api:{repository:"x",digest:$digest,uri:$api},cutoverTool:{repository:"y",digest:$digest,uri:$tool}}')"
  else
    images_json="$(jq -nc --arg api "${api_image}" --arg digest "sha256:${FAKE_DIGEST_HEX}" \
      '{api:{repository:"x",digest:$digest,uri:$api}}')"
  fi
  jq -n --arg sha "${release_sha}" --arg stage "${stage}" --argjson images "${images_json}" --argjson migrations "${MIGRATIONS_JSON}" \
    '{release:{sha:$sha},images:$images,database:{task168:{stage:$stage,migrations:$migrations,rehearsal:{evidence:"rehearsal-note"}}}}' > "${path}"
}

MANIFEST_A="${TEST_ROOT}/manifest-stageA.json"
write_manifest "${MANIFEST_A}" stageA release-sha-a "${API_IMAGE_STAGE_A}" true
MANIFEST_B="${TEST_ROOT}/manifest-stageB.json"
write_manifest "${MANIFEST_B}" stageB release-sha-b "${API_IMAGE_STAGE_B}" false

build_fixture_source() {
  local dest="$1"; shift
  install -d "${dest}/apps/v1_api/prisma/migrations"
  cp "${ROOT_DIR}/apps/v1_api/prisma/schema.prisma" "${dest}/apps/v1_api/prisma/schema.prisma"
  cp "${ROOT_DIR}/apps/v1_api/prisma/migrations/migration_lock.toml" "${dest}/apps/v1_api/prisma/migrations/migration_lock.toml"
  local name
  for name in "$@"; do
    cp -R "${ROOT_DIR}/apps/v1_api/prisma/migrations/${name}" "${dest}/apps/v1_api/prisma/migrations/${name}"
  done
}
SOURCE_A_DIR="${TEST_ROOT}/source-a"
build_fixture_source "${SOURCE_A_DIR}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}"
SOURCE_B_DIR="${TEST_ROOT}/source-b"
build_fixture_source "${SOURCE_B_DIR}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}" "${PROD_TASK168_M11}"

ledger_row() {
  local name="$1" sha
  sha="$(sha256sum "${ROOT_DIR}/apps/v1_api/prisma/migrations/${name}/migration.sql" | awk '{print $1}')"
  printf '%s|%s\n' "${name}" "${sha}"
}
ledger_rows_for() { local name; for name in "$@"; do ledger_row "${name}"; done; }

LEDGER_EMPTY=""
LEDGER_M1_M8_M10="$(ledger_rows_for "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M10}")"
LEDGER_FULL10="$(ledger_rows_for "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}")"

# ═══════════════════ Task 2: Stage A state table (5 rows) ══════════════════

export PROD_MANIFEST_FILE="${MANIFEST_A}"
export API_IMAGE="${API_IMAGE_STAGE_A}"
export TOOL_IMAGE
export FAKE_BAD_COUNT=0
export FAKE_M11_PRESENT=0

test_state() {
  local desc="$1" ledger="$2" seals="$3" expected="$4"
  local ledger_file="${TEST_ROOT}/state-ledger.txt" seals_file="${TEST_ROOT}/state-seals.txt"
  printf '%s' "${ledger}" > "${ledger_file}"
  printf '%s' "${seals}" > "${seals_file}"
  export FAKE_LEDGER_FILE="${ledger_file}" FAKE_SEALS_FILE="${seals_file}"
  export CALL_LOG="${TEST_ROOT}/state-calls.log"; : > "${CALL_LOG}"
  run_case false 'task168_stage_a_state'
  if [[ "${CASE_RC}" -eq 0 && "$(tr -d '\n' <<< "${CASE_OUTPUT}")" == "${expected}" ]]; then
    ok "task168_stage_a_state(${desc}) == ${expected}"
  else
    bad "task168_stage_a_state(${desc}): expected '${expected}' rc0, got rc=${CASE_RC} output='${CASE_OUTPUT}'"
  fi
}

test_state "fresh"                 "${LEDGER_EMPTY}"     '0|0|0|0|0|0' fresh
test_state "precutover"            "${LEDGER_M1_M8_M10}" '0|0|0|0|0|0' precutover
test_state "committed"             "${LEDGER_M1_M8_M10}" '5|5|3|0|0|0' committed
test_state "complete"              "${LEDGER_FULL10}"    '5|5|3|0|0|0' complete
test_state "reject-partial-seals"  "${LEDGER_M1_M8_M10}" '3|2|1|0|0|0' reject

export FAKE_BAD_COUNT=1
test_state "reject-unresolved-row" "${LEDGER_M1_M8_M10}" '0|0|0|0|0|0' reject
export FAKE_BAD_COUNT=0
export FAKE_M11_PRESENT=1
test_state "reject-m11-already-applied" "${LEDGER_FULL10}" '5|5|3|0|0|0' reject
export FAKE_M11_PRESENT=0

# ══════════════ Task 2: Stage A safety branches (full orchestration) ═══════

seed_stage_a_receipts() {
  local sd="$1" db_id="$2"
  install -d -m 700 "${sd}/report"
  printf 'x' > "${sd}/backup.dump"
  jq -nc --arg release release-sha-a --arg api "${API_IMAGE_STAGE_A}" --arg db "${db_id}" \
    '{schemaVersion:1,kind:"quiesce",status:"COMPLETED",releaseSha:$release,apiImage:$api,databaseIdentity:$db,services:["v1_api","v1_game_operations_worker"],completedAt:"2026-01-01T00:00:00Z"}' \
    > "${sd}/quiesce.json"
  jq -nc --arg release release-sha-a --arg api "${API_IMAGE_STAGE_A}" --arg db "${db_id}" \
    --arg path "${sd}/backup.dump" --arg sha "$(sha256sum "${sd}/backup.dump" | awk '{print $1}')" \
    '{schemaVersion:1,kind:"backup",status:"COMPLETED",releaseSha:$release,apiImage:$api,databaseIdentity:$db,backupPath:$path,backupSha256:$sha,backupBytes:1,completedAt:"2026-01-01T00:00:00Z"}' \
    > "${sd}/backup.json"
  chmod 600 "${sd}/quiesce.json" "${sd}/backup.json" "${sd}/backup.dump"
}

export FAKE_IDENTITY_FULL='testdb|testuser|1234567890'
STAGE_A_DB_ID="$(printf '%s' "${FAKE_IDENTITY_FULL}" | sha256sum | awk '{print $1}')"
export PROD_SOURCE_DIR="${SOURCE_A_DIR}"

test_backup_guard() {
  local desc="$1" pg_dump_fail="$2" pg_restore_fail="$3"
  export PROD_TASK168_STATE_ROOT="${TEST_ROOT}/state-${desc}"
  printf '%s' "${LEDGER_EMPTY}" > "${TEST_ROOT}/ledger-${desc}.txt"
  printf '0|0|0|0|0|0' > "${TEST_ROOT}/seals-${desc}.txt"
  export FAKE_LEDGER_FILE="${TEST_ROOT}/ledger-${desc}.txt" FAKE_SEALS_FILE="${TEST_ROOT}/seals-${desc}.txt"
  export PG_DUMP_SHOULD_FAIL="${pg_dump_fail}" PG_RESTORE_SHOULD_FAIL="${pg_restore_fail}"
  export CALL_LOG="${TEST_ROOT}/calls-${desc}.log"; : > "${CALL_LOG}"
  run_case true 'task168_stage_a'
  local migrate_calls
  migrate_calls="$(grep -c 'MIGRATE_DEPLOY_CRAFTED' "${CALL_LOG}" || true)"
  if [[ "${CASE_RC}" -ne 0 && "${migrate_calls}" == 0 ]]; then
    ok "${desc}: refused before any migrate call (rc=${CASE_RC})"
  else
    bad "${desc}: expected refusal before migrate, rc=${CASE_RC} migrate_calls=${migrate_calls} output=${CASE_OUTPUT}"
  fi
}
test_backup_guard "pgdump-fail" true false
test_backup_guard "pgrestore-fail" false true
unset PG_DUMP_SHOULD_FAIL PG_RESTORE_SHOULD_FAIL

test_tool_reject_no_seals() {
  local sd="${TEST_ROOT}/state-tool-reject/release-sha-a"
  export PROD_TASK168_STATE_ROOT="${TEST_ROOT}/state-tool-reject"
  seed_stage_a_receipts "${sd}" "${STAGE_A_DB_ID}"
  printf '%s' "${LEDGER_M1_M8_M10}" > "${TEST_ROOT}/ledger-tool-reject.txt"
  printf '0|0|0|0|0|0' > "${TEST_ROOT}/seals-tool-reject.txt"
  export FAKE_LEDGER_FILE="${TEST_ROOT}/ledger-tool-reject.txt" FAKE_SEALS_FILE="${TEST_ROOT}/seals-tool-reject.txt"
  export TOOL_RC=1
  export CALL_LOG="${TEST_ROOT}/calls-tool-reject.log"; : > "${CALL_LOG}"
  run_case true 'task168_stage_a'
  unset TOOL_RC
  local tool_calls migrate_calls
  tool_calls="$(grep -c 'TOOL_CALLED' "${CALL_LOG}" || true)"
  migrate_calls="$(grep -c 'MIGRATE_DEPLOY_CRAFTED' "${CALL_LOG}" || true)"
  if [[ "${CASE_RC}" -ne 0 && "${tool_calls}" == 1 && "${migrate_calls}" == 0 ]]; then
    ok "tool-nonzero-no-seals: refused after exactly one tool call, no post-M9 migrate reached"
  else
    bad "tool-nonzero-no-seals: rc=${CASE_RC} tool_calls=${tool_calls} migrate_calls=${migrate_calls} output=${CASE_OUTPUT}"
  fi
}
test_tool_reject_no_seals

test_committed_resume_no_tool() {
  local sd="${TEST_ROOT}/state-committed/release-sha-a"
  export PROD_TASK168_STATE_ROOT="${TEST_ROOT}/state-committed"
  seed_stage_a_receipts "${sd}" "${STAGE_A_DB_ID}"
  printf '%s' "${LEDGER_M1_M8_M10}" > "${TEST_ROOT}/ledger-committed.txt"
  printf '5|5|3|0|0|0' > "${TEST_ROOT}/seals-committed.txt"
  export FAKE_LEDGER_FILE="${TEST_ROOT}/ledger-committed.txt" FAKE_SEALS_FILE="${TEST_ROOT}/seals-committed.txt"
  export CALL_LOG="${TEST_ROOT}/calls-committed.log"; : > "${CALL_LOG}"
  run_case true 'task168_stage_a'
  local tool_calls migrate_calls
  tool_calls="$(grep -c 'TOOL_CALLED' "${CALL_LOG}" || true)"
  migrate_calls="$(grep -c 'MIGRATE_DEPLOY_CRAFTED' "${CALL_LOG}" || true)"
  # The ledger fixture never advances to include M9 (no real DB behind this
  # test), so the post-migrate ledger assertion inside task168_stage_a is
  # expected to fail -- CASE_RC is deliberately not asserted as success here.
  # Review Focus #1's actual requirement is the call pattern below.
  if [[ "${tool_calls}" == 0 && "${migrate_calls}" == 1 ]]; then
    ok "committed-resume: tool not re-invoked, M9 migrate attempted exactly once"
  else
    bad "committed-resume: tool_calls=${tool_calls} migrate_calls=${migrate_calls} rc=${CASE_RC} output=${CASE_OUTPUT}"
  fi
}
test_committed_resume_no_tool

# ═══════════════════════ Task 3: Stage B refusal branches ══════════════════

export PROD_MANIFEST_FILE="${MANIFEST_B}"
export API_IMAGE="${API_IMAGE_STAGE_B}"
export PROD_SOURCE_DIR="${SOURCE_B_DIR}"
STAGE_B_DB_ID="$(printf '%s' "${FAKE_IDENTITY_FULL}" | sha256sum | awk '{print $1}')"

seed_stage_b_transition() {
  local sd="$1" transition_db_id="$2" tamper_receipt="${3:-false}"
  install -d -m 700 "${sd}/report"
  printf 'x' > "${sd}/backup.dump"
  echo '{}' > "${sd}/quiesce.json"; chmod 600 "${sd}/quiesce.json"
  echo '{}' > "${sd}/backup.json"; chmod 600 "${sd}/backup.json"
  local quiesce_sha backup_receipt_sha backup_file_sha
  quiesce_sha="$(sha256sum "${sd}/quiesce.json" | awk '{print $1}')"
  backup_receipt_sha="$(sha256sum "${sd}/backup.json" | awk '{print $1}')"
  backup_file_sha="$(sha256sum "${sd}/backup.dump" | awk '{print $1}')"
  [[ "${tamper_receipt}" != true ]] || quiesce_sha="deadbeef00000000000000000000000000000000000000000000000000dead"
  jq -n --arg db "${transition_db_id}" --arg qp "${sd}/quiesce.json" --arg qs "${quiesce_sha}" \
    --arg bp "${sd}/backup.json" --arg bs "${backup_receipt_sha}" \
    --arg bfp "${sd}/backup.dump" --arg bfs "${backup_file_sha}" \
    '{schemaVersion:1,kind:"transition",status:"COMPLETED",stage:"stageA",databaseIdentity:$db,quiesceReceipt:$qp,quiesceReceiptSha256:$qs,backupReceipt:$bp,backupReceiptSha256:$bs,backupPath:$bfp,backupSha256:$bfs}' \
    > "${sd}/transition.json"
  chmod 600 "${sd}/transition.json"
}

run_stage_b_reject_case() {
  local desc="$1"
  export CALL_LOG="${TEST_ROOT}/calls-b-${desc}.log"; : > "${CALL_LOG}"
  run_case false 'task168_stage_b'
  local migrate_calls
  migrate_calls="$(grep -c 'MIGRATE_DEPLOY_STAGE_B' "${CALL_LOG}" || true)"
  if [[ "${CASE_RC}" -ne 0 && "${migrate_calls}" == 0 ]]; then
    ok "stage-b-reject(${desc}): refused before the M11 migrate call"
  else
    bad "stage-b-reject(${desc}): rc=${CASE_RC} migrate_calls=${migrate_calls} output=${CASE_OUTPUT}"
  fi
}

printf '%s' "${LEDGER_FULL10}" > "${TEST_ROOT}/ledger-b.txt"
printf '5|5|3|0|0|0' > "${TEST_ROOT}/seals-b.txt"
export FAKE_LEDGER_FILE="${TEST_ROOT}/ledger-b.txt" FAKE_SEALS_FILE="${TEST_ROOT}/seals-b.txt"

# (1) no transition receipt at all
export PROD_TASK168_STATE_ROOT="${TEST_ROOT}/stateb-none"
install -d -m 700 "${PROD_TASK168_STATE_ROOT}"
run_stage_b_reject_case "no-receipt"

# (2) DB identity mismatch (receipt exists, but for a different database)
export PROD_TASK168_STATE_ROOT="${TEST_ROOT}/stateb-mismatch"
seed_stage_b_transition "${PROD_TASK168_STATE_ROOT}/release-sha-a" \
  "0000000000000000000000000000000000000000000000000000000000000000" false
run_stage_b_reject_case "identity-mismatch"

# (3) receipt tampered (bound sha256 no longer matches the referenced file)
export PROD_TASK168_STATE_ROOT="${TEST_ROOT}/stateb-tampered"
seed_stage_b_transition "${PROD_TASK168_STATE_ROOT}/release-sha-a" "${STAGE_B_DB_ID}" true
run_stage_b_reject_case "receipt-tampered"

# (4) M11 source checksum mismatch
export PROD_TASK168_STATE_ROOT="${TEST_ROOT}/stateb-m11tamper"
seed_stage_b_transition "${PROD_TASK168_STATE_ROOT}/release-sha-a" "${STAGE_B_DB_ID}" false
SOURCE_B_TAMPERED_DIR="${TEST_ROOT}/source-b-tampered"
build_fixture_source "${SOURCE_B_TAMPERED_DIR}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}" "${PROD_TASK168_M11}"
printf -- '-- tampered\nSELECT 1;\n' > "${SOURCE_B_TAMPERED_DIR}/apps/v1_api/prisma/migrations/${PROD_TASK168_M11}/migration.sql"
export PROD_SOURCE_DIR="${SOURCE_B_TAMPERED_DIR}"
run_stage_b_reject_case "m11-hash-mismatch"
export PROD_SOURCE_DIR="${SOURCE_B_DIR}"

# ═══════════════════════════════════════════════════════════════════════════

if [[ "${failures}" -ne 0 ]]; then
  echo "[test-prod-task168] FAILED: ${failures} scenario(s)" >&2
  exit 1
fi
echo "[test-prod-task168] all scenarios passed"

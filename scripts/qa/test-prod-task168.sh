#!/usr/bin/env bash
# Real tests for deploy/prod-task168-common.sh and deploy/prod-task168.sh
# (Task 175 Task 1-3, Fix round 1): the production Task168 Stage A/B
# transition runner.
#
# Same docker-shim convention as scripts/qa/test-task168-prod-guard.sh: fakes
# `docker` (and, for verify() coverage, `curl`) as real executables on PATH.
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

source "${RUNNER_SH}"

[[ "${PROD_TASK168_M11_PINNED_SHA256}" == "$(sha256sum "${ROOT_DIR}/apps/v1_api/prisma/migrations/${PROD_TASK168_M11}/migration.sql" | awk '{print $1}')" ]] ||
  { echo "fixture setup: M11 migration.sql does not match the pinned checksum" >&2; exit 1; }

ALL_NAMES=("${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}" "${PROD_TASK168_M11}")

# ── fake `docker` and `curl` as real executables on PATH ────────────────────
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
elif "migration_name < '" in sql and 'DISTINCT migration_name' in sql:
    print(os.environ.get('FAKE_PRE_M1_RESOLVED', '1'), end='')
elif "migration_name < '" in sql:
    print(os.environ.get('FAKE_PRE_M1_ANOMALOUS', '0'), end='')
elif 'NOT (finished_at IS NOT NULL AND rolled_back_at IS NULL)' in sql:
    print(os.environ.get('FAKE_BAD_COUNT', '0'), end='')
elif sql.strip().startswith('SELECT count(*) FROM "_prisma_migrations" WHERE migration_name = \''):
    print(os.environ.get('FAKE_M11_PRESENT', '0'), end='')
elif 'pg_trigger' in sql:
    print(readfile(os.environ.get('FAKE_SEALS_FILE'), '0|0|0|0|0|0'), end='')
elif 'ORDER BY migration_name' in sql:
    print(readfile(os.environ.get('FAKE_LEDGER_FILE'), ''), end='')
elif "tournament_id || '|' || team_match_id" in sql:
    print(os.environ.get('FAKE_MATCH_ROWS', ''), end='')
else:
    sys.stderr.write('SQL_EVAL: unrecognized query: ' + sql + '\n')
    sys.exit(1)
PYEOF

CURL_EVAL="${TEST_ROOT}/eval_curl.py"
cat > "${CURL_EVAL}" <<'PYEOF'
import json, os, re, sys

argv = sys.argv[1:]
url = argv[-1]

if '-w' in argv:
    code = os.environ.get('FAKE_DETAIL_CODE', '200')
    if '/matches/' in url:
        code = os.environ.get('FAKE_MATCH_DETAIL_CODE', code)
    print(code, end='')
    sys.exit(0)

m = re.search(r'cursor=([^&]*)', url)
cursor = m.group(1) if m else ''
pages_path = os.environ.get('FAKE_LIST_PAGES_FILE')
pages = json.load(open(pages_path)) if pages_path and os.path.exists(pages_path) else []
page = next((p for p in pages if p.get('cursor', '') == cursor), None)
if page is None:
    sys.stderr.write('fake curl: no page fixture for cursor=' + repr(cursor) + '\n')
    sys.exit(1)
if page.get('malformed'):
    print(json.dumps({"status": "success", "data": {"whatever": True}, "timestamp": "2026-01-01T00:00:00Z"}), end='')
    sys.exit(0)
body = {
    "status": "success",
    "data": {"items": page.get('items', []), "pageInfo": {"hasNext": page.get('hasNext', False), "nextCursor": page.get('nextCursor')}},
    "timestamp": "2026-01-01T00:00:00Z",
}
print(json.dumps(body), end='')
PYEOF

cat > "${mock_bin}/docker" <<'DOCKEREOF'
#!/usr/bin/env bash
set -Eeuo pipefail
: "${CALL_LOG:?}"
printf '%s\n' "$*" >> "${CALL_LOG}"
# Real docker opens and reads --env-file's path itself (that is how the
# writer end of a process-substitution feeding this command's stdin gets
# unblocked -- a FIFO opened for writing blocks until some reader opens the
# other end). This fake must do the same for /dev/stdin invocations or every
# prod_dbq/pg_dump/migrate call hangs forever.
if [[ "$*" == *'--env-file /dev/stdin'* ]]; then
  cat >/dev/null
fi
# Extract every `-v host:container[:ro]` value from the REAL positional argv
# (not the flattened "$*" string, which would mis-split a path containing a
# space) -- used to detect which migration phase a "craft" migrate call is
# (by checking for M9's folder in the mounted dir) and where the cutover
# tool/verify report should be written.
volumes=()
prev=''
for arg in "$@"; do
  [[ "${prev}" != '-v' ]] || volumes+=("${arg%%:*}")
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
    hostdir="${volumes[0]:-}"
    if [[ -n "${hostdir}" && -d "${hostdir}/migrations/${M9_NAME:-__no_m9__}" ]]; then
      [[ -z "${FAKE_LEDGER_AFTER_POST_FILE:-}" ]] || cp "${FAKE_LEDGER_AFTER_POST_FILE}" "${FAKE_LEDGER_FILE}"
    else
      [[ -z "${FAKE_LEDGER_AFTER_PRE_FILE:-}" ]] || cp "${FAKE_LEDGER_AFTER_PRE_FILE}" "${FAKE_LEDGER_FILE}"
    fi
    ;;
  *"${API_IMAGE:-__no_api__} sh -c cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy --schema /tmp/task168-prisma/schema.prisma"*)
    printf 'MIGRATE_DEPLOY_STAGE_B\n' >> "${CALL_LOG}"
    [[ "${MIGRATE_STAGE_B_SHOULD_FAIL:-false}" != true ]] || { echo "fake docker: injected M11 migrate failure" >&2; exit 1; }
    [[ -z "${FAKE_LEDGER_AFTER_M11_FILE:-}" ]] || cp "${FAKE_LEDGER_AFTER_M11_FILE}" "${FAKE_LEDGER_FILE}"
    ;;
  *"${API_IMAGE:-__no_api__} sh -c cd /app/apps/v1_api && node dist/src/tournaments/migration/tournament-award-recipient-backfill.cli.js"*)
    printf 'BACKFILL_CALLED\n' >> "${CALL_LOG}"
    [[ "${BACKFILL_SHOULD_FAIL:-false}" != true ]] || { echo "fake docker: injected backfill failure" >&2; exit 1; }
    ;;
  *"${TOOL_IMAGE:-__no_tool__} --report"*)
    printf 'TOOL_CALLED\n' >> "${CALL_LOG}"
    reportdir="${volumes[0]:-}"
    if [[ "${TOOL_RC:-0}" == 0 && -n "${reportdir}" && -n "${FAKE_TOOL_REPORT_FILE:-}" ]]; then
      mkdir -p "${reportdir}"
      cp "${FAKE_TOOL_REPORT_FILE}" "${reportdir}/cutover-report.json"
      [[ -z "${FAKE_SEALS_AFTER_TOOL_FILE:-}" ]] || cp "${FAKE_SEALS_AFTER_TOOL_FILE}" "${FAKE_SEALS_FILE}"
    fi
    exit "${TOOL_RC:-0}"
    ;;
  *)
    echo "fake docker: unrecognized invocation: $*" >&2
    exit 1
    ;;
esac
DOCKEREOF
chmod +x "${mock_bin}/docker"

cat > "${mock_bin}/curl" <<'CURLEOF'
#!/usr/bin/env bash
set -Eeuo pipefail
: "${CALL_LOG:?}"
printf 'curl %s\n' "$*" >> "${CALL_LOG}"
python3 "${CURL_EVAL:?}" "$@"
CURLEOF
chmod +x "${mock_bin}/curl"

# Captured before the PATH override below shadows `docker` with the fake --
# real_db_check() needs the genuine docker binary to reach promo_test_pg.
REAL_DOCKER="$(command -v docker || true)"

export PATH="${mock_bin}:${PATH}"
export SQL_EVAL CURL_EVAL
export M9_NAME="${PROD_TASK168_M9}"
export PROD_TASK168_DATABASE_URL='postgresql://produser:sekret@rds.example:5432/proddb'
export PROD_TASK168_DOCKER=docker

compose_mock() {
  printf 'compose %s\n' "$*" >> "${CALL_LOG}"
  case "$*" in
    'stop v1_api v1_game_operations_worker') return 0 ;;
    'ps -q v1_api'|'ps -q v1_game_operations_worker')
      if [[ "${COMPOSE_PS_SHOULD_FAIL:-false}" == true ]]; then
        echo "compose_mock: injected ps failure" >&2
        return 1
      fi
      return 0
      ;;
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

# assert_msg TEXT PATTERN -- Important 10: reject tests must assert on the
# stderr message, not merely the exit code.
assert_msg() {
  grep -qF -- "$2" <<< "$1"
}

# ═══════════════════════ Task 1: prod-task168-common.sh ═══════════════════

export CALL_LOG="${TEST_ROOT}/c-argv.log"; : > "${CALL_LOG}"
export FAKE_IDENTITY_BASIC='x'
run_case false 'prod_dbq "SELECT current_database() || '"'"'|'"'"' || current_user"'
if grep -qF -- '--env-file /dev/stdin' "${CALL_LOG}" && ! grep -qF 'sekret' "${CALL_LOG}" && ! grep -qF "${PROD_TASK168_DATABASE_URL}" "${CALL_LOG}"; then
  ok "prod_dbq: DATABASE_URL never appears in docker argv; --env-file /dev/stdin (survives sudo's closefrom on fd>=3, see Fix round 1 notes)"
else
  bad "prod_dbq: expected --env-file /dev/stdin and no URL/password in argv; log: $(cat "${CALL_LOG}")"
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

# Critical 1: every fixture source ships exactly one pre-M1 migration (a
# realistic baseline: real prod ships ~115) so `_assert_pre_m1_migrations_applied`
# has something to compare against by default; a dedicated test below
# overrides FAKE_PRE_M1_* to prove the guard actually rejects a bad baseline.
PRE_M1_NAME='20260101000000_pre_existing_migration'
build_fixture_source() {
  local dest="$1"; shift
  install -d "${dest}/apps/v1_api/prisma/migrations/${PRE_M1_NAME}"
  cp "${ROOT_DIR}/apps/v1_api/prisma/schema.prisma" "${dest}/apps/v1_api/prisma/schema.prisma"
  cp "${ROOT_DIR}/apps/v1_api/prisma/migrations/migration_lock.toml" "${dest}/apps/v1_api/prisma/migrations/migration_lock.toml"
  echo '-- pre-existing' > "${dest}/apps/v1_api/prisma/migrations/${PRE_M1_NAME}/migration.sql"
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
LEDGER_ALL11="$(ledger_rows_for "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}" "${PROD_TASK168_M11}")"

LEDGER_M1_M8_M10_FILE="${TEST_ROOT}/fixture-ledger-pre.txt"; printf '%s' "${LEDGER_M1_M8_M10}" > "${LEDGER_M1_M8_M10_FILE}"
LEDGER_FULL10_FILE="${TEST_ROOT}/fixture-ledger-full10.txt"; printf '%s' "${LEDGER_FULL10}" > "${LEDGER_FULL10_FILE}"
LEDGER_ALL11_FILE="${TEST_ROOT}/fixture-ledger-all11.txt"; printf '%s' "${LEDGER_ALL11}" > "${LEDGER_ALL11_FILE}"
SEALS_COMMITTED_FILE="${TEST_ROOT}/fixture-seals-committed.txt"; printf '5|5|3|0|0|0' > "${SEALS_COMMITTED_FILE}"
TOOL_REPORT_COMPLETED="${TEST_ROOT}/fixture-tool-report.json"
jq -n '{status:"COMPLETED",result:{verification:{remainingLegacyGameLinks:0,remainingLegacyStaffScopes:0,remainingLegacyAuditScopes:0}}}' > "${TOOL_REPORT_COMPLETED}"

export FAKE_PRE_M1_RESOLVED=1
export FAKE_PRE_M1_ANOMALOUS=0
export FAKE_BAD_COUNT=0
export FAKE_M11_PRESENT=0

# ═══════════════════ Task 2: Stage A state table (5 rows) ══════════════════

export PROD_MANIFEST_FILE="${MANIFEST_A}"
export API_IMAGE="${API_IMAGE_STAGE_A}"
export TOOL_IMAGE
export PROD_SOURCE_DIR="${SOURCE_A_DIR}"

test_state() {
  local desc="$1" ledger="$2" seals="$3" expected="$4"
  local ledger_file="${TEST_ROOT}/state-ledger.txt" seals_file="${TEST_ROOT}/state-seals.txt"
  printf '%s' "${ledger}" > "${ledger_file}"
  printf '%s' "${seals}" > "${seals_file}"
  export FAKE_LEDGER_FILE="${ledger_file}" FAKE_SEALS_FILE="${seals_file}"
  export CALL_LOG="${TEST_ROOT}/state-calls.log"; : > "${CALL_LOG}"
  run_case false 'task168_stage_a_state'
  # The last line, not the whole output squashed together -- a "reject"
  # verdict may be preceded by a diagnostic line explaining *why* (both go to
  # this combined stdout+stderr capture), and the state word itself is always
  # the final line task168_stage_a_state prints.
  if [[ "${CASE_RC}" -eq 0 && "$(tail -n1 <<< "${CASE_OUTPUT}")" == "${expected}" ]]; then
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

# Critical 1: a scoped comparison alone cannot see a missing/stuck migration
# from BEFORE M1 -- prove the new baseline check actually rejects. (A
# legitimately rolled-back pre-M1 row is NOT an anomaly -- real prod_pristine
# has 2 of them -- so this test specifically injects a STUCK row: neither
# finished nor rolled back.)
export FAKE_PRE_M1_ANOMALOUS=1
test_state "reject-pre-m1-stuck" "${LEDGER_EMPTY}" '0|0|0|0|0|0' reject
export FAKE_PRE_M1_ANOMALOUS=0
export FAKE_PRE_M1_RESOLVED=0
test_state "reject-pre-m1-missing" "${LEDGER_EMPTY}" '0|0|0|0|0|0' reject
export FAKE_PRE_M1_RESOLVED=1

# ══════════════ Real DB check (Critical 1's explicit requirement) ══════════
# Confirms task168_stage_a_state resolves to "fresh" against an ACTUAL PG16
# copy of the prod schema (never the pristine template itself).
real_db_check() {
  if [[ -z "${REAL_DOCKER}" ]] || ! "${REAL_DOCKER}" ps >/dev/null 2>&1; then
    echo "SKIP: real-DB check (docker not reachable in this environment)"
    return 0
  fi
  if ! "${REAL_DOCKER}" exec promo_test_pg psql -U postgres -At -c 'SELECT 1' >/dev/null 2>&1; then
    echo "SKIP: real-DB check (promo_test_pg container not running)"
    return 0
  fi
  local scratch_db="agent_task175_fixround1_$$"
  "${REAL_DOCKER}" exec promo_test_pg psql -U postgres -At -c "CREATE DATABASE ${scratch_db} TEMPLATE prod_pristine" >/dev/null 2>&1 || {
    echo "SKIP: real-DB check (could not create scratch db from prod_pristine)"
    return 0
  }
  # Build a synthetic PROD_SOURCE_DIR containing exactly the pre-M1 migration
  # folders THIS prod_pristine snapshot's own ledger resolved (applied or
  # cleanly rolled back). The current worktree's migrations folder has ~32
  # MORE pre-M1 entries than this snapshot (prod legitimately lags dev
  # between releases -- that gap is not what Critical 1's check exists to
  # catch), so comparing against the full current tree would fail for a
  # reason unrelated to this runner's own correctness.
  local resolved_names real_source
  resolved_names="$("${REAL_DOCKER}" exec promo_test_pg psql -U postgres -d "${scratch_db}" -At -c \
    "SELECT DISTINCT migration_name FROM \"_prisma_migrations\" WHERE migration_name < '${PROD_TASK168_M1[0]}' AND ((finished_at IS NOT NULL AND rolled_back_at IS NULL) OR (finished_at IS NULL AND rolled_back_at IS NOT NULL)) ORDER BY migration_name")"
  real_source="${TEST_ROOT}/real-db-source"
  install -d "${real_source}/apps/v1_api/prisma/migrations"
  local mname
  while IFS= read -r mname; do
    [[ -n "${mname}" && -d "${ROOT_DIR}/apps/v1_api/prisma/migrations/${mname}" ]] || continue
    cp -R "${ROOT_DIR}/apps/v1_api/prisma/migrations/${mname}" "${real_source}/apps/v1_api/prisma/migrations/${mname}"
  done <<< "${resolved_names}"
  echo "--- real DB check: task168_stage_a_state against a fresh prod_pristine copy (${scratch_db}, $(wc -l <<< "${resolved_names}" | tr -d ' ') pre-M1 migrations) ---"
  # promo_test_pg is on the default "bridge" network (there is no
  # "deploy_default" network on this host), which does not do container-name
  # DNS resolution -- reach it by its bridge IP on its INTERNAL port (5432,
  # not the host-mapped 5499) instead.
  local pg_ip real_out real_rc
  pg_ip="$("${REAL_DOCKER}" inspect promo_test_pg --format '{{.NetworkSettings.Networks.bridge.IPAddress}}')"
  real_out="$(PROD_TASK168_DATABASE_URL="postgresql://postgres:promo@${pg_ip}:5432/${scratch_db}" \
    PROD_TASK168_DOCKER="${REAL_DOCKER}" PROD_TASK168_DB_NETWORK=bridge PROD_SOURCE_DIR="${real_source}" \
    bash -c 'source '"${RUNNER_SH}"' && task168_stage_a_state' 2>&1)"
  real_rc=$?
  echo "task168_stage_a_state output: ${real_out} (rc=${real_rc})"
  "${REAL_DOCKER}" exec promo_test_pg psql -U postgres -At -c "DROP DATABASE IF EXISTS ${scratch_db}" >/dev/null 2>&1 || true
  if [[ "${real_rc}" -eq 0 && "$(tail -n1 <<< "${real_out}")" == fresh ]]; then
    ok "real-DB: task168_stage_a_state == fresh against a genuine prod_pristine copy"
  else
    bad "real-DB: expected fresh rc0 against prod_pristine copy, got rc=${real_rc} output='${real_out}'"
  fi
}
real_db_check

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
  if [[ "${CASE_RC}" -ne 0 && "${tool_calls}" == 1 && "${migrate_calls}" == 0 ]] && assert_msg "${CASE_OUTPUT}" 'no seals are present -- refusing'; then
    ok "tool-nonzero-no-seals: refused after exactly one tool call, no post-M9 migrate reached, message asserted"
  else
    bad "tool-nonzero-no-seals: rc=${CASE_RC} tool_calls=${tool_calls} migrate_calls=${migrate_calls} output=${CASE_OUTPUT}"
  fi
}
test_tool_reject_no_seals

test_tool_exit0_no_report_fails() {
  local sd="${TEST_ROOT}/state-tool-noreport/release-sha-a"
  export PROD_TASK168_STATE_ROOT="${TEST_ROOT}/state-tool-noreport"
  seed_stage_a_receipts "${sd}" "${STAGE_A_DB_ID}"
  printf '%s' "${LEDGER_M1_M8_M10}" > "${TEST_ROOT}/ledger-tool-noreport.txt"
  printf '0|0|0|0|0|0' > "${TEST_ROOT}/seals-tool-noreport.txt"
  export FAKE_LEDGER_FILE="${TEST_ROOT}/ledger-tool-noreport.txt" FAKE_SEALS_FILE="${TEST_ROOT}/seals-tool-noreport.txt"
  export TOOL_RC=0
  unset FAKE_TOOL_REPORT_FILE
  export CALL_LOG="${TEST_ROOT}/calls-tool-noreport.log"; : > "${CALL_LOG}"
  run_case true 'task168_stage_a'
  unset TOOL_RC
  if [[ "${CASE_RC}" -ne 0 ]] && assert_msg "${CASE_OUTPUT}" 'exited 0 but wrote no report file'; then
    ok "tool-exit0-no-report: Important 6 -- exit 0 with no report file is a failure, not a silent pass"
  else
    bad "tool-exit0-no-report: rc=${CASE_RC} output=${CASE_OUTPUT}"
  fi
}
test_tool_exit0_no_report_fails

test_committed_resume_no_tool() {
  local sd="${TEST_ROOT}/state-committed/release-sha-a"
  export PROD_TASK168_STATE_ROOT="${TEST_ROOT}/state-committed"
  seed_stage_a_receipts "${sd}" "${STAGE_A_DB_ID}"
  cp "${TOOL_REPORT_COMPLETED}" "${sd}/report/cutover-report.json"
  printf '%s' "${LEDGER_M1_M8_M10}" > "${TEST_ROOT}/ledger-committed.txt"
  printf '5|5|3|0|0|0' > "${TEST_ROOT}/seals-committed.txt"
  export FAKE_LEDGER_FILE="${TEST_ROOT}/ledger-committed.txt" FAKE_SEALS_FILE="${TEST_ROOT}/seals-committed.txt"
  export FAKE_LEDGER_AFTER_POST_FILE="${LEDGER_FULL10_FILE}"
  export CALL_LOG="${TEST_ROOT}/calls-committed.log"; : > "${CALL_LOG}"
  run_case true 'task168_stage_a'
  unset FAKE_LEDGER_AFTER_POST_FILE
  local tool_calls migrate_calls compose_stop_calls
  tool_calls="$(grep -c 'TOOL_CALLED' "${CALL_LOG}" || true)"
  migrate_calls="$(grep -c 'MIGRATE_DEPLOY_CRAFTED' "${CALL_LOG}" || true)"
  compose_stop_calls="$(grep -c 'compose stop v1_api v1_game_operations_worker' "${CALL_LOG}" || true)"
  if [[ "${CASE_RC}" -eq 0 && "${tool_calls}" == 0 && "${migrate_calls}" == 1 && "${compose_stop_calls}" -ge 1 ]]; then
    ok "committed-resume: tool not re-invoked, writers re-quiesced (Important 3), M9 migrate succeeded to a full green finish"
  else
    bad "committed-resume: tool_calls=${tool_calls} migrate_calls=${migrate_calls} compose_stop=${compose_stop_calls} rc=${CASE_RC} output=${CASE_OUTPUT}"
  fi
}
test_committed_resume_no_tool

# Important 4: a same-release retry after a transient backup failure must not
# be permanently blocked by prod_write_receipt's byte-identical requirement
# (the quiesce receipt from attempt 1 carries a timestamp attempt 2 cannot
# reproduce) -- and must need no manual cleanup between attempts.
test_backup_retry_after_failure() {
  export PROD_TASK168_STATE_ROOT="${TEST_ROOT}/state-backup-retry"
  printf '%s' "${LEDGER_EMPTY}" > "${TEST_ROOT}/ledger-backup-retry.txt"
  printf '0|0|0|0|0|0' > "${TEST_ROOT}/seals-backup-retry.txt"
  export FAKE_LEDGER_FILE="${TEST_ROOT}/ledger-backup-retry.txt" FAKE_SEALS_FILE="${TEST_ROOT}/seals-backup-retry.txt"

  export PG_DUMP_SHOULD_FAIL=true
  export CALL_LOG="${TEST_ROOT}/calls-backup-retry-1.log"; : > "${CALL_LOG}"
  run_case true 'task168_stage_a'
  local attempt1_rc="${CASE_RC}"
  unset PG_DUMP_SHOULD_FAIL

  export FAKE_LEDGER_AFTER_PRE_FILE="${LEDGER_M1_M8_M10_FILE}"
  export FAKE_LEDGER_AFTER_POST_FILE="${LEDGER_FULL10_FILE}"
  export FAKE_SEALS_AFTER_TOOL_FILE="${SEALS_COMMITTED_FILE}"
  export FAKE_TOOL_REPORT_FILE="${TOOL_REPORT_COMPLETED}"
  export TOOL_RC=0
  export CALL_LOG="${TEST_ROOT}/calls-backup-retry-2.log"; : > "${CALL_LOG}"
  run_case true 'task168_stage_a'
  local attempt2_rc="${CASE_RC}"
  unset FAKE_LEDGER_AFTER_PRE_FILE FAKE_LEDGER_AFTER_POST_FILE FAKE_SEALS_AFTER_TOOL_FILE FAKE_TOOL_REPORT_FILE TOOL_RC

  if [[ "${attempt1_rc}" -ne 0 && "${attempt2_rc}" -eq 0 ]]; then
    ok "backup-retry-after-failure: attempt1 refused (pg_dump failed), attempt2 (same release, no manual cleanup) reused the quiesce receipt and succeeded"
  else
    bad "backup-retry-after-failure: attempt1_rc=${attempt1_rc} attempt2_rc=${attempt2_rc} attempt2_output=${CASE_OUTPUT}"
  fi
}
test_backup_retry_after_failure

test_quiesce_fail_open_guard() {
  local sd="${TEST_ROOT}/quiesce-failopen"
  install -d -m 700 "${sd}"
  export CALL_LOG="${TEST_ROOT}/calls-quiesce-failopen.log"; : > "${CALL_LOG}"
  export COMPOSE_PS_SHOULD_FAIL=true
  run_case true "_stage_a_quiesce release-x api-x db-x '${sd}/quiesce.json'"
  unset COMPOSE_PS_SHOULD_FAIL
  if [[ "${CASE_RC}" -ne 0 ]] && assert_msg "${CASE_OUTPUT}" 'compose ps'; then
    ok "quiesce: a failing 'compose ps' is refused, not silently read as \"quiesced\" (Important 2 fail-open guard)"
  else
    bad "quiesce-fail-open: rc=${CASE_RC} output=${CASE_OUTPUT}"
  fi
}
test_quiesce_fail_open_guard

test_quiesce_receipt_reuse() {
  local sd="${TEST_ROOT}/quiesce-reuse"
  install -d -m 700 "${sd}"
  export CALL_LOG="${TEST_ROOT}/calls-quiesce-reuse.log"; : > "${CALL_LOG}"
  run_case true "_stage_a_quiesce release-x api-x db-x '${sd}/quiesce.json' || { echo FIRST_FAILED; exit 1; }
_stage_a_quiesce release-x api-x db-x '${sd}/quiesce.json'
echo SECOND_CALL_RC=\$?"
  if [[ "${CASE_RC}" -eq 0 ]] && grep -q 'SECOND_CALL_RC=0' <<< "${CASE_OUTPUT}"; then
    ok "quiesce: a second call with the identical binding reuses the receipt instead of colliding on its timestamp"
  else
    bad "quiesce-reuse: rc=${CASE_RC} output=${CASE_OUTPUT}"
  fi
}
test_quiesce_receipt_reuse

test_run_migrations_explicit_exit() {
  local broken_source="${TEST_ROOT}/source-a-broken"
  build_fixture_source "${broken_source}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M10}"
  export CALL_LOG="${TEST_ROOT}/calls-run-migrations-broken.log"; : > "${CALL_LOG}"
  run_case false "export PROD_SOURCE_DIR='${broken_source}'
_stage_a_run_migrations pre '${API_IMAGE_STAGE_A}'"
  local migrate_calls
  migrate_calls="$(grep -c 'sh -c cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy' "${CALL_LOG}" 2>/dev/null || true)"
  if [[ "${CASE_RC}" -ne 0 && "${migrate_calls}" == 0 ]]; then
    ok "_stage_a_run_migrations: a missing M8 folder aborts (explicit || exit 1) before ever invoking migrate against an incomplete tree"
  else
    bad "_stage_a_run_migrations-broken-source: rc=${CASE_RC} migrate_calls=${migrate_calls} output=${CASE_OUTPUT}"
  fi
}
test_run_migrations_explicit_exit

test_stage_a_fresh_success() {
  export PROD_TASK168_STATE_ROOT="${TEST_ROOT}/state-fresh-success"
  export PROD_SOURCE_DIR="${SOURCE_A_DIR}"
  printf '%s' "${LEDGER_EMPTY}" > "${TEST_ROOT}/ledger-fresh-success.txt"
  printf '0|0|0|0|0|0' > "${TEST_ROOT}/seals-fresh-success.txt"
  export FAKE_LEDGER_FILE="${TEST_ROOT}/ledger-fresh-success.txt" FAKE_SEALS_FILE="${TEST_ROOT}/seals-fresh-success.txt"
  export FAKE_LEDGER_AFTER_PRE_FILE="${LEDGER_M1_M8_M10_FILE}"
  export FAKE_LEDGER_AFTER_POST_FILE="${LEDGER_FULL10_FILE}"
  export FAKE_SEALS_AFTER_TOOL_FILE="${SEALS_COMMITTED_FILE}"
  export FAKE_TOOL_REPORT_FILE="${TOOL_REPORT_COMPLETED}"
  export TOOL_RC=0
  export CALL_LOG="${TEST_ROOT}/calls-fresh-success.log"; : > "${CALL_LOG}"
  run_case true 'task168_stage_a'
  unset FAKE_LEDGER_AFTER_PRE_FILE FAKE_LEDGER_AFTER_POST_FILE FAKE_SEALS_AFTER_TOOL_FILE FAKE_TOOL_REPORT_FILE TOOL_RC
  local transition="${TEST_ROOT}/state-fresh-success/release-sha-a/transition.json"
  if [[ "${CASE_RC}" -eq 0 && -s "${transition}" ]] &&
     jq -e '.status=="COMPLETED" and .kind=="transition" and (.cutoverReportSha256|type=="string") and (.cutoverReportSha256|length)==64' "${transition}" >/dev/null 2>&1; then
    ok "stage-a-fresh-success: full green run reached transition.json with a mandatory cutoverReportSha256"
  else
    bad "stage-a-fresh-success: rc=${CASE_RC} output=${CASE_OUTPUT}"
  fi
}
test_stage_a_fresh_success
export PROD_SOURCE_DIR="${SOURCE_A_DIR}"

# ═══════════════════════ Task 3: Stage B ═══════════════════════════════════

export PROD_MANIFEST_FILE="${MANIFEST_B}"
export API_IMAGE="${API_IMAGE_STAGE_B}"
export PROD_SOURCE_DIR="${SOURCE_B_DIR}"
STAGE_B_DB_ID="$(printf '%s' "${FAKE_IDENTITY_FULL}" | sha256sum | awk '{print $1}')"

seed_stage_b_transition() {
  local sd="$1" transition_db_id="$2" tamper_receipt="${3:-false}" release_sha_field="${4:-release-sha-b}"
  install -d -m 700 "${sd}/report"
  printf 'x' > "${sd}/backup.dump"
  echo '{}' > "${sd}/quiesce.json"; chmod 600 "${sd}/quiesce.json"
  echo '{}' > "${sd}/backup.json"; chmod 600 "${sd}/backup.json"
  cp "${TOOL_REPORT_COMPLETED}" "${sd}/report/cutover-report.json"; chmod 600 "${sd}/report/cutover-report.json"
  local quiesce_sha backup_receipt_sha backup_file_sha report_sha
  quiesce_sha="$(sha256sum "${sd}/quiesce.json" | awk '{print $1}')"
  backup_receipt_sha="$(sha256sum "${sd}/backup.json" | awk '{print $1}')"
  backup_file_sha="$(sha256sum "${sd}/backup.dump" | awk '{print $1}')"
  report_sha="$(sha256sum "${sd}/report/cutover-report.json" | awk '{print $1}')"
  [[ "${tamper_receipt}" != true ]] || quiesce_sha="deadbeef00000000000000000000000000000000000000000000000000dead"
  jq -n --arg db "${transition_db_id}" --arg release "${release_sha_field}" --argjson migrations "${MIGRATIONS_JSON}" \
    --arg qp "${sd}/quiesce.json" --arg qs "${quiesce_sha}" \
    --arg bp "${sd}/backup.json" --arg bs "${backup_receipt_sha}" \
    --arg bfp "${sd}/backup.dump" --arg bfs "${backup_file_sha}" \
    --arg rp "${sd}/report/cutover-report.json" --arg rs "${report_sha}" \
    '{schemaVersion:1,kind:"transition",status:"COMPLETED",stage:"stageA",releaseSha:$release,databaseIdentity:$db,migrations:$migrations,quiesceReceipt:$qp,quiesceReceiptSha256:$qs,backupReceipt:$bp,backupReceiptSha256:$bs,backupPath:$bfp,backupSha256:$bfs,cutoverReport:$rp,cutoverReportSha256:$rs}' \
    > "${sd}/transition.json"
  chmod 600 "${sd}/transition.json"
}

run_stage_b_reject_case() {
  local desc="$1" expected_msg="$2"
  export CALL_LOG="${TEST_ROOT}/calls-b-${desc}.log"; : > "${CALL_LOG}"
  run_case false 'task168_stage_b'
  local migrate_calls
  migrate_calls="$(grep -c 'MIGRATE_DEPLOY_STAGE_B' "${CALL_LOG}" || true)"
  if [[ "${CASE_RC}" -ne 0 && "${migrate_calls}" == 0 ]] && assert_msg "${CASE_OUTPUT}" "${expected_msg}"; then
    ok "stage-b-reject(${desc}): refused before the M11 migrate call, message asserted"
  else
    bad "stage-b-reject(${desc}): rc=${CASE_RC} migrate_calls=${migrate_calls} output=${CASE_OUTPUT}"
  fi
}

printf '%s' "${LEDGER_FULL10}" > "${TEST_ROOT}/ledger-b.txt"
printf '5|5|3|0|0|0' > "${TEST_ROOT}/seals-b.txt"
export FAKE_LEDGER_FILE="${TEST_ROOT}/ledger-b.txt" FAKE_SEALS_FILE="${TEST_ROOT}/seals-b.txt"

export PROD_TASK168_STATE_ROOT="${TEST_ROOT}/stateb-none"
install -d -m 700 "${PROD_TASK168_STATE_ROOT}"
run_stage_b_reject_case "no-receipt" "no unique Stage A transition receipt"

export PROD_TASK168_STATE_ROOT="${TEST_ROOT}/stateb-mismatch"
seed_stage_b_transition "${PROD_TASK168_STATE_ROOT}/release-sha-a" \
  "0000000000000000000000000000000000000000000000000000000000000000" false
run_stage_b_reject_case "identity-mismatch" "no unique Stage A transition receipt"

export PROD_TASK168_STATE_ROOT="${TEST_ROOT}/stateb-tampered"
seed_stage_b_transition "${PROD_TASK168_STATE_ROOT}/release-sha-a" "${STAGE_B_DB_ID}" true
run_stage_b_reject_case "receipt-tampered" "transition quiesce evidence changed"

export PROD_TASK168_STATE_ROOT="${TEST_ROOT}/stateb-m11tamper"
seed_stage_b_transition "${PROD_TASK168_STATE_ROOT}/release-sha-a" "${STAGE_B_DB_ID}" false
SOURCE_B_TAMPERED_DIR="${TEST_ROOT}/source-b-tampered"
build_fixture_source "${SOURCE_B_TAMPERED_DIR}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}" "${PROD_TASK168_M11}"
printf -- '-- tampered\nSELECT 1;\n' > "${SOURCE_B_TAMPERED_DIR}/apps/v1_api/prisma/migrations/${PROD_TASK168_M11}/migration.sql"
export PROD_SOURCE_DIR="${SOURCE_B_TAMPERED_DIR}"
run_stage_b_reject_case "m11-hash-mismatch" "M11 source checksum does not match the pinned value"
export PROD_SOURCE_DIR="${SOURCE_B_DIR}"

test_stage_b_success() {
  export PROD_TASK168_STATE_ROOT="${TEST_ROOT}/stateb-success"
  seed_stage_b_transition "${PROD_TASK168_STATE_ROOT}/release-sha-b" "${STAGE_B_DB_ID}" false
  printf '%s' "${LEDGER_FULL10}" > "${TEST_ROOT}/ledger-b-success.txt"
  printf '5|5|3|0|0|0' > "${TEST_ROOT}/seals-b-success.txt"
  export FAKE_LEDGER_FILE="${TEST_ROOT}/ledger-b-success.txt" FAKE_SEALS_FILE="${TEST_ROOT}/seals-b-success.txt"
  export FAKE_LEDGER_AFTER_M11_FILE="${LEDGER_ALL11_FILE}"
  export CALL_LOG="${TEST_ROOT}/calls-b-success.log"; : > "${CALL_LOG}"
  run_case false 'task168_stage_b'
  unset FAKE_LEDGER_AFTER_M11_FILE
  local migrate_calls backfill_calls stage_receipt
  migrate_calls="$(grep -c 'MIGRATE_DEPLOY_STAGE_B' "${CALL_LOG}" || true)"
  backfill_calls="$(grep -c 'BACKFILL_CALLED' "${CALL_LOG}" || true)"
  stage_receipt="${PROD_TASK168_STATE_ROOT}/release-sha-b/migration-stage.json"
  if [[ "${CASE_RC}" -eq 0 && "${migrate_calls}" == 1 && "${backfill_calls}" == 1 && -s "${stage_receipt}" ]] &&
     jq -e '.status=="MIGRATION_COMMITTED"' "${stage_receipt}" >/dev/null 2>&1; then
    ok "stage-b-success: full green run -- M11 migrate -> migration-stage.json -> backfill"
  else
    bad "stage-b-success: rc=${CASE_RC} migrate_calls=${migrate_calls} backfill_calls=${backfill_calls} output=${CASE_OUTPUT}"
  fi
}
test_stage_b_success

test_stage_b_resume_after_m11() {
  export PROD_TASK168_STATE_ROOT="${TEST_ROOT}/stateb-resume"
  local sd="${PROD_TASK168_STATE_ROOT}/release-sha-b"
  seed_stage_b_transition "${sd}" "${STAGE_B_DB_ID}" false
  jq -nc --arg release release-sha-b --arg api "${API_IMAGE_STAGE_B}" --arg db "${STAGE_B_DB_ID}" --argjson applied 11 \
    '{schemaVersion:1,kind:"migrationStage",status:"MIGRATION_COMMITTED",releaseSha:$release,apiImage:$api,databaseIdentity:$db,appliedCount:$applied,completedAt:"2026-01-01T00:00:00Z"}' \
    > "${sd}/migration-stage.json"
  chmod 600 "${sd}/migration-stage.json"
  printf '%s' "${LEDGER_ALL11}" > "${TEST_ROOT}/ledger-b-resume.txt"
  printf '5|5|3|0|0|0' > "${TEST_ROOT}/seals-b-resume.txt"
  export FAKE_LEDGER_FILE="${TEST_ROOT}/ledger-b-resume.txt" FAKE_SEALS_FILE="${TEST_ROOT}/seals-b-resume.txt"
  export CALL_LOG="${TEST_ROOT}/calls-b-resume.log"; : > "${CALL_LOG}"
  run_case false 'task168_stage_b'
  local migrate_calls backfill_calls
  migrate_calls="$(grep -c 'MIGRATE_DEPLOY_STAGE_B' "${CALL_LOG}" || true)"
  backfill_calls="$(grep -c 'BACKFILL_CALLED' "${CALL_LOG}" || true)"
  if [[ "${CASE_RC}" -eq 0 && "${migrate_calls}" == 0 && "${backfill_calls}" == 1 ]]; then
    ok "stage-b-resume-after-m11 (Important 5): M11 migrate NOT re-invoked, backfill retried and succeeded"
  else
    bad "stage-b-resume-after-m11: rc=${CASE_RC} migrate_calls=${migrate_calls} backfill_calls=${backfill_calls} output=${CASE_OUTPUT}"
  fi
}
test_stage_b_resume_after_m11

# ═══════════════════════ Task 3: verify() (Important 8) ════════════════════

FAKE_MATCH_ROWS_EMPTY_FILE_UNUSED=1
export FAKE_MATCH_ROWS=''

test_verify_success_paginates() {
  export PROD_TASK168_STATE_ROOT="${TEST_ROOT}/verify-success"
  seed_stage_b_transition "${PROD_TASK168_STATE_ROOT}/release-sha-b" "${STAGE_B_DB_ID}" false
  local pages="${TEST_ROOT}/verify-pages-success.json"
  jq -n '[
    {cursor:"", items:[{id:"t1"},{id:"t2"}], hasNext:true, nextCursor:"t2"},
    {cursor:"t2", items:[{id:"t3"}], hasNext:false, nextCursor:null}
  ]' > "${pages}"
  export FAKE_LIST_PAGES_FILE="${pages}" FAKE_DETAIL_CODE=200
  export CALL_LOG="${TEST_ROOT}/calls-verify-success.log"; : > "${CALL_LOG}"
  run_case false 'task168_verify'
  unset FAKE_LIST_PAGES_FILE FAKE_DETAIL_CODE
  local receipt="${PROD_TASK168_STATE_ROOT}/release-sha-b/runtime-verification.json"
  local list_calls
  list_calls="$(grep -cE "curl .*'\?cursor=|curl .*tournaments\"$|curl .*tournaments'" "${CALL_LOG}" 2>/dev/null || true)"
  if [[ "${CASE_RC}" -eq 0 && -s "${receipt}" ]] && jq -e '.status=="COMPLETED" and .checkedCount==3' "${receipt}" >/dev/null 2>&1; then
    ok "verify: paginates through pageInfo.nextCursor to completion, checks all 3 ids, writes COMPLETED"
  else
    bad "verify-success: rc=${CASE_RC} output=${CASE_OUTPUT} receipt=$(cat "${receipt}" 2>/dev/null)"
  fi
}
test_verify_success_paginates

test_verify_zero_ids_fails() {
  export PROD_TASK168_STATE_ROOT="${TEST_ROOT}/verify-zero"
  seed_stage_b_transition "${PROD_TASK168_STATE_ROOT}/release-sha-b" "${STAGE_B_DB_ID}" false
  local pages="${TEST_ROOT}/verify-pages-zero.json"
  jq -n '[{cursor:"", items:[], hasNext:false, nextCursor:null}]' > "${pages}"
  export FAKE_LIST_PAGES_FILE="${pages}"
  export CALL_LOG="${TEST_ROOT}/calls-verify-zero.log"; : > "${CALL_LOG}"
  run_case false 'task168_verify'
  unset FAKE_LIST_PAGES_FILE
  if [[ "${CASE_RC}" -ne 0 ]] && assert_msg "${CASE_OUTPUT}" 'zero ids after full pagination'; then
    ok "verify: zero ids after full pagination is a hard failure"
  else
    bad "verify-zero-ids: rc=${CASE_RC} output=${CASE_OUTPUT}"
  fi
}
test_verify_zero_ids_fails

test_verify_shape_mismatch_fails() {
  export PROD_TASK168_STATE_ROOT="${TEST_ROOT}/verify-shape"
  seed_stage_b_transition "${PROD_TASK168_STATE_ROOT}/release-sha-b" "${STAGE_B_DB_ID}" false
  local pages="${TEST_ROOT}/verify-pages-shape.json"
  jq -n '[{cursor:"", malformed:true, hasNext:false}]' > "${pages}"
  export FAKE_LIST_PAGES_FILE="${pages}"
  export CALL_LOG="${TEST_ROOT}/calls-verify-shape.log"; : > "${CALL_LOG}"
  run_case false 'task168_verify'
  unset FAKE_LIST_PAGES_FILE
  if [[ "${CASE_RC}" -ne 0 ]] && assert_msg "${CASE_OUTPUT}" 'unexpected shape'; then
    ok "verify: a response missing data.items (unexpected shape) is a hard failure"
  else
    bad "verify-shape-mismatch: rc=${CASE_RC} output=${CASE_OUTPUT}"
  fi
}
test_verify_shape_mismatch_fails

# ═══════════════════════════════════════════════════════════════════════════

if [[ "${failures}" -ne 0 ]]; then
  echo "[test-prod-task168] FAILED: ${failures} scenario(s)" >&2
  exit 1
fi
echo "[test-prod-task168] all scenarios passed"

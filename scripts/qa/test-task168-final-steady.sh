#!/usr/bin/env bash
# Real test for deploy/task168-final-steady-migrate.sh's L1-L4 judgment and
# StageB receipt binding. Runs the actual script as a subprocess against a
# fake `docker` (intercepting `docker compose ... exec v1_postgres psql`,
# `docker compose ... run v1_api`, `docker cp`, `docker exec`, `docker rm`)
# so no real Postgres or container is needed; assertions are made on the
# script's exit code and on a call log, matching this repo's existing
# fake-compose test convention (scripts/qa/test-alpha-release-state.sh,
# scripts/qa/test-prod-release-state.sh).
#
# Expected red counts per mutation, measured at the bottom of this file.
# Each target line was picked to be the ONLY guard for its scenario -- L1's
# general per-name loop and L3's "pending sorts after M11" rule both cover
# large parts of what a naive reading of "L2" or "receipt checks" would
# suggest, so mutating those redundant lines alone never flips the result
# (verified by hand before writing these six; see git history of this file
# for the two mutations this replaced, which never went red because of that
# redundancy -- that redundancy is a correct defense-in-depth property, not
# a bug, so the mutations below target the genuinely load-bearing line for
# each scenario instead):
#   1. L1 checksum comparison flipped (accepts a mismatched non-Task168
#      applied row instead of rejecting it): negative ⑤ turns red.
#   2. M11's hardcoded checksum pin removed (the one check independent of
#      the candidate tree itself): negative ⑧ (source and ledger both carry
#      an identically-tampered M11) turns red.
#   3. L3 pending-order rule removed: negative ⑥ (pending name sorts at/
#      before M11) turns red.
#   4. L4 unresolved-row rule removed: negative ⑦ (a crashed/in-flight
#      ledger row) turns red.
#   5. The StageB receipt's databaseIdentity binding removed: negative ⑨ (a
#      receipt captured against a different alpha environment) turns red.
#   6. Exact-match reversion (inserting "pending_count == 0 or fail",
#      simulating the candidate runner's full-ledger-equality design this
#      script deliberately does NOT use): positive ⓑ (a legitimate M12
#      pending after M11) flips from pass to fail -- proving this suite
#      would catch a regression back to the design D-1 was written to fix.
# See the bottom of this file for the actual mutation run that measures
# these counts against the real script.
set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly SCRIPT="${ROOT_DIR}/deploy/task168-final-steady-migrate.sh"
readonly M11_NAME=20260911090000_retire_tournament_fixture_tables
readonly M11_SOURCE="${ROOT_DIR}/apps/v1_api/prisma/migrations/${M11_NAME}/migration.sql"
readonly M11_SHA=08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323
readonly TASK168_M1_M10=(
  20260908130000_v1_team_match_tournament_expand
  20260908150000_v1_operation_audit_team_match_expand
  20260908160000_v1_official_fact_team_match_scope
  20260908170000_v1_lineup_invalidation
  20260908180000_v1_staff_scope_team_match
  20260909000000_v1_tournament_result_lineage
  20260909110000_v1_operation_audit_canonical_binding
  20260910010000_v1_official_fact_source_history
  20260910020000_v1_canonical_game_db_guards
  20260910160000_v1_outbox_cutover_claim_gate
)
readonly FAKE_DB_ID="testdb|testuser|127.0.0.1|5432"

[[ -s "${M11_SOURCE}" ]] || { echo "fixture setup: M11 migration.sql is missing" >&2; exit 1; }
[[ "$(sha256sum "${M11_SOURCE}" | awk '{print $1}')" == "${M11_SHA}" ]] || {
  echo "fixture setup: M11 migration.sql does not match the pinned checksum" >&2
  exit 1
}

# ── fixture builders ─────────────────────────────────────────────────────────

# make_source_tree DIR [extra-migration-name ...]
# Builds a candidate source tree with the 10 Task168 M1-M10 migrations (dummy
# content, real per-file checksum), the real M11 file, and any extra names
# (dummy content) appended in argument order.
make_source_tree() {
  local dir="$1"; shift
  local migrations="${dir}/apps/v1_api/prisma/migrations"
  mkdir -p "${migrations}"
  printf 'provider = "postgresql"\n' > "${migrations}/migration_lock.toml"
  printf 'datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}\n' \
    > "${dir}/apps/v1_api/prisma/schema.prisma"
  local name
  for name in "${TASK168_M1_M10[@]}"; do
    mkdir -p "${migrations}/${name}"
    printf -- '-- dummy migration %s\nSELECT 1;\n' "${name}" > "${migrations}/${name}/migration.sql"
  done
  mkdir -p "${migrations}/${M11_NAME}"
  cp "${M11_SOURCE}" "${migrations}/${M11_NAME}/migration.sql"
  for name in "$@"; do
    mkdir -p "${migrations}/${name}"
    printf -- '-- dummy migration %s\nSELECT 1;\n' "${name}" > "${migrations}/${name}/migration.sql"
  done
}

source_sha() {
  local dir="$1" name="$2"
  sha256sum "${dir}/apps/v1_api/prisma/migrations/${name}/migration.sql" | awk '{print $1}'
}

# ledger_row NAME CHECKSUM FINISHED(t/f) ROLLEDBACK(t/f)
ledger_row() { printf '%s|%s|%s|%s\n' "$1" "$2" "$3" "$4"; }

# applied_rows_for DIR NAME... -> every name applied (finished=t rolledback=f)
# with that name's OWN checksum from the given source dir.
applied_rows_for() {
  local dir="$1"; shift
  local name
  for name in "$@"; do
    ledger_row "${name}" "$(source_sha "${dir}" "${name}")" t f
  done
}

# ── fake docker: intercepts `docker compose ... exec v1_postgres psql -c SQL`,
# `docker compose ... run -d --no-deps --entrypoint sh v1_api ...`,
# `docker cp`, `docker exec -u ... <id> ...`, `docker rm -f <id>` ──────────────
install_fake_docker() {
  local mock_bin="$1"
  mkdir -p "${mock_bin}"
  cat > "${mock_bin}/docker" <<'DOCKEREOF'
#!/usr/bin/env bash
set -Eeuo pipefail
: "${CALL_LOG:?}" "${LEDGER_ROWS_BEFORE_FILE:?}" "${TABLE_EXISTS:?}" "${DB_ID:?}"
printf '%s\n' "$*" >> "${CALL_LOG}"

sql="${*: -1}"
case "$*" in
  *'exec -T v1_postgres psql'*)
    case "${sql}" in
      *current_database*)
        printf '%s\n' "${DB_ID}"
        ;;
      *to_regclass*)
        printf '%s\n' "${TABLE_EXISTS}"
        ;;
      *'FROM "_prisma_migrations" ORDER BY migration_name'*)
        if [[ -f "${MIGRATE_RAN_FLAG:-/nonexistent}" ]]; then
          cat "${LEDGER_ROWS_AFTER_FILE}"
        else
          cat "${LEDGER_ROWS_BEFORE_FILE}"
        fi
        ;;
      *)
        echo "fake docker: unrecognized SQL: ${sql}" >&2
        exit 1
        ;;
    esac
    ;;
  *'run -d --no-deps --entrypoint sh v1_api'*)
    echo fakecontainer123
    ;;
  *'cp '*)
    : # docker cp <tmp>/. fakecontainer123:/tmp/task168-final — no-op
    ;;
  *'exec -u 0 fakecontainer123'*)
    : # chown -R app:app — no-op
    ;;
  *'exec -u app fakecontainer123'*'migrate deploy'*)
    if [[ "${FAKE_MIGRATE_DEPLOY_FAIL:-false}" == true ]]; then
      echo "fake docker: injected migrate deploy failure" >&2
      exit 1
    fi
    : > "${MIGRATE_RAN_FLAG}"
    ;;
  *'exec -u app fakecontainer123'*'migrate status'*)
    : # no-op
    ;;
  *'rm -f fakecontainer123'*)
    : # cleanup
    ;;
  *)
    echo "fake docker: unrecognized invocation: $*" >&2
    exit 1
    ;;
esac
DOCKEREOF
  chmod +x "${mock_bin}/docker"
}

# run_steady MODE DIR -> stdout+stderr combined, sets STEADY_RC
run_steady() {
  local mode="$1" dir="$2"
  local compose_prod="${dir}/compose-prod.yml"
  local compose_alpha="${dir}/compose-alpha.yml"
  local env_file="${dir}/.env"
  : > "${compose_prod}"; : > "${compose_alpha}"; : > "${env_file}"
  set +e
  STEADY_OUTPUT="$(bash "${SCRIPT}" "--${mode}" --source-dir "${dir}" \
    --compose-prod "${compose_prod}" --compose-alpha "${compose_alpha}" \
    --env-file "${env_file}" 2>&1)"
  STEADY_RC=$?
  set -e
}

# ── shared harness ────────────────────────────────────────────────────────────
readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT
readonly MOCK_BIN="${TEST_ROOT}/mockbin"
install_fake_docker "${MOCK_BIN}"
export PATH="${MOCK_BIN}:${PATH}"
export CALL_LOG="${TEST_ROOT}/docker-calls.log"
export DB_ID="${FAKE_DB_ID}"

write_receipts() {
  local state_root="$1" db_id="$2" m11_sha="$3"
  local dir="${state_root}/task168-final"
  mkdir -p "${dir}"
  cat > "${dir}/transition.json" <<EOF
{"schemaVersion":1,"kind":"task168StageBMigration","status":"MIGRATION_COMMITTED","databaseIdentity":"${db_id}","m11Sha256":"${m11_sha}","completedAt":"2026-09-14T00:00:00Z"}
EOF
  local transition_sha
  transition_sha="$(sha256sum "${dir}/transition.json" | awk '{print $1}')"
  cat > "${dir}/runtime-verification.json" <<EOF
{"schemaVersion":1,"kind":"task168StageBRuntimeVerification","status":"COMPLETED","databaseIdentity":"${db_id}","migrationReceiptSha256":"${transition_sha}"}
EOF
}

negatives_failed=0
positives_failed=0
assert_check_only_fails() {
  local label="$1" dir="$2"
  run_steady check-only "${dir}"
  if [[ "${STEADY_RC}" -eq 0 ]]; then
    echo "NEGATIVE FAILED (${label}): check-only unexpectedly passed" >&2
    echo "${STEADY_OUTPUT}" >&2
    negatives_failed=$((negatives_failed + 1))
    return 1
  fi
  if grep -q "migrate deploy" "${CALL_LOG}" 2>/dev/null; then
    echo "NEGATIVE FAILED (${label}): check-only ran a migrate deploy call" >&2
    negatives_failed=$((negatives_failed + 1))
    return 1
  fi
  echo "[negative ${label}] OK: $(tail -1 <<<"${STEADY_OUTPUT}")"
}
assert_check_only_passes() {
  local label="$1" dir="$2"
  run_steady check-only "${dir}"
  if [[ "${STEADY_RC}" -ne 0 ]]; then
    echo "POSITIVE FAILED (${label}): check-only unexpectedly failed" >&2
    echo "${STEADY_OUTPUT}" >&2
    positives_failed=$((positives_failed + 1))
    return 1
  fi
  echo "[positive ${label}] OK"
}

# ── negative ① no StageB receipt at all ──────────────────────────────────────
dir1="${TEST_ROOT}/n1"; make_source_tree "${dir1}"
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/n1-state"  # no receipts written here
: > "${TEST_ROOT}/rows-before-n1"
applied_rows_for "${dir1}" "${TASK168_M1_M10[@]}" "${M11_NAME}" > "${TEST_ROOT}/rows-before-n1"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-before-n1"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-before-n1"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/n1-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_fails "no-stageb-receipt" "${dir1}"

# From here on, every scenario has valid receipts for FAKE_DB_ID + M11_SHA.
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/state"
write_receipts "${ALPHA_RELEASE_STATE_DIR}" "${FAKE_DB_ID}" "${M11_SHA}"

# ── negative ② ledger has only M1-M10 (M11 not yet applied — pre-StageB) ─────
dir2="${TEST_ROOT}/n2"; make_source_tree "${dir2}"
applied_rows_for "${dir2}" "${TASK168_M1_M10[@]}" > "${TEST_ROOT}/rows-n2"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n2"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n2"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/n2-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_fails "m11-not-applied" "${dir2}"

# ── negative ③ applied M11 checksum differs from the pinned/source value ────
dir3="${TEST_ROOT}/n3"; make_source_tree "${dir3}"
{
  applied_rows_for "${dir3}" "${TASK168_M1_M10[@]}"
  ledger_row "${M11_NAME}" "0000000000000000000000000000000000000000000000000000000000000000" t f
} > "${TEST_ROOT}/rows-n3"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n3"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n3"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/n3-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_fails "m11-checksum-mismatch" "${dir3}"

# ── negative ④ DB has an applied row with a name absent from the source tree ─
dir4="${TEST_ROOT}/n4"; make_source_tree "${dir4}"
{
  applied_rows_for "${dir4}" "${TASK168_M1_M10[@]}" "${M11_NAME}"
  ledger_row "20260101000000_v1_stray_not_in_source" aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa t f
} > "${TEST_ROOT}/rows-n4"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n4"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n4"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/n4-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_fails "applied-row-not-in-source" "${dir4}"

# ── negative ⑤ a non-Task168 applied row's checksum differs from source ─────
dir5="${TEST_ROOT}/n5"; make_source_tree "${dir5}" 20260912000000_v1_after_m11
{
  applied_rows_for "${dir5}" "${TASK168_M1_M10[@]}" "${M11_NAME}"
  ledger_row "20260912000000_v1_after_m11" ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff t f
} > "${TEST_ROOT}/rows-n5"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n5"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n5"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/n5-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_fails "non-task168-checksum-mismatch" "${dir5}"

# ── negative ⑥ a pending source-only name sorts at/before M11 ────────────────
dir6="${TEST_ROOT}/n6"; make_source_tree "${dir6}" 20260910999999_v1_before_m11
applied_rows_for "${dir6}" "${TASK168_M1_M10[@]}" "${M11_NAME}" > "${TEST_ROOT}/rows-n6"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n6"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n6"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/n6-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_fails "pending-name-before-m11" "${dir6}"

# ── negative ⑦ an unresolved (finished_at NULL, rolled_back_at NULL) row exists ─
dir7="${TEST_ROOT}/n7"; make_source_tree "${dir7}"
{
  applied_rows_for "${dir7}" "${TASK168_M1_M10[@]}" "${M11_NAME}"
  ledger_row "20260101000000_v1_crashed_attempt" bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb f f
} > "${TEST_ROOT}/rows-n7"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n7"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n7"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/n7-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_fails "unresolved-ledger-row" "${dir7}"

# ── negative ⑧ M11 tampered identically in source AND ledger (same non-pinned
#    checksum in both, so L1's general per-name comparison alone would accept
#    it) — only the explicit M11_SHA pin (independent of the candidate tree)
#    catches this. ────────────────────────────────────────────────────────────
dir8="${TEST_ROOT}/n8"; make_source_tree "${dir8}"
printf -- '-- tampered M11\nSELECT 1;\n' > "${dir8}/apps/v1_api/prisma/migrations/${M11_NAME}/migration.sql"
tampered_m11_sha="$(source_sha "${dir8}" "${M11_NAME}")"
{
  applied_rows_for "${dir8}" "${TASK168_M1_M10[@]}"
  ledger_row "${M11_NAME}" "${tampered_m11_sha}" t f
} > "${TEST_ROOT}/rows-n8"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n8"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n8"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/n8-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_fails "m11-tampered-consistently" "${dir8}"

# ── negative ⑨ StageB receipts are valid and complete but bound to a
#    DIFFERENT database than the one check-only is running against — a
#    receipt captured against another alpha environment must not be replayed
#    here. Only the receipt's databaseIdentity binding catches this; the
#    ledger itself (dir9's rows) is a clean M1-M11 match. ────────────────────
dir9="${TEST_ROOT}/n9"; make_source_tree "${dir9}"
applied_rows_for "${dir9}" "${TASK168_M1_M10[@]}" "${M11_NAME}" > "${TEST_ROOT}/rows-n9"
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/n9-state"
write_receipts "${ALPHA_RELEASE_STATE_DIR}" "otherdb|otheruser|10.0.0.9|5432" "${M11_SHA}"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n9"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n9"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/n9-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_fails "receipt-bound-to-other-database" "${dir9}"
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/state"

# ── positive ⓐ source == DB == M1-M11, no pending ────────────────────────────
dira="${TEST_ROOT}/pa"; make_source_tree "${dira}"
applied_rows_for "${dira}" "${TASK168_M1_M10[@]}" "${M11_NAME}" > "${TEST_ROOT}/rows-pa"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-pa"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-pa"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/pa-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_passes "clean-m1-m11" "${dira}"

# ── positive ⓑ a pending migration after M11 (M12) exists; check-only passes,
#    and --migrate applies it via the docker exec path, then re-verifies L1 ──
dirb="${TEST_ROOT}/pb"; make_source_tree "${dirb}" 20260915000000_v1_after_m11
applied_rows_for "${dirb}" "${TASK168_M1_M10[@]}" "${M11_NAME}" > "${TEST_ROOT}/rows-pb-before"
{
  applied_rows_for "${dirb}" "${TASK168_M1_M10[@]}" "${M11_NAME}" "20260915000000_v1_after_m11"
} > "${TEST_ROOT}/rows-pb-after"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-pb-before"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-pb-after"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/pb-migrate-ran"
rm -f "${MIGRATE_RAN_FLAG}"
: > "${CALL_LOG}"
assert_check_only_passes "pending-after-m11" "${dirb}"
run_steady migrate "${dirb}"
if [[ "${STEADY_RC}" -ne 0 ]]; then
  echo "POSITIVE FAILED (migrate-applies-pending): --migrate unexpectedly failed" >&2
  echo "${STEADY_OUTPUT}" >&2
  positives_failed=$((positives_failed + 1))
elif ! grep -q "run -d --no-deps --entrypoint sh v1_api" "${CALL_LOG}"; then
  echo "POSITIVE FAILED (migrate-applies-pending): --migrate never invoked the runner container" >&2
  positives_failed=$((positives_failed + 1))
elif [[ ! -f "${MIGRATE_RAN_FLAG}" ]]; then
  echo "POSITIVE FAILED (migrate-applies-pending): prisma migrate deploy was never called" >&2
  positives_failed=$((positives_failed + 1))
else
  echo "[positive migrate-applies-pending] OK"
fi

# ── positive ⓒ a resolved-rolled-back row coexists (finished_at NULL,
#    rolled_back_at NOT NULL) — excluded from L1/L2/L4, not a violation ──────
dirc="${TEST_ROOT}/pc"; make_source_tree "${dirc}"
{
  applied_rows_for "${dirc}" "${TASK168_M1_M10[@]}" "${M11_NAME}"
  ledger_row "20260101000000_v1_old_failed_attempt" cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc f t
} > "${TEST_ROOT}/rows-pc"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-pc"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-pc"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/pc-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_passes "resolved-rolled-back-row-coexists" "${dirc}"

if [[ "${negatives_failed}" -ne 0 || "${positives_failed}" -ne 0 ]]; then
  echo "[task168-final-steady] FAILED: ${negatives_failed} negative(s), ${positives_failed} positive(s)" >&2
  exit 1
fi
echo "[task168-final-steady] all 9 negatives + 3 positives passed"

# ── mutation run: verify the expected red counts in the header comment ──────
# Applies each mutation to a scratch copy of the script and reruns the exact
# scenario each mutation is supposed to break; counts failures (rc != 0 that
# should now be rc == 0, i.e. the scenario becomes wrongly accepted).
mutate_and_check() {
  local label="$1" old_snippet="$2" new_snippet="$3" expect_now_passes_dir="$4"
  local scratch="${TEST_ROOT}/mut-${label}"
  mkdir -p "${scratch}"
  SCRIPT_UNDER_TEST="${scratch}/task168-final-steady-migrate.sh"
  OLD_SNIPPET="${old_snippet}" NEW_SNIPPET="${new_snippet}" SRC="${SCRIPT}" OUT="${SCRIPT_UNDER_TEST}" \
    python3 - <<'PYEOF'
import os
src = open(os.environ['SRC'], 'r', encoding='utf-8').read()
old = os.environ['OLD_SNIPPET']
new = os.environ['NEW_SNIPPET']
count = src.count(old)
if count != 1:
    raise SystemExit(f'expected exactly 1 occurrence of the mutation target, found {count}')
open(os.environ['OUT'], 'w', encoding='utf-8').write(src.replace(old, new, 1))
PYEOF
  local compose_prod="${expect_now_passes_dir}/compose-prod.yml"
  local compose_alpha="${expect_now_passes_dir}/compose-alpha.yml"
  local env_file="${expect_now_passes_dir}/.env"
  set +e
  bash "${SCRIPT_UNDER_TEST}" --check-only --source-dir "${expect_now_passes_dir}" \
    --compose-prod "${compose_prod}" --compose-alpha "${compose_alpha}" --env-file "${env_file}" >/dev/null 2>&1
  local rc=$?
  set -e
  if [[ "${rc}" -eq 0 ]]; then
    echo "[mutation ${label}] red (correctly turned the guarded scenario into a false accept)"
    return 0
  else
    echo "[mutation ${label}] NOT red — mutation did not weaken the check as expected" >&2
    return 1
  fi
}

mutation_reds=0
mutation_total=0

# L1/comparison flip: applied checksum mismatch (negative ⑤) becomes accepted.
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n5"; export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n5"
export TABLE_EXISTS=t; export MIGRATE_RAN_FLAG="${TEST_ROOT}/mut1-migrate-ran"
mutation_total=$((mutation_total + 1))
if mutate_and_check "l1-checksum-flip" \
  '[[ "${APPLIED_SHA[${name}]}" == "${SOURCE_SHA[${name}]}" ]] || fail "L1 violated: applied migration '"'"'${name}'"'"' checksum differs from the candidate source tree"' \
  ':' \
  "${dir5}"; then
  mutation_reds=$((mutation_reds + 1))
fi

# M11's hardcoded checksum pin removed. This one needs TWO deletions to
# turn red: the pin is asserted twice -- once against the candidate source
# tree up front (line ~69, before L1-L4 even run) and once against the
# applied ledger row (L2, after the loop). Either one alone still catches a
# consistently-tampered M11 (dir8/negative ⑧: source and ledger both carry
# the SAME wrong checksum, so L1's source-vs-ledger comparison alone would
# accept it) because the other still fires. Removing only one is therefore
# correctly safe -- not a bug, genuine defense-in-depth -- so both must be
# removed together to observe the real "pin removed entirely" scenario.
mutation_total=$((mutation_total + 1))
scratch2="${TEST_ROOT}/mut-m11-pin-removed"
mkdir -p "${scratch2}"
python3 - "${SCRIPT}" "${scratch2}/task168-final-steady-migrate.sh" <<'PYEOF'
import sys
src_path, out_path = sys.argv[1], sys.argv[2]
src = open(src_path, encoding='utf-8').read()
targets = [
    '[[ "${SOURCE_SHA[${M11_NAME}]}" == "${M11_SHA}" ]] || fail \'M11 checksum in the candidate source tree does not match the pinned value\'',
    '[[ "${APPLIED_SHA[${M11_NAME}]}" == "${M11_SHA}" ]] || fail \'L2 violated: applied M11 checksum does not match the pinned value\'',
]
for t in targets:
    c = src.count(t)
    if c != 1:
        raise SystemExit(f'expected exactly 1 occurrence, found {c}: {t!r}')
    src = src.replace(t, ':', 1)
open(out_path, 'w', encoding='utf-8').write(src)
PYEOF
compose_prod2="${dir8}/compose-prod.yml"; compose_alpha2="${dir8}/compose-alpha.yml"; env_file2="${dir8}/.env"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n8"; export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n8"
export TABLE_EXISTS=t; export MIGRATE_RAN_FLAG="${TEST_ROOT}/mut2-migrate-ran"
set +e
bash "${scratch2}/task168-final-steady-migrate.sh" --check-only --source-dir "${dir8}" \
  --compose-prod "${compose_prod2}" --compose-alpha "${compose_alpha2}" --env-file "${env_file2}" >/dev/null 2>&1
rc2=$?
set -e
if [[ "${rc2}" -eq 0 ]]; then
  echo "[mutation m11-pin-removed] red (correctly turned the guarded scenario into a false accept)"
  mutation_reds=$((mutation_reds + 1))
else
  echo "[mutation m11-pin-removed] NOT red — mutation did not weaken the check as expected" >&2
fi

# L3 removed: pending name before M11 (negative ⑥) becomes accepted.
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n6"; export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n6"
export TABLE_EXISTS=t; export MIGRATE_RAN_FLAG="${TEST_ROOT}/mut3-migrate-ran"
mutation_total=$((mutation_total + 1))
if mutate_and_check "l3-removed" \
  '[[ "${name}" > "${M11_NAME}" ]] || fail "L3 violated: pending migration '"'"'${name}'"'"' sorts at or before M11"' \
  ':' \
  "${dir6}"; then
  mutation_reds=$((mutation_reds + 1))
fi

# L4 removed: unresolved row (negative ⑦) becomes accepted.
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n7"; export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n7"
export TABLE_EXISTS=t; export MIGRATE_RAN_FLAG="${TEST_ROOT}/mut4-migrate-ran"
mutation_total=$((mutation_total + 1))
if mutate_and_check "l4-removed" \
  '[[ "${unresolved_count}" -eq 0 ]] || fail "L4 violated: ${unresolved_count} unresolved migration attempt(s) in the ledger"' \
  ':' \
  "${dir7}"; then
  mutation_reds=$((mutation_reds + 1))
fi

# StageB receipt DB-identity binding removed. Dropping the plain `-s`
# existence check is safe on its own (jq -e already fails outright on a
# missing/empty TRANSITION file, so that specific line is redundant); the
# checks that are NOT redundant with anything else are the two
# databaseIdentity bindings, one on each of the two receipts write_receipts
# produces (both bound to the same wrong db in negative ⑨/dir9, so, like
# the M11 pin above, removing only one still leaves the other to catch it
# -- both must be removed together).
mutation_total=$((mutation_total + 1))
scratch5="${TEST_ROOT}/mut-receipt-db-binding-removed"
mkdir -p "${scratch5}"
python3 - "${SCRIPT}" "${scratch5}/task168-final-steady-migrate.sh" <<'PYEOF'
import sys
src_path, out_path = sys.argv[1], sys.argv[2]
src = open(src_path, encoding='utf-8').read()
targets = [
    ('.databaseIdentity==$db and .m11Sha256==$m11', '.m11Sha256==$m11'),
    ('.status=="COMPLETED" and .databaseIdentity==$db and .migrationReceiptSha256==$transitionSha',
     '.status=="COMPLETED" and .migrationReceiptSha256==$transitionSha'),
]
for old, new in targets:
    c = src.count(old)
    if c != 1:
        raise SystemExit(f'expected exactly 1 occurrence, found {c}: {old!r}')
    src = src.replace(old, new, 1)
open(out_path, 'w', encoding='utf-8').write(src)
PYEOF
compose_prod5="${dir9}/compose-prod.yml"; compose_alpha5="${dir9}/compose-alpha.yml"; env_file5="${dir9}/.env"
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/n9-state"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n9"; export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n9"
export TABLE_EXISTS=t; export MIGRATE_RAN_FLAG="${TEST_ROOT}/mut5-migrate-ran"
set +e
bash "${scratch5}/task168-final-steady-migrate.sh" --check-only --source-dir "${dir9}" \
  --compose-prod "${compose_prod5}" --compose-alpha "${compose_alpha5}" --env-file "${env_file5}" >/dev/null 2>&1
rc5=$?
set -e
if [[ "${rc5}" -eq 0 ]]; then
  echo "[mutation receipt-db-binding-removed] red (correctly turned the guarded scenario into a false accept)"
  mutation_reds=$((mutation_reds + 1))
else
  echo "[mutation receipt-db-binding-removed] NOT red — mutation did not weaken the check as expected" >&2
fi
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/state"

# Exact-match reversion (v3 critique #10 / spec §3.3): if L1's subset check
# were reverted to the candidate runner's "full ledger == full source
# history" exact-equality style (rejecting ANY pending migration, not just
# ones that sort before M11), the positive ⓑ scenario (a legitimate M12
# pending after M11) must turn red -- proving this test suite would catch
# that regression, which is the entire reason L1-L4 replaced the candidate's
# ledger_assert_exact design (D-1: it would otherwise permanently block
# every dev deploy that adds a migration after M11).
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-pb-before"; export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-pb-before"
export TABLE_EXISTS=t; export MIGRATE_RAN_FLAG="${TEST_ROOT}/mut6-migrate-ran"
mutation_total=$((mutation_total + 1))
# This mutation's polarity is the opposite of the others: inserting the
# stricter check should turn the legitimate positive scenario ⓑ from
# PASS to FAIL, and that flip to FAIL is the "red" this mutation is
# supposed to produce (i.e. it proves the test suite would catch the
# regression), so it is checked directly instead of through
# mutate_and_check (which looks for a weakened check wrongly turning
# rc 0).
scratch6="${TEST_ROOT}/mut-exact-match-reversion"
mkdir -p "${scratch6}"
SCRIPT_UNDER_TEST="${scratch6}/task168-final-steady-migrate.sh"
OLD_SNIPPET='pending_count=$(( ${#source_names[@]} - ${#APPLIED_SHA[@]} ))' \
  NEW_SNIPPET='pending_count=$(( ${#source_names[@]} - ${#APPLIED_SHA[@]} ))
[[ "${pending_count}" -eq 0 ]] || fail "exact-match reversion: pending migrations are not allowed"' \
  SRC="${SCRIPT}" OUT="${SCRIPT_UNDER_TEST}" python3 - <<'PYEOF'
import os
src = open(os.environ['SRC'], 'r', encoding='utf-8').read()
old = os.environ['OLD_SNIPPET']
new = os.environ['NEW_SNIPPET']
count = src.count(old)
if count != 1:
    raise SystemExit(f'expected exactly 1 occurrence of the mutation target, found {count}')
open(os.environ['OUT'], 'w', encoding='utf-8').write(src.replace(old, new, 1))
PYEOF
compose_prod6="${dirb}/compose-prod.yml"; compose_alpha6="${dirb}/compose-alpha.yml"; env_file6="${dirb}/.env"
set +e
bash "${SCRIPT_UNDER_TEST}" --check-only --source-dir "${dirb}" \
  --compose-prod "${compose_prod6}" --compose-alpha "${compose_alpha6}" --env-file "${env_file6}" >/dev/null 2>&1
rc6=$?
set -e
if [[ "${rc6}" -ne 0 ]]; then
  echo "[mutation exact-match-reversion] red (the legitimate M12-pending release would now be wrongly rejected)"
  mutation_reds=$((mutation_reds + 1))
else
  echo "[mutation exact-match-reversion] NOT red -- an exact-match reversion did not break the pending-M12 scenario as expected" >&2
fi

echo "[task168-final-steady] mutation reds: ${mutation_reds}/${mutation_total} (expected 6/6)"
if [[ "${mutation_reds}" -ne 6 ]]; then
  echo "[task168-final-steady] FAILED: expected all 6 mutations to weaken the check as documented" >&2
  exit 1
fi

echo "[task168-final-steady] passed"

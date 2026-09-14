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
#   5. The migration-receipt scan's databaseIdentity/m11Sha256 filter
#      removed: negative ⑨ (a receipt bound to a different database) turns
#      red.
#   6. runtime-verification.json's binding to the migration receipt's own
#      sha removed: an unrelated runtime-verification.json left over for a
#      different release turns red against a legitimate migration receipt.
#   7. L4's contradictory-row rejection (finished_at AND rolled_back_at both
#      set) removed: negative ⑪ turns red.
#   8. L2's duplicate-applied-row rejection removed: negative ⑫ (the same
#      Task168 name applied twice, both rows with their own correct
#      checksum) turns red -- an associative array keyed by name would
#      otherwise silently collapse the duplicate into a single entry.
#   9. The migration-receipt scan's `kind` check removed: negative ⑬ (a
#      JSON file at the right path with every OTHER binding field correct
#      but a wrong `kind`) turns red.
#  10. The migration-receipt scan's `status` check removed: negative ⑭ (a
#      real MIGRATION_DIAGNOSIS_REQUIRED receipt -- the shape the producer
#      writes for a FAILED StageB run -- otherwise correctly bound) turns
#      red.
#  11. STAGE_B_STATE_ROOT reverted to the old (pre-fix) task168-final/ path
#      real StageB producers never write to: positive ⓐ (a legitimate,
#      correctly-shaped StageB completion) flips from pass to fail -- this
#      is the receipt-shape/path bug this file's write_receipts() fixture
#      was rewritten to catch (see negative ⑩ for the direct case: a
#      receipt genuinely written in that old shape must read as absent).
#  12. Exact-match reversion (inserting "pending_count == 0 or fail",
#      simulating the candidate runner's full-ledger-equality design this
#      script deliberately does NOT use): positive ⓑ (a legitimate M12
#      pending after M11) flips from pass to fail -- proving this suite
#      would catch a regression back to the design D-1 was written to fix.
#  13. The resolved-attempt snapshot binding (spec L4's "resolved snapshot
#      sha recorded in the StageB receipt") removed: negative ⑮ (a resolved
#      row at/before M11 the shared receipts' empty snapshot does not
#      account for) turns red.
#  14. The StageB manifest checksum binding removed: negative ⑯ (a manifest
#      file tampered by one appended byte, its JSON content otherwise still
#      valid) turns red.
#  15. The manifest-path fix reverted to trusting the receipt's own
#      `.manifest` field (the pre-fix bug: that field names an ephemeral
#      /tmp path the producing SSM command's own EXIT trap deletes, so it is
#      never live on the real host, and MIGRATION_COMMITTED_RECOVERED does
#      not even carry the field): positive ⓐ, whose fixture only ever
#      populates the sibling `manifest.json` this fix reads instead, flips
#      from pass to fail.
# Mutations 11, 12 and 15 above are the three whose expected direction is a
# false REJECT of a legitimate scenario (checked directly, not through
# mutate_and_check, which looks for a false ACCEPT); all fifteen are
# counted in the same mutation_reds/mutation_total tally at the bottom of
# this file.
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

# resolved_attempt_row NAME CHECKSUM ROLLED_BACK_AT -> one line in the exact
# format deploy/task168-migration-contract.sh's resolved_attempt_rows() (and
# the StageB manifest's resolvedMigrationAttemptsSha256) hash: finished_at is
# always NULL for a resolved-rolled-back row, so that field is always empty.
resolved_attempt_row() { printf '%s|%s||%s\n' "$1" "$2" "$3"; }

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
      *'ORDER BY migration_name,rolled_back_at,checksum,id'*)
        cat "${RESOLVED_ATTEMPT_ROWS_FILE:-/dev/null}"
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

# write_manifest DIR RESOLVED_SNAPSHOT_TEXT -> writes DIR/manifest.json with
# .database.task168.resolvedMigrationAttemptsSha256 = sha256(RESOLVED_SNAPSHOT_TEXT),
# hashed the same way deploy/task168-migration-contract.sh's
# resolved_attempt_sha() does (printf '%s' "$rows" | sha256sum). Prints the
# manifest path.
write_manifest() {
  local dir="$1" resolved_snapshot_text="$2" resolved_sha manifest_path
  resolved_sha="$(printf '%s' "${resolved_snapshot_text}" | sha256sum | awk '{print $1}')"
  manifest_path="${dir}/manifest.json"
  cat > "${manifest_path}" <<EOF
{"database":{"task168":{"resolvedMigrationAttemptsSha256":"${resolved_sha}"}}}
EOF
  printf '%s' "${manifest_path}"
}

# write_receipts STATE_ROOT DB_ID M11_SHA [RELEASE_SHA [STATUS [RESOLVED_SNAPSHOT_TEXT]]]
# Mirrors the exact receipt shape and path the real StageB producers write:
# deploy/task168-stage-b-migrate.sh's migration-stage.json (status
# MIGRATION_COMMITTED) at ${STATE_ROOT}/task168/<release-sha>/migration-stage.json,
# and deploy-alpha-stage-b.sh's R-A recovery path (status
# MIGRATION_COMMITTED_RECOVERED there, with its own, SMALLER field set: no
# `manifest` field at all -- only `manifestSha256`), and
# scripts/release/task168-stage-b-post-live-verify.sh's runtime-verification.json
# next to it. Neither producer file carries a top-level `status` field on
# runtime-verification.json or a `databaseIdentity` field there -- the DB
# binding is transitive, through migrationReceiptSha256 pointing at the
# already-DB-bound migration-stage.json.
#
# The `.manifest` field (MIGRATION_COMMITTED only) is deliberately set to a
# path that is never created: on the real host, that field records the SSM
# command's own ephemeral /tmp staging path
# (scripts/release/deploy-alpha-via-ssm.sh's `${manifest}`), which the SAME
# SSM command's EXIT trap deletes before this script ever runs -- it is
# never a live, readable path. The durable copy both receipt variants
# actually point consumers at (via `.manifestSha256`) is the file
# write_manifest wrote next to the receipt (`${dir}/manifest.json`, mirroring
# task168-stage-b-migrate.sh's `$state_dir/manifest.json`). A scenario that
# fixes the manifest by reading `.manifest` off the receipt instead of that
# sibling file must therefore fail here, not pass by accident.
#
# RESOLVED_SNAPSHOT_TEXT defaults to empty (no resolved-rolled-back rows at
# StageB time), matching every scenario's default ledger. A scenario that
# also sets RESOLVED_ATTEMPT_ROWS_FILE to a fake-DB response must pass the
# SAME text here for the two to agree.
write_receipts() {
  local state_root="$1" db_id="$2" m11_sha="$3" release_sha="${4:-1111111111111111111111111111111111111111}" status="${5:-MIGRATION_COMMITTED}" resolved_snapshot_text="${6:-}"
  local dir="${state_root}/task168/${release_sha}"
  local manifest_path manifest_sha ephemeral_manifest_path
  mkdir -p "${dir}"
  manifest_path="$(write_manifest "${dir}" "${resolved_snapshot_text}")"
  manifest_sha="$(sha256sum "${manifest_path}" | awk '{print $1}')"
  ephemeral_manifest_path="${TMPDIR:-/tmp}/deleted-by-ssm-cleanup-never-created-${release_sha}.json"
  if [[ "${status}" == MIGRATION_COMMITTED_RECOVERED ]]; then
    # Verbatim field set from deploy-alpha-stage-b.sh's R-A branch: no
    # `manifest` field, and several fields MIGRATION_COMMITTED does not
    # carry (apiImage/schemaSha256/postVerification/recoveredFrom/
    # preM11BackupSha256). This is the receipt shape a StageB run that
    # recovered from an SSM timeout produces.
    cat > "${dir}/migration-stage.json" <<EOF
{"schemaVersion":1,"kind":"task168StageBMigration","status":"${status}","stage":"stageBFinal","releaseSha":"${release_sha}","apiImage":"851725525576.dkr.ecr.ap-northeast-2.amazonaws.com/teameet-alpha-v1-api@sha256:${manifest_sha}","databaseIdentity":"${db_id}","schemaSha256":"e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46","manifestSha256":"${manifest_sha}","m11Sha256":"${m11_sha}","postVerification":{"legacyTables":0,"legacyLinkColumns":0,"retirementTriggers":0,"retirementFunctions":0,"lineageTrigger":1,"retiredEnums":0,"processingOutbox":0},"recoveredFrom":{"quiesceReceiptSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","ledgerM11Row":"applied","catalogResult":{"legacyTables":0,"legacyLinkColumns":0,"retirementTriggers":0,"retirementFunctions":0}},"preM11BackupSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","completedAt":"2026-09-14T00:00:00Z"}
EOF
  else
    cat > "${dir}/migration-stage.json" <<EOF
{"schemaVersion":1,"kind":"task168StageBMigration","status":"${status}","stage":"stageBFinal","releaseSha":"${release_sha}","databaseIdentity":"${db_id}","m11Sha256":"${m11_sha}","manifest":"${ephemeral_manifest_path}","manifestSha256":"${manifest_sha}","completedAt":"2026-09-14T00:00:00Z"}
EOF
  fi
  local migration_receipt_sha
  migration_receipt_sha="$(sha256sum "${dir}/migration-stage.json" | awk '{print $1}')"
  cat > "${dir}/runtime-verification.json" <<EOF
{"schemaVersion":1,"kind":"task168StageBRuntimeVerification","migrationReceiptSha256":"${migration_receipt_sha}","ledgerCount":11,"completedAt":"2026-09-14T00:05:00Z"}
EOF
}

negatives_failed=0
positives_failed=0
# assert_check_only_fails LABEL DIR EXPECTED_SUBSTRING
# EXPECTED_SUBSTRING is required (not optional) -- checking only rc!=0 cannot
# tell a genuine guard rejection (fail() with the intended message) apart
# from an unrelated crash (e.g. `set -u` on an unset variable, a typo'd jq
# filter): both exit non-zero. Asserting the exact fail() text pins down
# WHICH check actually fired.
assert_check_only_fails() {
  local label="$1" dir="$2" expected_substring="$3"
  [[ -n "${expected_substring}" ]] || { echo "assert_check_only_fails(${label}): missing expected_substring argument" >&2; exit 1; }
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
  if ! grep -qF -- "${expected_substring}" <<<"${STEADY_OUTPUT}"; then
    echo "NEGATIVE FAILED (${label}): check-only failed, but not for the expected reason" >&2
    echo "  expected substring: ${expected_substring}" >&2
    echo "  actual output: ${STEADY_OUTPUT}" >&2
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
assert_check_only_fails "no-stageb-receipt" "${dir1}" \
  "StageB MIGRATION_COMMITTED receipt is missing"

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
assert_check_only_fails "m11-not-applied" "${dir2}" \
  "L2 violated: Task168 migration '${M11_NAME}' is not an applied ledger row"

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
assert_check_only_fails "m11-checksum-mismatch" "${dir3}" \
  "L1 violated: applied migration '${M11_NAME}' checksum differs from the candidate source tree"

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
assert_check_only_fails "applied-row-not-in-source" "${dir4}" \
  "L1 violated: applied migration '20260101000000_v1_stray_not_in_source' is not in the candidate source tree"

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
assert_check_only_fails "non-task168-checksum-mismatch" "${dir5}" \
  "L1 violated: applied migration '20260912000000_v1_after_m11' checksum differs from the candidate source tree"

# ── negative ⑥ a pending source-only name sorts at/before M11 ────────────────
dir6="${TEST_ROOT}/n6"; make_source_tree "${dir6}" 20260910999999_v1_before_m11
applied_rows_for "${dir6}" "${TASK168_M1_M10[@]}" "${M11_NAME}" > "${TEST_ROOT}/rows-n6"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n6"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n6"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/n6-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_fails "pending-name-before-m11" "${dir6}" \
  "L3 violated: pending migration '20260910999999_v1_before_m11' sorts at or before M11"

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
assert_check_only_fails "unresolved-ledger-row" "${dir7}" \
  "L4 violated: 1 unresolved migration attempt(s) in the ledger"

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
assert_check_only_fails "m11-tampered-consistently" "${dir8}" \
  "M11 checksum in the candidate source tree does not match the pinned value"

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
assert_check_only_fails "receipt-bound-to-other-database" "${dir9}" \
  "StageB MIGRATION_COMMITTED receipt is missing"
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/state"

# ── negative ⑩ a receipt exists but in the OLD (pre-fix) shape/path this
#    script used to read -- ${STATE}/task168-final/transition.json with a
#    "status" field on runtime-verification.json -- instead of the real
#    producer's ${STATE}/task168/<sha>/migration-stage.json. A regression
#    back to reading that shape must be indistinguishable from "no receipt
#    at all", not silently accepted. ─────────────────────────────────────────
dir10="${TEST_ROOT}/n10"; make_source_tree "${dir10}"
applied_rows_for "${dir10}" "${TASK168_M1_M10[@]}" "${M11_NAME}" > "${TEST_ROOT}/rows-n10"
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/n10-state"
old_shape_dir="${ALPHA_RELEASE_STATE_DIR}/task168-final"
mkdir -p "${old_shape_dir}"
cat > "${old_shape_dir}/transition.json" <<EOF
{"schemaVersion":1,"kind":"task168StageBMigration","status":"MIGRATION_COMMITTED","databaseIdentity":"${FAKE_DB_ID}","m11Sha256":"${M11_SHA}","completedAt":"2026-09-14T00:00:00Z"}
EOF
old_shape_sha="$(sha256sum "${old_shape_dir}/transition.json" | awk '{print $1}')"
cat > "${old_shape_dir}/runtime-verification.json" <<EOF
{"schemaVersion":1,"kind":"task168StageBRuntimeVerification","status":"COMPLETED","databaseIdentity":"${FAKE_DB_ID}","migrationReceiptSha256":"${old_shape_sha}"}
EOF
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n10"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n10"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/n10-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_fails "old-shape-receipt-not-recognized" "${dir10}" \
  "StageB MIGRATION_COMMITTED receipt is missing"
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/state"

# ── negative ⑪ a ledger row has BOTH finished_at and rolled_back_at set --
#    a contradictory state Prisma itself never produces but L4 must still
#    reject rather than silently drop. ───────────────────────────────────────
dir11="${TEST_ROOT}/n11"; make_source_tree "${dir11}"
{
  applied_rows_for "${dir11}" "${TASK168_M1_M10[@]}" "${M11_NAME}"
  ledger_row "20260101000000_v1_contradictory_row" dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd t t
} > "${TEST_ROOT}/rows-n11"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n11"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n11"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/n11-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_fails "contradictory-ledger-row" "${dir11}" \
  "L4 violated: 1 ledger row(s) have both finished_at and rolled_back_at set"

# ── negative ⑫ a Task168 migration (M1) has TWO applied ledger rows, both
#    with its own correct checksum. _prisma_migrations keys on an id
#    column, not migration_name, so this is possible on a corrupted table;
#    an associative array keyed by name would silently collapse them to a
#    single entry, and since both rows carry the SAME (correct) checksum
#    every other check (L1's per-name comparison, L2's pinned-M11 check)
#    would stay green -- only an explicit "seen twice" check catches the
#    duplicate row itself. ───────────────────────────────────────────────
dir12="${TEST_ROOT}/n12"; make_source_tree "${dir12}"
{
  ledger_row "${TASK168_M1_M10[0]}" "$(source_sha "${dir12}" "${TASK168_M1_M10[0]}")" t f
  ledger_row "${TASK168_M1_M10[0]}" "$(source_sha "${dir12}" "${TASK168_M1_M10[0]}")" t f
  applied_rows_for "${dir12}" "${TASK168_M1_M10[@]:1}" "${M11_NAME}"
} > "${TEST_ROOT}/rows-n12"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n12"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n12"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/n12-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_fails "duplicate-applied-row" "${dir12}" \
  "L2 violated: migration '${TASK168_M1_M10[0]}' has more than one applied ledger row"

# ── negative ⑬ a migration-stage.json with every binding field correct
#    (databaseIdentity, m11Sha256, stage) EXCEPT `kind`, which is wrong --
#    only the explicit kind check distinguishes a real StageB migration
#    receipt from some other unrelated JSON file that happens to sit at the
#    same path and carry the same binding fields. ───────────────────────────
dir13="${TEST_ROOT}/n13"; make_source_tree "${dir13}"
applied_rows_for "${dir13}" "${TASK168_M1_M10[@]}" "${M11_NAME}" > "${TEST_ROOT}/rows-n13"
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/n13-state"
wrong_kind_dir="${ALPHA_RELEASE_STATE_DIR}/task168/1111111111111111111111111111111111111111"
mkdir -p "${wrong_kind_dir}"
# Every OTHER binding field, including a valid manifest/manifestSha256, must
# be correct so that flipping `kind` back (the mutation below) leaves the
# receipt fully accepted -- otherwise removing the kind check alone would
# still be masked by an incidental "manifest missing" failure and this
# negative would no longer be testing what its name says.
wrong_kind_manifest="$(write_manifest "${wrong_kind_dir}" "")"
wrong_kind_manifest_sha="$(sha256sum "${wrong_kind_manifest}" | awk '{print $1}')"
cat > "${wrong_kind_dir}/migration-stage.json" <<EOF
{"schemaVersion":1,"kind":"someOtherReceiptKind","status":"MIGRATION_COMMITTED","stage":"stageBFinal","releaseSha":"1111111111111111111111111111111111111111","databaseIdentity":"${FAKE_DB_ID}","m11Sha256":"${M11_SHA}","manifest":"${wrong_kind_manifest}","manifestSha256":"${wrong_kind_manifest_sha}","completedAt":"2026-09-14T00:00:00Z"}
EOF
wrong_kind_sha="$(sha256sum "${wrong_kind_dir}/migration-stage.json" | awk '{print $1}')"
cat > "${wrong_kind_dir}/runtime-verification.json" <<EOF
{"schemaVersion":1,"kind":"task168StageBRuntimeVerification","migrationReceiptSha256":"${wrong_kind_sha}","ledgerCount":11,"completedAt":"2026-09-14T00:05:00Z"}
EOF
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n13"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n13"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/n13-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_fails "receipt-wrong-kind" "${dir13}" \
  "StageB MIGRATION_COMMITTED receipt is missing"
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/state"

# ── negative ⑭ a migration-stage.json bound correctly in every field but
#    status -- MIGRATION_DIAGNOSIS_REQUIRED is a real status the producer
#    writes on a FAILED StageB run (M11 RAISEd; writer stays stopped, no
#    commit). A receipt in that state must never be read as "M11
#    committed". ─────────────────────────────────────────────────────────────
dir14="${TEST_ROOT}/n14"; make_source_tree "${dir14}"
applied_rows_for "${dir14}" "${TASK168_M1_M10[@]}" "${M11_NAME}" > "${TEST_ROOT}/rows-n14"
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/n14-state"
diagnosis_dir="${ALPHA_RELEASE_STATE_DIR}/task168/1111111111111111111111111111111111111111"
mkdir -p "${diagnosis_dir}"
# Same reasoning as negative ⑬: a valid manifest/manifestSha256 must be
# present so that fixing `status` back (the mutation below) leaves the
# receipt fully accepted, isolating the status check.
diagnosis_manifest="$(write_manifest "${diagnosis_dir}" "")"
diagnosis_manifest_sha="$(sha256sum "${diagnosis_manifest}" | awk '{print $1}')"
cat > "${diagnosis_dir}/migration-stage.json" <<EOF
{"schemaVersion":1,"kind":"task168StageBMigration","status":"MIGRATION_DIAGNOSIS_REQUIRED","stage":"stageBFinal","releaseSha":"1111111111111111111111111111111111111111","databaseIdentity":"${FAKE_DB_ID}","m11Sha256":"${M11_SHA}","manifest":"${diagnosis_manifest}","manifestSha256":"${diagnosis_manifest_sha}","failureReason":"M11 precondition RAISE","failedAt":"2026-09-14T00:00:00Z"}
EOF
diagnosis_sha="$(sha256sum "${diagnosis_dir}/migration-stage.json" | awk '{print $1}')"
cat > "${diagnosis_dir}/runtime-verification.json" <<EOF
{"schemaVersion":1,"kind":"task168StageBRuntimeVerification","migrationReceiptSha256":"${diagnosis_sha}","ledgerCount":11,"completedAt":"2026-09-14T00:05:00Z"}
EOF
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n14"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n14"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/n14-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_fails "receipt-diagnosis-required-status" "${dir14}" \
  "StageB MIGRATION_COMMITTED receipt is missing"
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

# ── positive ⓒ a resolved-rolled-back row AT OR BEFORE M11 coexists
#    (finished_at NULL, rolled_back_at NOT NULL) AND matches the StageB
#    receipt's resolved-attempt snapshot exactly — excluded from L1/L2/L4,
#    and the resolved-snapshot binding must ACCEPT it (not merely fail to
#    reject it via L1/L2/L4's own exclusion; see negative ⑮ for the case
#    where it does NOT match). ────────────────────────────────────────────
dirc="${TEST_ROOT}/pc"; make_source_tree "${dirc}"
{
  applied_rows_for "${dirc}" "${TASK168_M1_M10[@]}" "${M11_NAME}"
  ledger_row "20260101000000_v1_old_failed_attempt" cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc f t
} > "${TEST_ROOT}/rows-pc"
resolved_attempt_row "20260101000000_v1_old_failed_attempt" cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc "2026-01-02 00:00:00+00" > "${TEST_ROOT}/resolved-pc"
resolved_snapshot_pc="$(cat "${TEST_ROOT}/resolved-pc")"
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/pc-state"
write_receipts "${ALPHA_RELEASE_STATE_DIR}" "${FAKE_DB_ID}" "${M11_SHA}" \
  1111111111111111111111111111111111111111 MIGRATION_COMMITTED "${resolved_snapshot_pc}"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-pc"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-pc"
export RESOLVED_ATTEMPT_ROWS_FILE="${TEST_ROOT}/resolved-pc"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/pc-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_passes "resolved-rolled-back-row-coexists" "${dirc}"
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/state"
unset RESOLVED_ATTEMPT_ROWS_FILE

# ── positive ⓓ a resolved-rolled-back row named AFTER M11 exists but is NOT
#    part of the StageB receipt's snapshot (StageB ran before this name
#    existed) — excluded from the resolved-snapshot comparison by name, per
#    the orchestrator's binding-scope decision, so it must not block a
#    deploy the shared (empty-snapshot) receipts would otherwise accept. ──
dird="${TEST_ROOT}/pd"; make_source_tree "${dird}"
applied_rows_for "${dird}" "${TASK168_M1_M10[@]}" "${M11_NAME}" > "${TEST_ROOT}/rows-pd"
resolved_attempt_row "20260916000000_v1_late_failed_attempt" dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd "2026-09-16 00:00:00+00" > "${TEST_ROOT}/resolved-pd"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-pd"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-pd"
export RESOLVED_ATTEMPT_ROWS_FILE="${TEST_ROOT}/resolved-pd"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/pd-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_passes "resolved-row-after-m11-excluded-from-snapshot" "${dird}"
unset RESOLVED_ATTEMPT_ROWS_FILE

# ── positive ⓔ a MIGRATION_COMMITTED_RECOVERED receipt (deploy-alpha-stage-b.sh's
#    R-A SSM-timeout recovery path) -- the accepted-status branch at the top of
#    check-only exists specifically for this shape, which carries no `manifest`
#    field at all, only `manifestSha256`. Must still resolve and verify the
#    manifest via the sibling file, not fail looking for a field this receipt
#    variant never has. ─────────────────────────────────────────────────────
dire="${TEST_ROOT}/pe"; make_source_tree "${dire}"
applied_rows_for "${dire}" "${TASK168_M1_M10[@]}" "${M11_NAME}" > "${TEST_ROOT}/rows-pe"
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/pe-state"
write_receipts "${ALPHA_RELEASE_STATE_DIR}" "${FAKE_DB_ID}" "${M11_SHA}" \
  1111111111111111111111111111111111111111 MIGRATION_COMMITTED_RECOVERED
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-pe"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-pe"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/pe-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_passes "migration-committed-recovered-receipt" "${dire}"
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/state"

# ── negative ⑮ a resolved-rolled-back row AT OR BEFORE M11 exists but does
#    NOT match the StageB receipt's resolved-attempt snapshot — the shared
#    receipts (from line ~341) claim an EMPTY snapshot, but the ledger has
#    one. Must reject (spec L4's resolved-snapshot binding). ───────────────
dir15="${TEST_ROOT}/n15"; make_source_tree "${dir15}"
{
  applied_rows_for "${dir15}" "${TASK168_M1_M10[@]}" "${M11_NAME}"
  ledger_row "20260101000000_v1_old_failed_attempt" cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc f t
} > "${TEST_ROOT}/rows-n15"
resolved_attempt_row "20260101000000_v1_old_failed_attempt" cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc "2026-01-02 00:00:00+00" > "${TEST_ROOT}/resolved-n15"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n15"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n15"
export RESOLVED_ATTEMPT_ROWS_FILE="${TEST_ROOT}/resolved-n15"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/n15-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_fails "resolved-snapshot-mismatch" "${dir15}" \
  "L4 violated: rolled-back migration-attempt snapshot at or before M11 differs from the StageB receipt"
unset RESOLVED_ATTEMPT_ROWS_FILE

# ── negative ⑯ the StageB receipt's manifest file has changed since it was
#    written (its bytes no longer match manifestSha256) — must reject even
#    though the receipt itself, the ledger, and the manifest's OWN JSON
#    content (still a valid, matching resolvedMigrationAttemptsSha256) are
#    otherwise clean. Only appending one byte after write_receipts wrote a
#    correct manifest, so the resolved-snapshot check alone could not also
#    catch this (isolating what mutation "manifest-checksum-check-removed"
#    below is meant to prove). ──────────────────────────────────────────────
dir16="${TEST_ROOT}/n16"; make_source_tree "${dir16}"
applied_rows_for "${dir16}" "${TASK168_M1_M10[@]}" "${M11_NAME}" > "${TEST_ROOT}/rows-n16"
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/n16-state"
write_receipts "${ALPHA_RELEASE_STATE_DIR}" "${FAKE_DB_ID}" "${M11_SHA}"
printf ' ' >> "${ALPHA_RELEASE_STATE_DIR}/task168/1111111111111111111111111111111111111111/manifest.json"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n16"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n16"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/n16-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_fails "manifest-checksum-mismatch" "${dir16}" \
  "StageB manifest file named by the migration receipt has changed since StageB ran"
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/state"

# ── negative ⑰ migration-stage.json is present and fully valid/bound, but
#    its runtime-verification.json is missing entirely — the scenario the
#    original suite never exercised (no negative had a receipt WITHOUT a
#    runtime-verification.json; only "no receipt at all" was covered). ─────
dir17="${TEST_ROOT}/n17"; make_source_tree "${dir17}"
applied_rows_for "${dir17}" "${TASK168_M1_M10[@]}" "${M11_NAME}" > "${TEST_ROOT}/rows-n17"
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/n17-state"
write_receipts "${ALPHA_RELEASE_STATE_DIR}" "${FAKE_DB_ID}" "${M11_SHA}"
rm -f "${ALPHA_RELEASE_STATE_DIR}/task168/1111111111111111111111111111111111111111/runtime-verification.json"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n17"
export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n17"
export TABLE_EXISTS=t
export MIGRATE_RAN_FLAG="${TEST_ROOT}/n17-migrate-ran"
: > "${CALL_LOG}"
assert_check_only_fails "migration-receipt-without-runtime-verification" "${dir17}" \
  "StageB runtimeVerification receipt is missing"
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/state"

if [[ "${negatives_failed}" -ne 0 || "${positives_failed}" -ne 0 ]]; then
  echo "[task168-final-steady] FAILED: ${negatives_failed} negative(s), ${positives_failed} positive(s)" >&2
  exit 1
fi
echo "[task168-final-steady] all 17 negatives + 5 positives passed"

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

# StageB receipt DB-identity binding removed from the migration-receipt scan
# filter (negative ⑨/dir9's receipt is bound to a different database with an
# otherwise-clean M1-M11 ledger, so only this clause catches it -- the
# runtime-verification.json side has no databaseIdentity of its own to
# remove; its DB binding is transitive through migrationReceiptSha256).
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/n9-state"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n9"; export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n9"
export TABLE_EXISTS=t; export MIGRATE_RAN_FLAG="${TEST_ROOT}/mut5-migrate-ran"
mutation_total=$((mutation_total + 1))
if mutate_and_check "receipt-db-binding-removed" \
  '.databaseIdentity==$db and .m11Sha256==$m11' \
  '.m11Sha256==$m11' \
  "${dir9}"; then
  mutation_reds=$((mutation_reds + 1))
fi
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/state"

# StageB runtime-verification.json's binding to the migration receipt
# removed -- an unrelated/stale runtime-verification.json (e.g. left over
# from a different release sha) would then be accepted for any matching
# migration receipt.
mutation_total=$((mutation_total + 1))
scratch5b="${TEST_ROOT}/mut-runtime-verification-binding-removed"
mkdir -p "${scratch5b}"
python3 - "${SCRIPT}" "${scratch5b}/task168-final-steady-migrate.sh" <<'PYEOF'
import sys
src_path, out_path = sys.argv[1], sys.argv[2]
src = open(src_path, encoding='utf-8').read()
old = '.schemaVersion==1 and .kind=="task168StageBRuntimeVerification" and .migrationReceiptSha256==$receiptSha and .ledgerCount==11'
new = '.schemaVersion==1 and .kind=="task168StageBRuntimeVerification" and .ledgerCount==11'
c = src.count(old)
if c != 1:
    raise SystemExit(f'expected exactly 1 occurrence, found {c}: {old!r}')
open(out_path, 'w', encoding='utf-8').write(src.replace(old, new, 1))
PYEOF
# A runtime-verification.json bound to a DIFFERENT (unrelated) migration
# receipt sha, sitting next to a legitimate migration-stage.json for dira's
# clean M1-M11 ledger -- only the migrationReceiptSha256 check catches this.
dir5b="${TEST_ROOT}/n5b-state"
write_receipts "${dir5b}" "${FAKE_DB_ID}" "${M11_SHA}"
printf '{"schemaVersion":1,"kind":"task168StageBRuntimeVerification","migrationReceiptSha256":"%s","ledgerCount":11,"completedAt":"2026-09-14T00:05:00Z"}\n' \
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' \
  > "${dir5b}/task168/1111111111111111111111111111111111111111/runtime-verification.json"
compose_prod5b="${dira}/compose-prod.yml"; compose_alpha5b="${dira}/compose-alpha.yml"; env_file5b="${dira}/.env"
export ALPHA_RELEASE_STATE_DIR="${dir5b}"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-pa"; export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-pa"
export TABLE_EXISTS=t; export MIGRATE_RAN_FLAG="${TEST_ROOT}/mut5b-migrate-ran"
set +e
bash "${scratch5b}/task168-final-steady-migrate.sh" --check-only --source-dir "${dira}" \
  --compose-prod "${compose_prod5b}" --compose-alpha "${compose_alpha5b}" --env-file "${env_file5b}" >/dev/null 2>&1
rc5b=$?
set -e
if [[ "${rc5b}" -eq 0 ]]; then
  echo "[mutation runtime-verification-binding-removed] red (correctly turned an unbound runtime-verification.json into a false accept)"
  mutation_reds=$((mutation_reds + 1))
else
  echo "[mutation runtime-verification-binding-removed] NOT red — mutation did not weaken the check as expected" >&2
fi
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/state"

# L4's contradictory-row rejection (finished_at NOT NULL AND rolled_back_at
# NOT NULL) removed: negative ⑪ (dir11) turns red.
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n11"; export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n11"
export TABLE_EXISTS=t; export MIGRATE_RAN_FLAG="${TEST_ROOT}/mut-l4-contradictory-migrate-ran"
mutation_total=$((mutation_total + 1))
if mutate_and_check "l4-contradictory-removed" \
  '[[ "${contradictory_count}" -eq 0 ]] || fail "L4 violated: ${contradictory_count} ledger row(s) have both finished_at and rolled_back_at set"' \
  ':' \
  "${dir11}"; then
  mutation_reds=$((mutation_reds + 1))
fi

# L2's duplicate-applied-row rejection removed: negative ⑫ (dir12, M11
# applied twice with different checksums) turns red -- the associative
# array would otherwise silently collapse both rows into whichever the
# ledger query happens to read last.
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n12"; export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n12"
export TABLE_EXISTS=t; export MIGRATE_RAN_FLAG="${TEST_ROOT}/mut-l2-duplicate-migrate-ran"
mutation_total=$((mutation_total + 1))
if mutate_and_check "l2-duplicate-applied-row-removed" \
  '[[ -z "${APPLIED_SHA[${name}]+x}" ]] || fail "L2 violated: migration '"'"'${name}'"'"' has more than one applied ledger row"' \
  ':' \
  "${dir12}"; then
  mutation_reds=$((mutation_reds + 1))
fi

# The migration-receipt scan's `kind` check removed: negative ⑬ (a JSON
# file at the right path with every OTHER binding field correct but a
# wrong `kind`) turns red.
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/n13-state"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n13"; export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n13"
export TABLE_EXISTS=t; export MIGRATE_RAN_FLAG="${TEST_ROOT}/mut-kind-check-migrate-ran"
mutation_total=$((mutation_total + 1))
if mutate_and_check "receipt-kind-check-removed" \
  '.kind=="task168StageBMigration" and .stage=="stageBFinal" and' \
  '.stage=="stageBFinal" and' \
  "${dir13}"; then
  mutation_reds=$((mutation_reds + 1))
fi
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/state"

# The migration-receipt scan's `status` check removed: negative ⑭ (a real
# MIGRATION_DIAGNOSIS_REQUIRED receipt from a FAILED StageB run, otherwise
# correctly bound) turns red.
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/n14-state"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n14"; export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n14"
export TABLE_EXISTS=t; export MIGRATE_RAN_FLAG="${TEST_ROOT}/mut-status-check-migrate-ran"
mutation_total=$((mutation_total + 1))
if mutate_and_check "receipt-status-check-removed" \
  '(.status=="MIGRATION_COMMITTED" or .status=="MIGRATION_COMMITTED_RECOVERED") and' \
  '' \
  "${dir14}"; then
  mutation_reds=$((mutation_reds + 1))
fi
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/state"

# Receipt path/shape regression: reverting STAGE_B_STATE_ROOT back to the old
# (wrong) task168-final/ location must make even a LEGITIMATE StageB
# completion (positive ⓐ, real receipts under task168/<sha>/) unreadable --
# proving this suite would catch a regression back to the path every real
# StageB run never writes to (this is the exact defect this fix closes: it
# would otherwise permanently block every post-StageB Alpha deploy). Checked
# directly, like the exact-match-reversion mutation below, since the
# expected direction is PASS -> FAIL, not a false accept.
mutation_total=$((mutation_total + 1))
scratch5c="${TEST_ROOT}/mut-state-root-path-reverted"
mkdir -p "${scratch5c}"
OLD_SNIPPET='STAGE_B_STATE_ROOT="${ALPHA_RELEASE_STATE_DIR:-/home/ec2-user/.teameet-alpha-releases}/task168"' \
  NEW_SNIPPET='STAGE_B_STATE_ROOT="${ALPHA_RELEASE_STATE_DIR:-/home/ec2-user/.teameet-alpha-releases}/task168-final"' \
  SRC="${SCRIPT}" OUT="${scratch5c}/task168-final-steady-migrate.sh" python3 - <<'PYEOF'
import os
src = open(os.environ['SRC'], 'r', encoding='utf-8').read()
old = os.environ['OLD_SNIPPET']
new = os.environ['NEW_SNIPPET']
count = src.count(old)
if count != 1:
    raise SystemExit(f'expected exactly 1 occurrence of the mutation target, found {count}')
open(os.environ['OUT'], 'w', encoding='utf-8').write(src.replace(old, new, 1))
PYEOF
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-pa"; export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-pa"
export TABLE_EXISTS=t; export MIGRATE_RAN_FLAG="${TEST_ROOT}/mut-path-reverted-migrate-ran"
set +e
bash "${scratch5c}/task168-final-steady-migrate.sh" --check-only --source-dir "${dira}" \
  --compose-prod "${dira}/compose-prod.yml" --compose-alpha "${dira}/compose-alpha.yml" --env-file "${dira}/.env" >/dev/null 2>&1
rc5c=$?
set -e
if [[ "${rc5c}" -ne 0 ]]; then
  echo "[mutation state-root-path-reverted] red (a legitimate post-StageB deploy would now be permanently rejected)"
  mutation_reds=$((mutation_reds + 1))
else
  echo "[mutation state-root-path-reverted] NOT red -- reverting the state root path did not break the legitimate scenario as expected" >&2
fi

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

# 13. The resolved-attempt snapshot check removed: negative ⑮ (dir15, a
#     resolved row at/before M11 the shared receipts' snapshot does not
#     account for) turns red.
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/state"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n15"; export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n15"
export RESOLVED_ATTEMPT_ROWS_FILE="${TEST_ROOT}/resolved-n15"
export TABLE_EXISTS=t; export MIGRATE_RAN_FLAG="${TEST_ROOT}/mut-resolved-snapshot-removed-migrate-ran"
mutation_total=$((mutation_total + 1))
if mutate_and_check "resolved-snapshot-check-removed" \
  '[[ "${resolved_snapshot_sha}" == "${expected_resolved_sha}" ]] || fail '"'"'L4 violated: rolled-back migration-attempt snapshot at or before M11 differs from the StageB receipt'"'"'' \
  ':' \
  "${dir15}"; then
  mutation_reds=$((mutation_reds + 1))
fi
unset RESOLVED_ATTEMPT_ROWS_FILE

# 14. The StageB manifest checksum check removed: negative ⑯ (dir16, a
#     manifest file tampered by one appended byte, its JSON content still
#     otherwise valid) turns red.
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/n16-state"
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-n16"; export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-n16"
export TABLE_EXISTS=t; export MIGRATE_RAN_FLAG="${TEST_ROOT}/mut-manifest-sha-removed-migrate-ran"
mutation_total=$((mutation_total + 1))
if mutate_and_check "manifest-checksum-check-removed" \
  '[[ "$(sha "${migration_manifest}")" == "${migration_manifest_sha}" ]] || fail '"'"'StageB manifest file named by the migration receipt has changed since StageB ran'"'"'' \
  ':' \
  "${dir16}"; then
  mutation_reds=$((mutation_reds + 1))
fi
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/state"

# 15. Manifest-path regression: trusting the receipt's OWN `.manifest` field
#     again (instead of resolving the sibling `manifest.json` next to the
#     receipt) must break the legitimate positive ⓐ scenario -- its
#     `.manifest` field points at a path that is never created (write_receipts
#     mirrors the real producers' /tmp path the SSM command's EXIT trap
#     deletes). Checked directly, like state-root-path-reverted above, since
#     the expected direction is PASS -> FAIL, not a false accept.
mutation_total=$((mutation_total + 1))
scratch7="${TEST_ROOT}/mut-manifest-path-trusted-from-receipt"
mkdir -p "${scratch7}"
OLD_SNIPPET='migration_manifest="$(dirname "${migration_receipt}")/manifest.json"' \
  NEW_SNIPPET='migration_manifest="$(jq -er '"'"'.manifest'"'"' "${migration_receipt}")" || fail '"'"'StageB migration receipt does not name its manifest file'"'"'' \
  SRC="${SCRIPT}" OUT="${scratch7}/task168-final-steady-migrate.sh" python3 - <<'PYEOF'
import os
src = open(os.environ['SRC'], 'r', encoding='utf-8').read()
old = os.environ['OLD_SNIPPET']
new = os.environ['NEW_SNIPPET']
count = src.count(old)
if count != 1:
    raise SystemExit(f'expected exactly 1 occurrence of the mutation target, found {count}')
open(os.environ['OUT'], 'w', encoding='utf-8').write(src.replace(old, new, 1))
PYEOF
export LEDGER_ROWS_BEFORE_FILE="${TEST_ROOT}/rows-pa"; export LEDGER_ROWS_AFTER_FILE="${TEST_ROOT}/rows-pa"
export TABLE_EXISTS=t; export MIGRATE_RAN_FLAG="${TEST_ROOT}/mut-manifest-path-trusted-migrate-ran"
set +e
bash "${scratch7}/task168-final-steady-migrate.sh" --check-only --source-dir "${dira}" \
  --compose-prod "${dira}/compose-prod.yml" --compose-alpha "${dira}/compose-alpha.yml" --env-file "${dira}/.env" >/dev/null 2>&1
rc7=$?
set -e
if [[ "${rc7}" -ne 0 ]]; then
  echo "[mutation manifest-path-trusted-from-receipt] red (a legitimate post-StageB deploy would now be permanently rejected)"
  mutation_reds=$((mutation_reds + 1))
else
  echo "[mutation manifest-path-trusted-from-receipt] NOT red -- trusting the receipt's .manifest field did not break the legitimate scenario as expected" >&2
fi

echo "[task168-final-steady] mutation reds: ${mutation_reds}/${mutation_total} (expected 15/15)"
if [[ "${mutation_reds}" -ne 15 ]]; then
  echo "[task168-final-steady] FAILED: expected all 15 mutations to weaken the check as documented" >&2
  exit 1
fi

echo "[task168-final-steady] passed"

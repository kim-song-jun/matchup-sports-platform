#!/usr/bin/env bash
# Real test for deploy/deploy-alpha.sh's ordering guarantee around the Task
# 168 final-steady check-only gate (spec §4 PR-B, "머지 순서 방어"): the gate
# must run BEFORE activate_alpha_release_source, and this path must never
# set task168_irreversible -- an ordinary failure after activation must
# still take the normal restore_active_release path, not be left half
# switched over (the D-5 failure mode this path replaced).
#
# deploy-alpha.sh itself cannot run end-to-end on a dev machine (it reads
# /proc/loadavg and /proc/meminfo, needs a real EC2 host, AWS/ECR
# credentials, and a live release-state directory), so this test extracts
# the exact executable statements between the two anchor lines below --
# postgres bring-up through the two lines that flip source_activated and
# runtime_mutated to true, i.e. everything up to (but not including) the
# /proc-reading preflight block -- and runs that extracted segment as a
# real bash subprocess against fake `compose`/`write_candidate_manifest`/
# `prepare_alpha_release_source`/`activate_alpha_release_source` and a real
# `docker` binary faked the same way scripts/qa/test-task168-final-steady.sh
# fakes it (the check-only call inside the segment invokes the real
# task168-final-steady-migrate.sh script, unmodified). Because the segment
# is extracted from the CURRENT deploy-alpha.sh by content-anchored line
# numbers (not hardcoded), a mutation applied to a scratch copy of
# deploy-alpha.sh is picked up automatically when re-extracted and rerun.
#
# The extracted segment ends right after activation (source_activated /
# runtime_mutated flip to true) and does NOT reach the `--migrate` call
# further down the file -- that stretch is unreachable here for the same
# reason the whole script can't run end-to-end (the /proc-reading preflight
# block, `aws ecr`, and the real EC2 release-state layout sit in between).
# The retired StageA runner used to set task168_irreversible=true right
# there, and if that line ever comes back in the steady path, the ERR trap
# (restore_on_failure) skips restore_active_release on a `--migrate` failure
# -- the D-5 "half-switched, cannot restore" deploy -- with nothing in this
# file's segment-based checks able to see it. So this file also runs a
# static, whole-file assertion (assert_no_task168_irreversible_reassignment,
# below) that deploy-alpha.sh contains no `task168_irreversible=true`
# assignment anywhere, not only within the extracted segment: it is checked
# against the live file as a baseline, and against a scratch mutant with the
# assignment reinserted right before the --migrate call (mutation 3) to
# prove it actually catches that specific regression.
#
# Expected red counts per mutation, measured at the bottom of this file:
#   1. The check-only call moved to AFTER activate_alpha_release_source:
#      the "no StageB receipt" negative now reaches activation anyway.
#   2. `task168_irreversible=true` inserted right after
#      activate_alpha_release_source: the legitimate positive scenario now
#      leaves task168_irreversible=true instead of false.
#   3. `task168_irreversible=true` inserted right before the `--migrate`
#      call (outside the extracted segment, past deploy-alpha.sh's
#      /proc/aws/EC2-only stretch): the whole-file static assertion must
#      catch this even though the segment-based checks above cannot reach it.
set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly DEPLOY_ALPHA="${ROOT_DIR}/deploy/deploy-alpha.sh"
readonly STEADY_SCRIPT="${ROOT_DIR}/deploy/task168-final-steady-migrate.sh"
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

# ── extract the guarded segment from deploy-alpha.sh by content anchor,
#    not by hardcoded line numbers ───────────────────────────────────────────
extract_segment() {
  local script="$1" out="$2"
  local start_line end_line
  start_line="$(grep -n '^"\${compose\[@\]}" up -d v1_postgres$' "${script}" | head -1 | cut -d: -f1)"
  end_line="$(grep -n '^runtime_mutated=true$' "${script}" | head -1 | cut -d: -f1)"
  [[ -n "${start_line}" && -n "${end_line}" && "${start_line}" -lt "${end_line}" ]] || {
    echo "extract_segment: could not find both anchor lines in ${script}" >&2
    return 1
  }
  sed -n "${start_line},${end_line}p" "${script}" > "${out}"
}

# assert_no_task168_irreversible_reassignment SCRIPT -- fails (nonzero,
# message on stderr) if SCRIPT contains a `task168_irreversible=true`
# assignment anywhere. The only legitimate assignment in the whole file is
# the `=false` initializer; a bare read (`"${task168_irreversible}" ==
# true`) does not match this pattern because `==` and the surrounding
# `"${...}"` break the literal `task168_irreversible=true` substring.
assert_no_task168_irreversible_reassignment() {
  local script="$1"
  local hits
  hits="$(grep -n 'task168_irreversible=true' "${script}" || true)"
  [[ -z "${hits}" ]] || { printf '%s\n' "${hits}" >&2; return 1; }
}

readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

extract_segment "${DEPLOY_ALPHA}" "${TEST_ROOT}/baseline-segment.sh" ||
  { echo "[task168-alpha-steady-wiring] FAILED: baseline segment extraction" >&2; exit 1; }

if ! assert_no_task168_irreversible_reassignment "${DEPLOY_ALPHA}"; then
  echo "[task168-alpha-steady-wiring] FAILED: deploy-alpha.sh assigns task168_irreversible=true somewhere -- the steady path must never do this (see :75 and :124-125)" >&2
  exit 1
fi

# ── fake docker (same convention as test-task168-final-steady.sh; the
#    check-only call inside the segment invokes the real steady script,
#    which builds its own `docker compose ...` array) ──────────────────────
mock_bin="${TEST_ROOT}/mockbin"
mkdir -p "${mock_bin}"
cat > "${mock_bin}/docker" <<'DOCKEREOF'
#!/usr/bin/env bash
set -Eeuo pipefail
: "${TABLE_EXISTS:?}" "${DB_ID:?}" "${LEDGER_ROWS_FILE:?}"
case "$*" in
  *'exec -T v1_postgres psql'*)
    sql="${*: -1}"
    case "${sql}" in
      *current_database*) printf '%s\n' "${DB_ID}" ;;
      *to_regclass*) printf '%s\n' "${TABLE_EXISTS}" ;;
      *'FROM "_prisma_migrations" ORDER BY migration_name'*) cat "${LEDGER_ROWS_FILE}" ;;
      *) echo "fake docker: unrecognized SQL: ${sql}" >&2; exit 1 ;;
    esac
    ;;
  *)
    echo "fake docker: unrecognized invocation: $*" >&2
    exit 1
    ;;
esac
DOCKEREOF
chmod +x "${mock_bin}/docker"
export PATH="${mock_bin}:${PATH}"
export DB_ID="${FAKE_DB_ID}"
export TABLE_EXISTS=t

# ── fixture builders (subset of test-task168-final-steady.sh's; only a
#    single clean M1-M11 source tree and matching StageB receipts are
#    needed here since L1-L4 correctness is that file's job, not this
#    one's) ───────────────────────────────────────────────────────────────
make_source_tree() {
  local dir="$1"
  local migrations="${dir}/apps/v1_api/prisma/migrations"
  mkdir -p "${migrations}"
  printf 'provider = "postgresql"\n' > "${migrations}/migration_lock.toml"
  local name
  for name in "${TASK168_M1_M10[@]}"; do
    mkdir -p "${migrations}/${name}"
    printf -- '-- dummy migration %s\nSELECT 1;\n' "${name}" > "${migrations}/${name}/migration.sql"
  done
  mkdir -p "${migrations}/${M11_NAME}"
  cp "${M11_SOURCE}" "${migrations}/${M11_NAME}/migration.sql"
}
source_sha() { sha256sum "$1/apps/v1_api/prisma/migrations/$2/migration.sql" | awk '{print $1}'; }
ledger_row() { printf '%s|%s|%s|%s\n' "$1" "$2" "$3" "$4"; }
applied_rows_for() {
  local dir="$1"; shift
  local name
  for name in "$@"; do ledger_row "${name}" "$(source_sha "${dir}" "${name}")" t f; done
}
write_receipts() {
  local state_root="$1" db_id="$2" m11_sha="$3"
  local dir="${state_root}/task168/1111111111111111111111111111111111111111"
  mkdir -p "${dir}"
  cat > "${dir}/migration-stage.json" <<EOF
{"schemaVersion":1,"kind":"task168StageBMigration","status":"MIGRATION_COMMITTED","stage":"stageBFinal","releaseSha":"1111111111111111111111111111111111111111","databaseIdentity":"${db_id}","m11Sha256":"${m11_sha}","completedAt":"2026-09-14T00:00:00Z"}
EOF
  local migration_receipt_sha
  migration_receipt_sha="$(sha256sum "${dir}/migration-stage.json" | awk '{print $1}')"
  cat > "${dir}/runtime-verification.json" <<EOF
{"schemaVersion":1,"kind":"task168StageBRuntimeVerification","migrationReceiptSha256":"${migration_receipt_sha}","ledgerCount":11,"completedAt":"2026-09-14T00:05:00Z"}
EOF
}

readonly SOURCE_DIR="${TEST_ROOT}/source"
make_source_tree "${SOURCE_DIR}"
mkdir -p "${SOURCE_DIR}/deploy"
cp "${STEADY_SCRIPT}" "${SOURCE_DIR}/deploy/task168-final-steady-migrate.sh"
readonly CLEAN_LEDGER="${TEST_ROOT}/clean-ledger-rows"
applied_rows_for "${SOURCE_DIR}" "${TASK168_M1_M10[@]}" "${M11_NAME}" > "${CLEAN_LEDGER}"

# ── run the extracted segment as a real bash subprocess ────────────────────
# compose_mock: only `up -d v1_postgres` and `exec -T v1_postgres pg_isready`
# appear in the extracted segment (the check-only call inside it uses the
# real steady script's OWN `docker compose` array, faked via `docker` above,
# not this function).
compose_mock() {
  printf '%s\n' "compose $*" >> "${CALL_LOG}"
  case "$*" in
    'up -d v1_postgres') : ;;
    'exec -T v1_postgres pg_isready -U teameet_v1 -d teameet_v1') : ;;
    *) echo "compose_mock: unrecognized invocation: $*" >&2; return 1 ;;
  esac
}
write_candidate_manifest() { printf '%s\n' "write_candidate_manifest $*" >> "${CALL_LOG}"; }
prepare_alpha_release_source() { printf '%s\n' "prepare_alpha_release_source $*" >> "${CALL_LOG}"; }
activate_alpha_release_source() { printf '%s\n' "activate_alpha_release_source $*" >> "${CALL_LOG}"; }
export -f compose_mock write_candidate_manifest prepare_alpha_release_source activate_alpha_release_source

# run_segment SEGMENT_FILE STATE_DIR -> writes CALL_LOG, sets SEGMENT_RC and
# a trailing "FINAL_TASK168_IRREVERSIBLE=<true|false>" line in CALL_LOG.
run_segment() {
  local segment_file="$1" state_dir="$2"
  local wrapper="${TEST_ROOT}/wrapper.sh"
  {
    printf '#!/usr/bin/env bash\nset -Eeuo pipefail\n'
    printf 'compose=(compose_mock)\n'
    printf 'task168_irreversible=false\n'
    printf 'ALPHA_TASK168_STAGE=final\n'
    printf 'ALPHA_SOURCE_DIR=%q\n' "${SOURCE_DIR}"
    printf 'ALPHA_MANIFEST_FILE=%q\n' "${TEST_ROOT}/manifest.json"
    printf 'ALPHA_SHA=1111111111111111111111111111111111111111\n'
    printf 'ALPHA_SOURCE_SHA256=2222222222222222222222222222222222222222222222222222222222222222\n'
    printf 'COMPOSE_PROD=%q\n' "${TEST_ROOT}/compose-prod.yml"
    printf 'COMPOSE_ALPHA=%q\n' "${TEST_ROOT}/compose-alpha.yml"
    printf 'ENV_FILE=%q\n' "${TEST_ROOT}/env-file"
    printf 'V1_DB_USER=teameet_v1\nV1_DB_NAME=teameet_v1\n'
    cat "${segment_file}"
    printf '\nprintf "FINAL_TASK168_IRREVERSIBLE=%%s\\n" "${task168_irreversible}" >> %q\n' "${CALL_LOG}"
  } > "${wrapper}"
  : > "${TEST_ROOT}/manifest.json"; : > "${TEST_ROOT}/compose-prod.yml"; : > "${TEST_ROOT}/compose-alpha.yml"; : > "${TEST_ROOT}/env-file"
  export ALPHA_RELEASE_STATE_DIR="${state_dir}"
  export LEDGER_ROWS_FILE="${CLEAN_LEDGER}"
  set +e
  SEGMENT_OUTPUT="$(bash "${wrapper}" 2>&1)"
  SEGMENT_RC=$?
  set -e
}

failures=0

# ── negative: no StageB receipt -> check-only fails -> activation must
#    never be called and the segment must exit non-zero ────────────────────
export CALL_LOG="${TEST_ROOT}/n-calls.log"; : > "${CALL_LOG}"
run_segment "${TEST_ROOT}/baseline-segment.sh" "${TEST_ROOT}/no-receipt-state"
if [[ "${SEGMENT_RC}" -eq 0 ]]; then
  echo "NEGATIVE FAILED (no-stageb-receipt): segment unexpectedly succeeded" >&2
  echo "${SEGMENT_OUTPUT}" >&2
  failures=$((failures + 1))
elif grep -q 'activate_alpha_release_source' "${CALL_LOG}"; then
  echo "NEGATIVE FAILED (no-stageb-receipt): activate_alpha_release_source was called despite check-only failing" >&2
  cat "${CALL_LOG}" >&2
  failures=$((failures + 1))
else
  echo "[negative no-stageb-receipt] OK: check-only failed, activate_alpha_release_source never called, rc=${SEGMENT_RC}"
fi

# ── positive: clean M1-M11 ledger + valid StageB receipts -> check-only
#    passes -> activation IS called, and task168_irreversible is never
#    left true ────────────────────────────────────────────────────────────
readonly RECEIPT_STATE="${TEST_ROOT}/receipt-state"
write_receipts "${RECEIPT_STATE}" "${FAKE_DB_ID}" "${M11_SHA}"
export CALL_LOG="${TEST_ROOT}/p-calls.log"; : > "${CALL_LOG}"
run_segment "${TEST_ROOT}/baseline-segment.sh" "${RECEIPT_STATE}"
if [[ "${SEGMENT_RC}" -ne 0 ]]; then
  echo "POSITIVE FAILED (clean-m1-m11): segment unexpectedly failed" >&2
  echo "${SEGMENT_OUTPUT}" >&2
  cat "${CALL_LOG}" >&2
  failures=$((failures + 1))
elif ! grep -q 'activate_alpha_release_source' "${CALL_LOG}"; then
  echo "POSITIVE FAILED (clean-m1-m11): activate_alpha_release_source was never called" >&2
  failures=$((failures + 1))
elif ! grep -q '^FINAL_TASK168_IRREVERSIBLE=false$' "${CALL_LOG}"; then
  echo "POSITIVE FAILED (clean-m1-m11): task168_irreversible was left true" >&2
  cat "${CALL_LOG}" >&2
  failures=$((failures + 1))
else
  # Ordering: write_candidate_manifest/prepare/activate must all appear
  # AFTER the check-only call proved out (the segment's own set -e already
  # enforces this for the negative case; this positive-side check confirms
  # the call log records them in the file in the order the segment executed
  # them, i.e. activate is not somehow reachable before the segment's own
  # earlier statements ran).
  activate_line="$(grep -n 'activate_alpha_release_source' "${CALL_LOG}" | head -1 | cut -d: -f1)"
  prepare_line="$(grep -n 'prepare_alpha_release_source' "${CALL_LOG}" | head -1 | cut -d: -f1)"
  write_line="$(grep -n 'write_candidate_manifest' "${CALL_LOG}" | head -1 | cut -d: -f1)"
  if [[ "${write_line}" -lt "${prepare_line}" && "${prepare_line}" -lt "${activate_line}" ]]; then
    echo "[positive clean-m1-m11] OK: check-only passed, then write_candidate_manifest -> prepare_alpha_release_source -> activate_alpha_release_source, task168_irreversible stayed false"
  else
    echo "POSITIVE FAILED (clean-m1-m11): call order is not write -> prepare -> activate" >&2
    cat "${CALL_LOG}" >&2
    failures=$((failures + 1))
  fi
fi

if [[ "${failures}" -ne 0 ]]; then
  echo "[task168-alpha-steady-wiring] FAILED: ${failures} scenario(s)" >&2
  exit 1
fi
echo "[task168-alpha-steady-wiring] baseline negative + positive passed"

# ── mutation 1: move the check-only call to AFTER activate_alpha_release_source
mutation_reds=0
mutation_total=3
scratch1="${TEST_ROOT}/mut-check-moved-after-activate.sh"
python3 - "${DEPLOY_ALPHA}" "${scratch1}" <<'PYEOF'
import sys
src_path, out_path = sys.argv[1], sys.argv[2]
lines = open(src_path, encoding='utf-8').read().split('\n')
check_start = next(i for i, l in enumerate(lines) if l.startswith('bash "${ALPHA_SOURCE_DIR}/deploy/task168-final-steady-migrate.sh" \\'))
check_end = check_start
# The check-only invocation spans multiple continuation lines; capture all
# of them up to and including the one ending the argument list with
# --env-file "${ENV_FILE}" (no trailing backslash).
while '--env-file "${ENV_FILE}"' not in lines[check_end]:
    check_end += 1
    if check_end >= len(lines):
        raise SystemExit('did not find the end of the check-only invocation block')
block = lines[check_start:check_end + 1]
assert '--check-only' in ''.join(block), 'did not capture the check-only invocation block'
del lines[check_start:check_end + 1]
activate_idx = next(i for i, l in enumerate(lines) if l.startswith('activate_alpha_release_source "${ALPHA_SHA}"'))
for offset, line in enumerate(block):
    lines.insert(activate_idx + 1 + offset, line)
open(out_path, 'w', encoding='utf-8').write('\n'.join(lines))
PYEOF
extract_segment "${scratch1}" "${TEST_ROOT}/mut1-segment.sh" ||
  { echo "[mutation check-moved-after-activate] extraction failed" >&2; exit 1; }
export CALL_LOG="${TEST_ROOT}/mut1-calls.log"; : > "${CALL_LOG}"
run_segment "${TEST_ROOT}/mut1-segment.sh" "${TEST_ROOT}/no-receipt-state"
if [[ "${SEGMENT_RC}" -ne 0 ]] && ! grep -q 'activate_alpha_release_source' "${CALL_LOG}"; then
  echo "[mutation check-moved-after-activate] NOT red -- the no-receipt negative still refused before activation" >&2
else
  echo "[mutation check-moved-after-activate] red (activate_alpha_release_source ran even though check-only would have failed)"
  mutation_reds=$((mutation_reds + 1))
fi

# ── mutation 2: task168_irreversible=true re-inserted right after activation
scratch2="${TEST_ROOT}/mut-irreversible-reinserted.sh"
python3 - "${DEPLOY_ALPHA}" "${scratch2}" <<'PYEOF'
import sys
src_path, out_path = sys.argv[1], sys.argv[2]
lines = open(src_path, encoding='utf-8').read().split('\n')
idx = next(i for i, l in enumerate(lines) if l.startswith('activate_alpha_release_source "${ALPHA_SHA}"'))
lines.insert(idx + 1, 'task168_irreversible=true')
open(out_path, 'w', encoding='utf-8').write('\n'.join(lines))
PYEOF
extract_segment "${scratch2}" "${TEST_ROOT}/mut2-segment.sh" ||
  { echo "[mutation irreversible-reinserted] extraction failed" >&2; exit 1; }
export CALL_LOG="${TEST_ROOT}/mut2-calls.log"; : > "${CALL_LOG}"
run_segment "${TEST_ROOT}/mut2-segment.sh" "${RECEIPT_STATE}"
if grep -q '^FINAL_TASK168_IRREVERSIBLE=true$' "${CALL_LOG}"; then
  echo "[mutation irreversible-reinserted] red (task168_irreversible was left true on the legitimate path)"
  mutation_reds=$((mutation_reds + 1))
else
  echo "[mutation irreversible-reinserted] NOT red -- task168_irreversible was still false" >&2
  cat "${CALL_LOG}" >&2
fi

# ── mutation 3: task168_irreversible=true re-inserted right before the
#    `--migrate` call -- past the /proc/aws/EC2-only stretch the extracted
#    segment cannot reach, so only the whole-file static assertion (not the
#    segment-based checks above) can catch this one.
scratch3="${TEST_ROOT}/mut-irreversible-before-migrate.sh"
python3 - "${DEPLOY_ALPHA}" "${scratch3}" <<'PYEOF'
import sys
src_path, out_path = sys.argv[1], sys.argv[2]
lines = open(src_path, encoding='utf-8').read().split('\n')
idx = next(i for i, l in enumerate(lines) if l.startswith('bash "${ALPHA_SOURCE_DIR}/deploy/task168-final-steady-migrate.sh" \\') and lines[i + 1].strip().startswith('--migrate'))
lines.insert(idx, 'task168_irreversible=true')
open(out_path, 'w', encoding='utf-8').write('\n'.join(lines))
PYEOF
if assert_no_task168_irreversible_reassignment "${scratch3}"; then
  echo "[mutation irreversible-before-migrate] NOT red -- the static assertion missed a reassignment right before --migrate" >&2
else
  echo "[mutation irreversible-before-migrate] red (static assertion caught task168_irreversible=true right before --migrate)"
  mutation_reds=$((mutation_reds + 1))
fi

echo "[task168-alpha-steady-wiring] mutation reds: ${mutation_reds}/${mutation_total} (expected 3/3)"
if [[ "${mutation_reds}" -ne 3 ]]; then
  echo "[task168-alpha-steady-wiring] FAILED: expected all three mutations to weaken the guarantee as documented" >&2
  exit 1
fi

echo "[task168-alpha-steady-wiring] passed"

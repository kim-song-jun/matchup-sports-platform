#!/usr/bin/env bash
# Real test for assert_task168_m11_guard() (deploy/prod-release-common.sh)
# AND its actual effect inside deploy/deploy-prod.sh: whether
# `prisma migrate deploy` runs at all.
#
# Function-level calls into assert_task168_m11_guard alone (the previous
# version of this file) cannot catch a guard that is still called in the
# right place but neutralized (`|| true`, wrapped in `if false; then`), nor
# can a docker CALL LOG that is implemented as an exported shell function --
# assert_task168_m11_guard invokes docker through `sudo docker ...`, and
# `sudo` execs its argument as a new process, which never sees a shell
# function (verified: with `docker` as a function, scenario (iii)'s "no
# docker touched" check stayed vacuously true even when a docker call was
# injected ahead of the M11-absence early return). So this file instead:
#   - fakes `docker` as a real executable on PATH (so calls made via `sudo
#     docker ...` are actually recorded), and
#   - extracts the exact `assert_task168_m11_guard ...` through
#     `prisma migrate deploy` segment out of the CURRENT deploy-prod.sh by
#     content anchor (not hardcoded line numbers) and runs it as a real bash
#     subprocess, counting `prisma migrate deploy` invocations in the call
#     log -- the same "run the real flow, count the call" approach
#     scripts/qa/test-task168-final-steady.sh and
#     scripts/qa/test-task168-alpha-steady-wiring.sh use.
# deploy-prod.sh itself cannot run end-to-end here (ECR/AWS, a real EC2
# host, /proc reads before this point) -- the extracted segment starts
# exactly at the guard call, so none of that is needed.
#
# Scenarios:
#   (i)   M11 folder present in the candidate source + prod ledger does NOT
#         show M11 as an applied row -> guard fails, `prisma migrate
#         deploy` call count 0, segment exits non-zero.
#   (ii)  M11 folder present + prod ledger already shows M11 applied with
#         the pinned checksum -> guard passes, migrate deploy called once.
#   (iii) M11 folder absent from the candidate source (today's main) ->
#         guard is a no-op; migrate deploy called once; NO docker network/
#         psql call was made at all (checked via the real docker call log,
#         not a shell-function trick).
#   (iv)  M11 folder present but its BYTES are tampered (not the pinned
#         checksum), and the ledger happens to carry a row with that SAME
#         tampered checksum (a source-vs-ledger match) -> the m11_pinned_sha
#         check refuses before any DB/network call is made.
#
# Expected red counts per mutation, measured at the bottom of this file:
#   1. Guard verdict inverted (accepts mismatch, rejects match): (i) and
#      (ii) both turn red -- 2/2.
#   2. Guard call deleted from deploy-prod.sh entirely: (i) turns red (0
#      migrate-deploy calls becomes 1).
#   3. Guard call neutralized with `|| true` in place (still textually
#      before migrate deploy, so a static line-order check alone cannot see
#      this): (i) turns red.
#   4. `AND finished_at IS NOT NULL AND rolled_back_at IS NULL` removed from
#      the ledger query: a P3009-leftover row (finished_at NULL, same
#      pinned checksum) is wrongly accepted as "applied" -> (i)-shaped
#      scenario turns red.
#   5. Fail-open on a psql/docker error (the fail-closed `return 1` on
#      query_rc != 0 changed to fall back to the source checksum instead):
#      a psql failure is wrongly treated as "already applied" -> turns red.
#   6. The m11_pinned_sha check removed: scenario (iv)'s tampered-but-
#      self-consistent source+ledger pair is wrongly accepted -> turns red.
set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly DEPLOY_PROD="${ROOT_DIR}/deploy/deploy-prod.sh"
readonly PROD_RELEASE_COMMON="${ROOT_DIR}/deploy/prod-release-common.sh"
readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

readonly M11_NAME=20260911090000_retire_tournament_fixture_tables
readonly M11_SOURCE="${ROOT_DIR}/apps/v1_api/prisma/migrations/${M11_NAME}/migration.sql"
readonly M11_SHA=08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323
[[ -s "${M11_SOURCE}" ]] || { echo "fixture setup: M11 migration.sql is missing" >&2; exit 1; }
[[ "$(sha256sum "${M11_SOURCE}" | awk '{print $1}')" == "${M11_SHA}" ]] || {
  echo "fixture setup: M11 migration.sql does not match the pinned checksum" >&2
  exit 1
}

# ── extract "assert_task168_m11_guard ... through prisma migrate deploy"
#    from deploy-prod.sh by content anchor ──────────────────────────────────
extract_segment() {
  local script="$1" out="$2"
  local start_line end_line
  start_line="$(grep -n '^assert_task168_m11_guard "\${PROD_SOURCE_DIR}"$' "${script}" | head -1 | cut -d: -f1)"
  end_line="$(grep -n "^  'cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy'\$" "${script}" | head -1 | cut -d: -f1)"
  [[ -n "${start_line}" && -n "${end_line}" && "${start_line}" -lt "${end_line}" ]] || {
    echo "extract_segment: could not find both anchor lines in ${script}" >&2
    return 1
  }
  sed -n "${start_line},${end_line}p" "${script}" > "${out}"
}

extract_segment "${DEPLOY_PROD}" "${TEST_ROOT}/baseline-segment.sh" ||
  { echo "[task168-prod-guard] FAILED: baseline segment extraction" >&2; exit 1; }

# ── fake sudo (passthrough exec, same convention as
#    scripts/qa/test-prod-release-state.sh) and fake docker as a REAL
#    executable on PATH (not a shell function -- see header) ───────────────
mock_bin="${TEST_ROOT}/mockbin"
mkdir -p "${mock_bin}"
printf '#!/usr/bin/env bash\nexec "$@"\n' > "${mock_bin}/sudo"
chmod +x "${mock_bin}/sudo"

readonly SQL_EVAL="${TEST_ROOT}/eval_sql.py"
cat > "${SQL_EVAL}" <<'PYEOF'
import json, os, re, sys
sql = sys.argv[1]
fixture = json.load(open(os.environ['LEDGER_FIXTURE_FILE']))
m = re.search(r"migration_name = '([^']+)'", sql)
name = m.group(1) if m else None
want_finished = None
if 'finished_at IS NOT NULL' in sql:
    want_finished = True
elif 'finished_at IS NULL' in sql:
    want_finished = False
want_rolledback = None
if 'rolled_back_at IS NOT NULL' in sql:
    want_rolledback = True
elif 'rolled_back_at IS NULL' in sql:
    want_rolledback = False
for row in fixture:
    if row['name'] != name:
        continue
    if want_finished is not None and row['finished'] != want_finished:
        continue
    if want_rolledback is not None and row['rolledback'] != want_rolledback:
        continue
    print(row['checksum'])
    break
PYEOF

cat > "${mock_bin}/docker" <<DOCKEREOF
#!/usr/bin/env bash
set -Eeuo pipefail
: "\${CALL_LOG:?}"
printf '%s\n' "\$*" >> "\${CALL_LOG}"
case "\$*" in
  *'network ls --filter name=^deploy_default\$ --format {{.Name}}'*)
    [[ "\${NETWORK_OK:-true}" == true ]] && printf 'deploy_default\n'
    ;;
  *'--env-file'*'postgres:16-alpine sh -c'*)
    if [[ "\${PSQL_SHOULD_FAIL:-false}" == true ]]; then
      echo "fake docker: injected psql failure" >&2
      exit 1
    fi
    sql="\${*: -1}"
    python3 "${SQL_EVAL}" "\${sql}"
    ;;
  *)
    echo "fake docker: unrecognized invocation: \$*" >&2
    exit 1
    ;;
esac
DOCKEREOF
chmod +x "${mock_bin}/docker"
export PATH="${mock_bin}:${PATH}"

make_source_with_m11() {
  local dir="$1"
  mkdir -p "${dir}/apps/v1_api/prisma/migrations/${M11_NAME}"
  cp "${M11_SOURCE}" "${dir}/apps/v1_api/prisma/migrations/${M11_NAME}/migration.sql"
}
readonly SOURCE_WITH_M11="${TEST_ROOT}/source-with-m11"
make_source_with_m11 "${SOURCE_WITH_M11}"
readonly SOURCE_WITHOUT_M11="${TEST_ROOT}/source-without-m11"
mkdir -p "${SOURCE_WITHOUT_M11}/apps/v1_api/prisma/migrations"

# A source tree whose M11 file exists at the right path/name but whose BYTES
# were tampered -- must be refused by the m11_pinned_sha check alone, before
# any DB/network call, so the fixture's OWN checksum (used below to build a
# ledger row that happens to match it) is captured for that purpose.
readonly SOURCE_WITH_TAMPERED_M11="${TEST_ROOT}/source-with-tampered-m11"
mkdir -p "${SOURCE_WITH_TAMPERED_M11}/apps/v1_api/prisma/migrations/${M11_NAME}"
printf -- '-- tampered M11\nSELECT 1;\n' > "${SOURCE_WITH_TAMPERED_M11}/apps/v1_api/prisma/migrations/${M11_NAME}/migration.sql"
readonly TAMPERED_M11_SHA="$(sha256sum "${SOURCE_WITH_TAMPERED_M11}/apps/v1_api/prisma/migrations/${M11_NAME}/migration.sql" | awk '{print $1}')"

write_fixture() { printf '%s' "$1" > "${TEST_ROOT}/fixture.json"; }
readonly FIXTURE_EMPTY='[]'
readonly FIXTURE_APPLIED_MATCH="[{\"name\":\"${M11_NAME}\",\"checksum\":\"${M11_SHA}\",\"finished\":true,\"rolledback\":false}]"
# A P3009-leftover row: same migration name and the SAME pinned checksum,
# but finished_at is NULL (never completed) -- must NOT be treated as
# "already applied". Only the `AND finished_at IS NOT NULL AND
# rolled_back_at IS NULL` clause in the guard's own SQL excludes it.
readonly FIXTURE_UNFINISHED_SAME_CHECKSUM="[{\"name\":\"${M11_NAME}\",\"checksum\":\"${M11_SHA}\",\"finished\":false,\"rolledback\":false}]"

compose_mock() {
  printf '%s\n' "compose $*" >> "${CALL_LOG}"
  case "$*" in
    'run --rm --no-deps -T v1_api sh -c printf "%s" "$DATABASE_URL"')
      printf '%s' "postgresql://teameet_v1:pw@v1_postgres:5432/teameet_v1"
      ;;
    'run --rm --no-deps -T v1_api sh -c cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy')
      printf '%s\n' "MIGRATE_DEPLOY_CALLED" >> "${CALL_LOG}"
      ;;
    *)
      echo "compose_mock: unrecognized invocation: $*" >&2
      return 1
      ;;
  esac
}
export -f compose_mock

# run_segment SEGMENT_FILE SOURCE_DIR -> sets SEGMENT_RC, writes CALL_LOG
run_segment() {
  local segment_file="$1" source_dir="$2"
  local wrapper="${TEST_ROOT}/wrapper.sh"
  {
    printf '#!/usr/bin/env bash\nset -Eeuo pipefail\n'
    printf 'source %q\n' "${PROD_RELEASE_COMMON_FOR_RUN}"
    printf 'compose=(compose_mock)\n'
    printf 'PROD_SOURCE_DIR=%q\n' "${source_dir}"
    cat "${segment_file}"
  } > "${wrapper}"
  set +e
  SEGMENT_OUTPUT="$(bash "${wrapper}" 2>&1)"
  SEGMENT_RC=$?
  set -e
}

export PROD_RELEASE_COMMON_FOR_RUN="${PROD_RELEASE_COMMON}"
failures=0
migrate_deploy_count() { grep -c '^MIGRATE_DEPLOY_CALLED$' "${CALL_LOG}" 2>/dev/null || true; }

# ── (i) M11 in source, NOT in prod ledger -> guard fails, 0 migrate calls ───
write_fixture "${FIXTURE_EMPTY}"
export CALL_LOG="${TEST_ROOT}/i-calls.log"; : > "${CALL_LOG}"
export LEDGER_FIXTURE_FILE="${TEST_ROOT}/fixture.json"
run_segment "${TEST_ROOT}/baseline-segment.sh" "${SOURCE_WITH_M11}"
if [[ "${SEGMENT_RC}" -eq 0 ]]; then
  echo "(i) FAILED: segment unexpectedly succeeded" >&2
  echo "${SEGMENT_OUTPUT}" >&2
  failures=$((failures + 1))
elif [[ "$(migrate_deploy_count)" != 0 ]]; then
  echo "(i) FAILED: prisma migrate deploy was called despite the guard refusing" >&2
  cat "${CALL_LOG}" >&2
  failures=$((failures + 1))
else
  echo "[(i)] OK: guard refused (M11 in source, not applied in prod), migrate deploy call count 0"
fi

# ── (ii) M11 in source AND already applied in prod with the matching
#    checksum -> guard passes, migrate deploy called once ──────────────────
write_fixture "${FIXTURE_APPLIED_MATCH}"
export CALL_LOG="${TEST_ROOT}/ii-calls.log"; : > "${CALL_LOG}"
run_segment "${TEST_ROOT}/baseline-segment.sh" "${SOURCE_WITH_M11}"
if [[ "${SEGMENT_RC}" -ne 0 ]]; then
  echo "(ii) FAILED: segment unexpectedly failed" >&2
  echo "${SEGMENT_OUTPUT}" >&2
  failures=$((failures + 1))
elif [[ "$(migrate_deploy_count)" != 1 ]]; then
  echo "(ii) FAILED: expected exactly 1 prisma migrate deploy call, saw $(migrate_deploy_count)" >&2
  cat "${CALL_LOG}" >&2
  failures=$((failures + 1))
else
  echo "[(ii)] OK: guard passed (M11 already applied in prod), migrate deploy called once"
fi

# ── (iii) M11 absent from the candidate source (today's main) -> no-op,
#    migrate deploy called once, NO docker network/psql call at all ────────
write_fixture "${FIXTURE_EMPTY}"
export CALL_LOG="${TEST_ROOT}/iii-calls.log"; : > "${CALL_LOG}"
run_segment "${TEST_ROOT}/baseline-segment.sh" "${SOURCE_WITHOUT_M11}"
if [[ "${SEGMENT_RC}" -ne 0 ]]; then
  echo "(iii) FAILED: segment unexpectedly failed" >&2
  echo "${SEGMENT_OUTPUT}" >&2
  failures=$((failures + 1))
elif [[ "$(migrate_deploy_count)" != 1 ]]; then
  echo "(iii) FAILED: expected exactly 1 prisma migrate deploy call, saw $(migrate_deploy_count)" >&2
  failures=$((failures + 1))
elif grep -qE 'network ls|psql' "${CALL_LOG}"; then
  echo "(iii) FAILED: guard is supposed to no-op when M11 is absent from source, but it touched docker network/psql:" >&2
  cat "${CALL_LOG}" >&2
  failures=$((failures + 1))
else
  echo "[(iii)] OK: guard no-op passed without touching docker network/psql (M11 absent from source), migrate deploy called once"
fi

# ── (iv) M11 folder present but its BYTES were tampered -> the m11_pinned_sha
#    check refuses before any DB/network call, even when the (tampered)
#    ledger checksum happens to match the (tampered) source checksum --
#    proving the pin is a check independent of the source-vs-ledger compare,
#    not merely derivable from it. ──────────────────────────────────────────
write_fixture "[{\"name\":\"${M11_NAME}\",\"checksum\":\"${TAMPERED_M11_SHA}\",\"finished\":true,\"rolledback\":false}]"
export CALL_LOG="${TEST_ROOT}/iv-calls.log"; : > "${CALL_LOG}"
run_segment "${TEST_ROOT}/baseline-segment.sh" "${SOURCE_WITH_TAMPERED_M11}"
if [[ "${SEGMENT_RC}" -eq 0 ]]; then
  echo "(iv) FAILED: segment unexpectedly succeeded (tampered M11 source was accepted)" >&2
  echo "${SEGMENT_OUTPUT}" >&2
  failures=$((failures + 1))
elif [[ "$(migrate_deploy_count)" != 0 ]]; then
  echo "(iv) FAILED: prisma migrate deploy was called despite the pin check refusing" >&2
  cat "${CALL_LOG}" >&2
  failures=$((failures + 1))
elif grep -qE 'network ls|psql' "${CALL_LOG}"; then
  echo "(iv) FAILED: the pin check is supposed to fail BEFORE any DB/network call, but it touched docker network/psql:" >&2
  cat "${CALL_LOG}" >&2
  failures=$((failures + 1))
else
  echo "[(iv)] OK: guard refused (M11 source checksum does not match the pinned value) before touching docker network/psql, migrate deploy call count 0"
fi

if [[ "${failures}" -ne 0 ]]; then
  echo "[task168-prod-guard] FAILED: ${failures} scenario(s)" >&2
  exit 1
fi
echo "[task168-prod-guard] (i)(ii)(iii) all passed"

# ── mutations ────────────────────────────────────────────────────────────
mutation_reds=0
mutation_total=0

# 1. Guard verdict inverted -- (i) and (ii) both turn red.
mut_dir="${TEST_ROOT}/mut-invert-dir"
mkdir -p "${mut_dir}"
ln -s "${ROOT_DIR}/deploy/prod-source-common.sh" "${mut_dir}/prod-source-common.sh"
ln -s "${ROOT_DIR}/deploy/prod-manifest-common.sh" "${mut_dir}/prod-manifest-common.sh"
scratch_invert="${mut_dir}/prod-release-common.sh"
python3 - "${PROD_RELEASE_COMMON}" "${scratch_invert}" <<'PYEOF'
import sys
src_path, out_path = sys.argv[1], sys.argv[2]
src = open(src_path, encoding='utf-8').read()
old = 'if [[ "${m11_ledger_checksum}" != "${m11_source_sha}" ]]; then'
new = 'if [[ "${m11_ledger_checksum}" == "${m11_source_sha}" ]]; then'
count = src.count(old)
if count != 1:
    raise SystemExit(f'expected exactly 1 occurrence, found {count}')
open(out_path, 'w', encoding='utf-8').write(src.replace(old, new, 1))
PYEOF
mutation_total=$((mutation_total + 2))
export PROD_RELEASE_COMMON_FOR_RUN="${scratch_invert}"
write_fixture "${FIXTURE_APPLIED_MATCH}"
export CALL_LOG="${TEST_ROOT}/mut1-ii-calls.log"; : > "${CALL_LOG}"
run_segment "${TEST_ROOT}/baseline-segment.sh" "${SOURCE_WITH_M11}"
if [[ "${SEGMENT_RC}" -ne 0 || "$(migrate_deploy_count)" != 1 ]]; then
  echo "[mutation verdict-inverted] (ii) red (a legitimate already-applied M11 is now wrongly refused)"
  mutation_reds=$((mutation_reds + 1))
else
  echo "[mutation verdict-inverted] (ii) NOT red -- still passed" >&2
fi
write_fixture "${FIXTURE_EMPTY}"
export CALL_LOG="${TEST_ROOT}/mut1-i-calls.log"; : > "${CALL_LOG}"
run_segment "${TEST_ROOT}/baseline-segment.sh" "${SOURCE_WITH_M11}"
if [[ "${SEGMENT_RC}" -eq 0 && "$(migrate_deploy_count)" == 1 ]]; then
  echo "[mutation verdict-inverted] (i) red (an unapplied M11 is now wrongly accepted, migrate deploy ran)"
  mutation_reds=$((mutation_reds + 1))
else
  echo "[mutation verdict-inverted] (i) NOT red -- still refused" >&2
fi
export PROD_RELEASE_COMMON_FOR_RUN="${PROD_RELEASE_COMMON}"

# 2. Guard call deleted from deploy-prod.sh entirely -- (i) turns red.
# Mutates the already-extracted baseline segment directly (rather than
# deploy-prod.sh followed by re-extraction): once the guard call is gone,
# extract_segment's own start anchor -- which IS that call -- can no longer
# find it, so deploy-prod.sh is not the right mutation target for this one.
mutation_total=$((mutation_total + 1))
guard_call_count="$(grep -c '^assert_task168_m11_guard "\${PROD_SOURCE_DIR}"$' "${TEST_ROOT}/baseline-segment.sh")"
[[ "${guard_call_count}" -eq 1 ]] || { echo "[mutation guard-deleted] expected exactly 1 guard call line in the segment, found ${guard_call_count}" >&2; exit 1; }
sed '/^assert_task168_m11_guard "\${PROD_SOURCE_DIR}"$/d' "${TEST_ROOT}/baseline-segment.sh" > "${TEST_ROOT}/mut2-segment.sh"
write_fixture "${FIXTURE_EMPTY}"
export CALL_LOG="${TEST_ROOT}/mut2-calls.log"; : > "${CALL_LOG}"
run_segment "${TEST_ROOT}/mut2-segment.sh" "${SOURCE_WITH_M11}"
if [[ "${SEGMENT_RC}" -eq 0 && "$(migrate_deploy_count)" == 1 ]]; then
  echo "[mutation guard-deleted] red (prisma migrate deploy ran with no guard ahead of it)"
  mutation_reds=$((mutation_reds + 1))
else
  echo "[mutation guard-deleted] NOT red -- migrate deploy still did not run" >&2
fi

# 3. Guard call neutralized with `|| true` -- a static line-order check
#    alone cannot see this (the call is still textually first); (i) turns
#    red because the neutralized guard's failure no longer stops the
#    segment.
mutation_total=$((mutation_total + 1))
python3 - "${TEST_ROOT}/baseline-segment.sh" "${TEST_ROOT}/mut3-segment.sh" <<'PYEOF'
import sys
src_path, out_path = sys.argv[1], sys.argv[2]
src = open(src_path, encoding='utf-8').read()
old = 'assert_task168_m11_guard "${PROD_SOURCE_DIR}"'
new = 'assert_task168_m11_guard "${PROD_SOURCE_DIR}" || true'
count = src.count(old)
if count != 1:
    raise SystemExit(f'expected exactly 1 occurrence, found {count}')
open(out_path, 'w', encoding='utf-8').write(src.replace(old, new, 1))
PYEOF
write_fixture "${FIXTURE_EMPTY}"
export CALL_LOG="${TEST_ROOT}/mut3-calls.log"; : > "${CALL_LOG}"
run_segment "${TEST_ROOT}/mut3-segment.sh" "${SOURCE_WITH_M11}"
if [[ "${SEGMENT_RC}" -eq 0 && "$(migrate_deploy_count)" == 1 ]]; then
  echo "[mutation guard-neutered] red (\`|| true\` let migrate deploy run after a refusing guard)"
  mutation_reds=$((mutation_reds + 1))
else
  echo "[mutation guard-neutered] NOT red -- migrate deploy still did not run" >&2
fi

# 4. `AND finished_at IS NOT NULL AND rolled_back_at IS NULL` removed from
#    the ledger query -- a P3009-leftover row with the pinned checksum but
#    finished_at NULL is wrongly accepted as applied.
mutation_total=$((mutation_total + 1))
scratch_and_removed="${TEST_ROOT}/mut-and-clause-removed-dir"
mkdir -p "${scratch_and_removed}"
ln -s "${ROOT_DIR}/deploy/prod-source-common.sh" "${scratch_and_removed}/prod-source-common.sh"
ln -s "${ROOT_DIR}/deploy/prod-manifest-common.sh" "${scratch_and_removed}/prod-manifest-common.sh"
scratch_and_removed_common="${scratch_and_removed}/prod-release-common.sh"
python3 - "${PROD_RELEASE_COMMON}" "${scratch_and_removed_common}" <<'PYEOF'
import sys
src_path, out_path = sys.argv[1], sys.argv[2]
src = open(src_path, encoding='utf-8').read()
old = " AND finished_at IS NOT NULL AND rolled_back_at IS NULL"
count = src.count(old)
if count != 1:
    raise SystemExit(f'expected exactly 1 occurrence, found {count}')
open(out_path, 'w', encoding='utf-8').write(src.replace(old, '', 1))
PYEOF
export PROD_RELEASE_COMMON_FOR_RUN="${scratch_and_removed_common}"
write_fixture "${FIXTURE_UNFINISHED_SAME_CHECKSUM}"
export CALL_LOG="${TEST_ROOT}/mut4-calls.log"; : > "${CALL_LOG}"
run_segment "${TEST_ROOT}/baseline-segment.sh" "${SOURCE_WITH_M11}"
if [[ "${SEGMENT_RC}" -eq 0 && "$(migrate_deploy_count)" == 1 ]]; then
  echo "[mutation and-clause-removed] red (an unfinished/P3009 ledger row was wrongly accepted as applied)"
  mutation_reds=$((mutation_reds + 1))
else
  echo "[mutation and-clause-removed] NOT red -- the unfinished row was still correctly rejected" >&2
fi
export PROD_RELEASE_COMMON_FOR_RUN="${PROD_RELEASE_COMMON}"

# 5. Fail-open on a psql/docker error: the `if [[ "${query_rc}" -ne 0 ]] ...
#    return 1; fi` block replaced with a fallback that treats a query
#    failure as "already applied and matching" (mirrors the OLD
#    `|| m11_ledger_checksum=""`-style bug this replaced, which this
#    scratch copy re-introduces in an equivalent, observably wrong form).
mutation_total=$((mutation_total + 1))
scratch_failopen="${TEST_ROOT}/mut-fail-open-dir"
mkdir -p "${scratch_failopen}"
ln -s "${ROOT_DIR}/deploy/prod-source-common.sh" "${scratch_failopen}/prod-source-common.sh"
ln -s "${ROOT_DIR}/deploy/prod-manifest-common.sh" "${scratch_failopen}/prod-manifest-common.sh"
scratch_failopen_common="${scratch_failopen}/prod-release-common.sh"
python3 - "${PROD_RELEASE_COMMON}" "${scratch_failopen_common}" <<'PYEOF'
import sys
src_path, out_path = sys.argv[1], sys.argv[2]
src = open(src_path, encoding='utf-8').read()
old = '''  if [[ "${query_rc}" -ne 0 ]]; then
    # Fail closed on a query/connection error instead of silently treating it
    # as "M11 not applied" via an empty string -- both reach the same
    # `return 1` below, but surfacing the actual psql/docker error here
    # means an operator sees WHY (network unreachable, auth failure, ...)
    # instead of a diagnosis that reads identically to "M11 truly missing".
    echo "[prod-deploy] Task168 M11 guard: could not query prod's migration ledger. Refusing to run prisma migrate deploy." >&2
    cat "${psql_stderr}" >&2
    rm -f "${psql_stderr}"
    return 1
  fi
  rm -f "${psql_stderr}"'''
new = '''  [[ "${query_rc}" -eq 0 ]] || m11_ledger_checksum="${m11_source_sha}"
  rm -f "${psql_stderr}"'''
count = src.count(old)
if count != 1:
    raise SystemExit(f'expected exactly 1 occurrence, found {count}')
open(out_path, 'w', encoding='utf-8').write(src.replace(old, new, 1))
PYEOF
export PROD_RELEASE_COMMON_FOR_RUN="${scratch_failopen_common}"
write_fixture "${FIXTURE_EMPTY}"
export PSQL_SHOULD_FAIL=true
export CALL_LOG="${TEST_ROOT}/mut5-calls.log"; : > "${CALL_LOG}"
run_segment "${TEST_ROOT}/baseline-segment.sh" "${SOURCE_WITH_M11}"
unset PSQL_SHOULD_FAIL
if [[ "${SEGMENT_RC}" -eq 0 && "$(migrate_deploy_count)" == 1 ]]; then
  echo "[mutation fail-open-on-query-error] red (a psql failure was wrongly treated as \"already applied\")"
  mutation_reds=$((mutation_reds + 1))
else
  echo "[mutation fail-open-on-query-error] NOT red -- a psql failure was still correctly refused" >&2
fi
export PROD_RELEASE_COMMON_FOR_RUN="${PROD_RELEASE_COMMON}"

# 6. The m11_pinned_sha check removed: (iv)'s tampered-but-self-consistent
#    source+ledger pair (both carry the SAME tampered checksum, so the
#    source-vs-ledger compare alone would accept it) is wrongly accepted.
mutation_total=$((mutation_total + 1))
scratch_pin_removed="${TEST_ROOT}/mut-pin-removed-dir"
mkdir -p "${scratch_pin_removed}"
ln -s "${ROOT_DIR}/deploy/prod-source-common.sh" "${scratch_pin_removed}/prod-source-common.sh"
ln -s "${ROOT_DIR}/deploy/prod-manifest-common.sh" "${scratch_pin_removed}/prod-manifest-common.sh"
scratch_pin_removed_common="${scratch_pin_removed}/prod-release-common.sh"
python3 - "${PROD_RELEASE_COMMON}" "${scratch_pin_removed_common}" <<'PYEOF'
import sys
src_path, out_path = sys.argv[1], sys.argv[2]
src = open(src_path, encoding='utf-8').read()
old = '''  if [[ "${m11_source_sha}" != "${m11_pinned_sha}" ]]; then
    echo "[prod-deploy] Task168 M11 guard: candidate source's M11 checksum (${m11_source_sha}) does not match the pinned value (${m11_pinned_sha}). Refusing to run prisma migrate deploy." >&2
    return 1
  fi
'''
count = src.count(old)
if count != 1:
    raise SystemExit(f'expected exactly 1 occurrence, found {count}')
open(out_path, 'w', encoding='utf-8').write(src.replace(old, '', 1))
PYEOF
export PROD_RELEASE_COMMON_FOR_RUN="${scratch_pin_removed_common}"
write_fixture "[{\"name\":\"${M11_NAME}\",\"checksum\":\"${TAMPERED_M11_SHA}\",\"finished\":true,\"rolledback\":false}]"
export CALL_LOG="${TEST_ROOT}/mut6-calls.log"; : > "${CALL_LOG}"
run_segment "${TEST_ROOT}/baseline-segment.sh" "${SOURCE_WITH_TAMPERED_M11}"
if [[ "${SEGMENT_RC}" -eq 0 && "$(migrate_deploy_count)" == 1 ]]; then
  echo "[mutation pin-check-removed] red (a source whose M11 checksum does not match the pin, but happens to match the ledger, was wrongly accepted)"
  mutation_reds=$((mutation_reds + 1))
else
  echo "[mutation pin-check-removed] NOT red -- the tampered-but-self-consistent source/ledger pair was still correctly refused" >&2
fi
export PROD_RELEASE_COMMON_FOR_RUN="${PROD_RELEASE_COMMON}"

echo "[task168-prod-guard] mutation reds: ${mutation_reds}/${mutation_total} (expected 7/7)"
if [[ "${mutation_reds}" -ne 7 ]]; then
  echo "[task168-prod-guard] FAILED: expected all mutations to weaken the guard as documented" >&2
  exit 1
fi

echo "[task168-prod-guard] passed"

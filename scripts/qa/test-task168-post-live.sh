#!/usr/bin/env bash

# Contract test for scripts/release/task168-stage-b-post-live-verify.sh (T7).
# Runs the real script against a fake docker/psql/curl. A working baseline is built
# first, then each of the eight checks is broken exactly once — every
# break must refuse to write a receipt and exit non-zero.
#
# The ledger baseline (used by the passing case AND every break case that
# isn't itself about the ledger) always includes two migrations outside the
# Task168 set whose names still match the old `LIKE '202609%_v1_%'`
# date-range pattern — proving the ledger check names its migrations
# exactly (from the manifest) rather than date-range-matching them. The
# fake docker's ledger dispatch only understands an explicit list of quoted
# migration names (what the real query sends); a regression back to a LIKE
# pattern has no such names to extract, so it fails closed instead of
# silently overcounting.

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${ROOT}/scripts/release/task168-stage-b-post-live-verify.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ok: $*"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $*" >&2; }

readonly SHA=1111111111111111111111111111111111111111
readonly REGISTRY=123456789012.dkr.ecr.ap-northeast-2.amazonaws.com
readonly API_URI="${REGISTRY}/teameet-alpha-v1-api@sha256:$(printf 'a%.0s' {1..64})"
readonly WEB_URI="${REGISTRY}/teameet-alpha-v1-web@sha256:$(printf 'b%.0s' {1..64})"

# 11 well-formed (^[0-9]{14}_[a-z0-9_]+$) Task168 migration names — the
# exact set the manifest declares and the ledger check must name
# individually (item 3 fix replaces a LIKE '202609%_v1_%' date-range query).
TASK168_NAMES=(
  20260908130000_v1_m00
  20260908150000_v1_m01
  20260908160000_v1_m02
  20260908170000_v1_m03
  20260908180000_v1_m04
  20260909000000_v1_m05
  20260909110000_v1_m06
  20260910010000_v1_m07
  20260910020000_v1_m08
  20260910160000_v1_m09
  20260911090000_v1_m10
)
# Unrelated migrations sharing the LIKE '202609%_v1_%' shape the old query
# matched, but not part of Task168 — must never be counted.
UNRELATED_NAMES=(
  20260910050000_v1_notification_prefs_extra
  20260912030000_v1_other_unrelated_migration
)

name_checksum() { printf '%s' "$1" | sha256sum | awk '{print $1}'; }

# Everything a passing run needs, overridable per-case via env vars read by
# the fake docker/psql below: BREAK selects which single check to break.
build_case() {
  local root="$1" manifest_migration_count="${2:-11}"
  home="${root}/home"
  state_dir="${home}/.teameet-alpha-releases/task168/${SHA}"
  bin="${root}/bin"
  mkdir -p "${state_dir}" "${bin}" "${root}/live/deploy"
  touch "${root}/live/deploy/docker-compose.prod.yml" "${root}/live/deploy/docker-compose.alpha.yml"
  printf 'V1_DB_USER=teameet_v1\nV1_DB_NAME=teameet_v1\n' > "${root}/live/deploy/.env"

  # manifest_migration_count != 11 simulates a manifest that lists the wrong
  # number of Task168 migrations (a data-integrity bug elsewhere) -- 10 by
  # dropping the last real name, 12 by appending one extra well-formed but
  # unrelated name.
  local manifest_names=("${TASK168_NAMES[@]}")
  if [[ "${manifest_migration_count}" -lt 11 ]]; then
    manifest_names=("${manifest_names[@]:0:${manifest_migration_count}}")
  elif [[ "${manifest_migration_count}" -gt 11 ]]; then
    manifest_names+=(20260913000000_v1_extra_manifest_entry)
  fi
  local migrations_json='[]' name
  for name in "${manifest_names[@]}"; do
    migrations_json="$(jq -c --arg n "${name}" --arg s "$(name_checksum "${name}")" '. + [{name:$n,sha256:$s}]' <<< "${migrations_json}")"
  done

  manifest="${root}/manifest.json"
  jq -n --arg api "${API_URI}" --arg web "${WEB_URI}" --argjson migrations "${migrations_json}" \
    '{schemaVersion:1,environment:"alpha",database:{task168:{stage:"stageBFinal",migrations:$migrations}},
      images:{api:{uri:$api},web:{uri:$web}}}' > "${manifest}"

  jq -n '{schemaVersion:1,kind:"task168StageBMigration",status:"MIGRATION_COMMITTED"}' \
    > "${state_dir}/migration-stage.json"
}

# Writes the fake DB's full ledger backing table into ${bin}/ledger-rows.txt:
# the 11 Task168 rows (each `applied` with the manifest's own checksum) plus
# the 2 unrelated rows, always present so every scenario below implicitly
# proves they are ignored. break_case=="ledger-count" drops one Task168 row
# entirely (simulates a migration never applied);
# break_case=="ledger-checksum" tampers one Task168 row's checksum.
write_ledger_rows() {
  local bin="$1" break_case="${2:-}" name sha
  : > "${bin}/ledger-rows.txt"
  for name in "${TASK168_NAMES[@]}"; do
    if [[ "${break_case}" == ledger-count && "${name}" == "${TASK168_NAMES[5]}" ]]; then
      continue
    fi
    sha="$(name_checksum "${name}")"
    if [[ "${break_case}" == ledger-checksum && "${name}" == "${TASK168_NAMES[5]}" ]]; then
      sha="$(printf 'f%.0s' {1..64})"
    fi
    printf '%s|%s|applied\n' "${name}" "${sha}" >> "${bin}/ledger-rows.txt"
  done
  for name in "${UNRELATED_NAMES[@]}"; do
    printf '%s|%s|applied\n' "${name}" "$(name_checksum "${name}")" >> "${bin}/ledger-rows.txt"
  done
}

# $2 = BREAK name (empty for the passing baseline)
make_fake_bin() {
  local bin="$1" break_case="${2:-}"
  write_ledger_rows "${bin}" "${break_case}"
  cat > "${bin}/curl" <<EOF
#!/usr/bin/env bash
case "\$*" in
  *"/api/v1/health"*)
    if [[ "${break_case}" == health ]]; then echo '{"data":{"checks":{"db":false}}}'; else echo '{"data":{"checks":{"db":true}}}'; fi
    ;;
  *"-o /dev/null"*)
    if [[ "${break_case}" == smoke ]]; then echo 500; else echo 200; fi
    ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "${bin}/curl"

  cat > "${bin}/docker" <<EOF
#!/usr/bin/env bash
case "\$*" in
  *"ps -q v1_api"*) echo api-container; exit 0 ;;
  *"ps -q v1_web"*) echo web-container; exit 0 ;;
  *"ps -q v1_game_operations_worker"*) echo worker-container; exit 0 ;;
  *"run --rm --entrypoint cat"*attestation*)
    if [[ "${break_case}" == attestation ]]; then
      echo '{"stage":"stageAIntermediate","schemaSha256":"bad"}'
    else
      echo '{"stage":"stageBFinal","schemaSha256":"e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46"}'
    fi
    exit 0 ;;
  *"inspect --format {{.Config.Image}} api-container"*)
    if [[ "${break_case}" == digest ]]; then echo wrong-image; else echo "${API_URI}"; fi
    exit 0 ;;
  *"inspect --format {{.Config.Image}} web-container"*) echo "${WEB_URI}"; exit 0 ;;
  *"inspect --format {{.Config.Image}} worker-container"*) echo "${API_URI}"; exit 0 ;;
  *"inspect --format {{.State.Health.Status}} worker-container"*)
    if [[ "${break_case}" == worker ]]; then echo unhealthy; else echo healthy; fi
    exit 0 ;;
  *"migrate diff"*)
    if [[ "${break_case}" == drift ]]; then echo "drift detected" >&2; exit 2; else exit 0; fi
    ;;
  *"_prisma_migrations"*)
    names="\$(grep -oE "'[0-9]{14}_[a-z0-9_]+'" <<< "\$*" | tr -d "'")"
    if [[ -z "\${names}" ]]; then
      echo "fake docker: no exact migration names found in ledger SQL (regressed to a LIKE pattern?)" >&2
      exit 1
    fi
    while IFS= read -r n; do
      grep "^\${n}|" "${bin}/ledger-rows.txt" || true
    done <<< "\${names}" | LC_ALL=C sort
    exit 0 ;;
  *"to_regclass"*)
    if [[ "${break_case}" == legacy-table ]]; then echo 1; else echo 0; fi
    exit 0 ;;
  *"information_schema.columns"*)
    if [[ "${break_case}" == legacy-column ]]; then echo 1; else echo 0; fi
    exit 0 ;;
  *"v1_outbox_events"*)
    if [[ "${break_case}" == outbox ]]; then echo 3; else echo 0; fi
    exit 0 ;;
  *"v1_tournaments"*)
    echo "tour-1|match-1"
    exit 0 ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "${bin}/docker"
}

run_case() {
  local root="$1"
  local rc=0
  ALPHA_RELEASE_STATE_DIR="${home}/.teameet-alpha-releases" PATH="${bin}:${PATH}" \
    bash "${SCRIPT}" --release-sha "${SHA}" --manifest "${manifest}" \
      --compose-prod "${root}/live/deploy/docker-compose.prod.yml" \
      --compose-alpha "${root}/live/deploy/docker-compose.alpha.yml" \
      --env-file "${root}/live/deploy/.env" \
      --public-base-url "https://alpha.example.invalid" \
      >"${root}/stdout" 2>"${root}/stderr" || rc=$?
  echo "${rc}"
}

echo "== test-task168-post-live =="

root="${WORK}/pass"; mkdir -p "${root}"
build_case "${root}"
make_fake_bin "${bin}" ""
rc="$(run_case "${root}")"
[[ "${rc}" -eq 0 && -f "${state_dir}/runtime-verification.json" ]] \
  && pass "11 Task168 rows + 2 unrelated September migrations: a fully passing run writes runtime-verification.json" \
  || fail "the passing baseline did not succeed: rc=${rc} $(cat "${root}/stderr")"
if [[ -f "${state_dir}/runtime-verification.json" ]]; then
  jq -e --arg m "$(sha256sum "${state_dir}/migration-stage.json" | awk '{print $1}')" \
    --arg n "$(sha256sum "${manifest}" | awk '{print $1}')" \
    '.migrationReceiptSha256 == $m and .manifestSha256 == $n and .ledgerCount == 11' \
    "${state_dir}/runtime-verification.json" >/dev/null \
    && pass "receipt binds the migration receipt and manifest hashes, ledgerCount stays 11 despite unrelated rows" \
    || fail "receipt does not bind the expected hashes"
  # Shape pin (docs/ops/task168-stage-b-runbook.md "Receipt contract"): the
  # exact top-level and nested key sets, so a rename or an added/removed
  # field is caught here rather than silently breaking a downstream
  # consumer that binds on this documented contract.
  jq -e '
    (keys | sort) == ["apiDigest","catalogResult","completedAt","driftCheck","healthDbTrue",
      "kind","ledgerCount","manifestSha256","migrationReceiptSha256","outboxProcessingZeroAt",
      "schemaVersion","smokeCheck","webDigest","workerDigest","workerHealthy"] and
    .kind == "task168StageBRuntimeVerification" and .schemaVersion == 1 and
    (.catalogResult | keys | sort) == ["legacyLinkColumns","legacyTables"] and
    (.smokeCheck | keys | sort) == ["fixtureOrMatchId","status","tournamentId"]
  ' "${state_dir}/runtime-verification.json" >/dev/null \
    && pass "runtime-verification.json's field set matches the documented Receipt contract exactly" \
    || fail "runtime-verification.json's shape has drifted from the documented Receipt contract: $(jq -c 'keys' "${state_dir}/runtime-verification.json" 2>/dev/null)"
fi

# Expected failure message per broken check: rc!=0 + no receipt alone also
# passes for an unrelated crash (e.g. an unbound-variable error), not only
# for the intended check failing. Asserting the message ties each case to
# the SPECIFIC check it broke, taken verbatim from
# scripts/release/task168-stage-b-post-live-verify.sh.
declare -A EXPECTED_MESSAGE=(
  [digest]="running API image does not match the manifest"
  [attestation]="running API image attestation is not stageBFinal"
  [ledger-count]="expected 11"
  [ledger-checksum]="is not applied with the manifest checksum"
  [legacy-table]="legacy tables are still present"
  [legacy-column]="legacy link columns remain"
  [drift]="live database drifts from the final schema"
  [health]="health check db is not true"
  [worker]="worker is not healthy"
  [outbox]="outbox PROCESSING rows did not converge to zero"
  [smoke]="read-only smoke check returned HTTP"
)

for break_case in digest attestation ledger-count ledger-checksum legacy-table legacy-column drift health worker outbox smoke; do
  root="${WORK}/break-${break_case}"; mkdir -p "${root}"
  build_case "${root}"
  make_fake_bin "${bin}" "${break_case}"
  rc="$(run_case "${root}")"
  expected="${EXPECTED_MESSAGE[${break_case}]}"
  if [[ "${rc}" -ne 0 && ! -f "${state_dir}/runtime-verification.json" ]] && grep -qF "${expected}" "${root}/stderr"; then
    pass "breaking '${break_case}' refuses the receipt with its specific message (rc=${rc}): ${expected}"
  else
    fail "breaking '${break_case}' did NOT refuse with the expected message '${expected}': rc=${rc} receipt-exists=$([[ -f "${state_dir}/runtime-verification.json" ]] && echo yes || echo no) stderr=$(cat "${root}/stderr")"
  fi
done

# ── Negative: the manifest itself lists the wrong number of Task168
# migrations (10 or 12, not exactly 11) -- must be refused before any query
# even runs, since the promotion gate hardcodes ledgerCount == 11 and a
# wrong count must never reach a written receipt (Copilot review, PR #1194).
for wrong_count in 10 12; do
  root="${WORK}/manifest-count-${wrong_count}"; mkdir -p "${root}"
  build_case "${root}" "${wrong_count}"
  make_fake_bin "${bin}" ""
  rc="$(run_case "${root}")"
  if [[ "${rc}" -ne 0 && ! -f "${state_dir}/runtime-verification.json" ]] \
    && grep -qF "expected exactly 11" "${root}/stderr"; then
    pass "a manifest listing ${wrong_count} task168 migrations is refused before any receipt is written"
  else
    fail "a manifest listing ${wrong_count} task168 migrations was not refused: rc=${rc} receipt-exists=$([[ -f "${state_dir}/runtime-verification.json" ]] && echo yes || echo no) stderr=$(cat "${root}/stderr")"
  fi
done

# Mutation regression: loosening the count check back to "non-empty" must
# accept the same 10-entry manifest -- proves the two cases above actually
# depend on the exact-11 check.
(
  root="${WORK}/manifest-count-mutation"; mkdir -p "${root}"
  build_case "${root}" 10
  make_fake_bin "${bin}" ""
  mutated="${root}/post-live-verify-mutated.sh"
  python3 - "${SCRIPT}" "${mutated}" <<'PY'
import sys
src_path, out_path = sys.argv[1], sys.argv[2]
text = open(src_path).read()
marker = '(( ${#task168_migration_names[@]} == 11 )) || fail "manifest lists ${#task168_migration_names[@]} task168 migrations, expected exactly 11"'
assert marker in text, "could not find the exact-11 count check to mutate"
loosened = '(( ${#task168_migration_names[@]} > 0 )) || fail "manifest lists no task168 migrations"'
open(out_path, "w").write(text.replace(marker, loosened, 1))
PY
  chmod +x "${mutated}"
  rc=0
  ALPHA_RELEASE_STATE_DIR="${home}/.teameet-alpha-releases" PATH="${bin}:${PATH}" \
    bash "${mutated}" --release-sha "${SHA}" --manifest "${manifest}" \
      --compose-prod "${root}/live/deploy/docker-compose.prod.yml" \
      --compose-alpha "${root}/live/deploy/docker-compose.alpha.yml" \
      --env-file "${root}/live/deploy/.env" \
      --public-base-url "https://alpha.example.invalid" \
      >"${root}/stdout" 2>"${root}/stderr" || rc=$?
  # A 10-entry manifest under the loosened check proceeds to the ledger
  # query itself, which then legitimately fails ("expected 10", not 11) --
  # still a failure, but for a different reason than the count guard this
  # mutation removed. Passing the mutation proves the removed guard, not the
  # downstream ledger-count check, was what rejected 10/12 above: it must
  # NOT fail with "expected exactly 11" anymore.
  if ! grep -q "expected exactly 11" "${root}/stderr"; then
    pass "loosening the manifest-count check to non-empty no longer rejects a 10-entry manifest with the exact-11 message (mutation correctly detected)"
  else
    fail "the mutated (loosened) check still rejected with the exact-11 message: rc=${rc} $(cat "${root}/stderr" 2>/dev/null)"
  fi
) && PASS=$((PASS + 1)) || FAIL=$((FAIL + 1))

# Mutation regression: reverting the ledger query to the old date-range LIKE
# pattern has no quoted 14-digit names for the fake to extract, so it must
# fail closed on the SAME (unrelated-rows-present) fixture the passing case
# above uses — proving that case actually depends on the exact-name fix.
(
  root="${WORK}/mutation-like-pattern"; mkdir -p "${root}"
  build_case "${root}"
  make_fake_bin "${bin}" ""
  mutated="${root}/post-live-verify-mutated.sh"
  python3 - "${SCRIPT}" "${mutated}" <<'PY'
import sys
src_path, out_path = sys.argv[1], sys.argv[2]
text = open(src_path).read()
start = text.index("# 3. Ledger:")
end = text.index("# 4. Catalog:")
assert text[start:end], "could not locate the ledger-check block to mutate"
replacement = r'''# 3. Ledger (MUTATED for regression test): date-range LIKE pattern.
ledger_rows="$(dbq "SELECT migration_name || '|' || COALESCE(checksum,'') || '|' || CASE WHEN finished_at IS NOT NULL AND rolled_back_at IS NULL THEN 'applied' ELSE 'invalid' END FROM \"_prisma_migrations\" WHERE migration_name LIKE '202609%_v1_%' ORDER BY migration_name")"
ledger_count="$(grep -c '|applied$' <<< "${ledger_rows}" || true)"
[[ "${ledger_count}" == 11 ]] || fail "ledger has ${ledger_count} Task168 rows, expected 11"

'''
open(out_path, "w").write(text[:start] + replacement + text[end:])
PY
  chmod +x "${mutated}"
  rc=0
  ALPHA_RELEASE_STATE_DIR="${home}/.teameet-alpha-releases" PATH="${bin}:${PATH}" \
    bash "${mutated}" --release-sha "${SHA}" --manifest "${manifest}" \
      --compose-prod "${root}/live/deploy/docker-compose.prod.yml" \
      --compose-alpha "${root}/live/deploy/docker-compose.alpha.yml" \
      --env-file "${root}/live/deploy/.env" \
      --public-base-url "https://alpha.example.invalid" \
      >"${root}/stdout" 2>"${root}/stderr" || rc=$?
  if [[ "${rc}" -ne 0 ]] && grep -q "no exact migration names found in ledger SQL" "${root}/stderr"; then
    pass "reverting to the LIKE date-range pattern fails on the unrelated-rows-present fixture (mutation correctly detected)"
  else
    fail "reverting to the LIKE pattern did not fail as expected: rc=${rc} $(cat "${root}/stderr" 2>/dev/null)"
  fi
) && PASS=$((PASS + 1)) || FAIL=$((FAIL + 1))

echo "== ${PASS} passed, ${FAIL} failed =="
(( FAIL == 0 ))

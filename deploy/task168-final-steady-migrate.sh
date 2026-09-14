#!/usr/bin/env bash
# Task 168 M11 converged: the "final steady" migration path that every dev
# push takes once StageB has committed M11 on the live database. Unlike
# task168-stage-a-migrate.sh (a one-shot writer-quiesced cutover) this script
# never stops a writer and never runs destructive DDL itself — it only
# proves the DB ledger and the candidate source tree agree (L1-L4, see
# docs referenced by the PR that introduced this file) before letting
# deploy-alpha.sh activate the candidate release, then applies whatever
# ordinary (already expand-contract-gated) migrations are pending.
#
# --check-only runs BEFORE deploy-alpha.sh activates the candidate source or
# mutates the live runtime. It is read-only: on failure nothing about the
# live release changes. --migrate runs AFTER activation and actually calls
# `prisma migrate deploy`; M11 itself is always a no-op there (StageB already
# applied it) so this step behaves like an ordinary additive migration run.
set -Eeuo pipefail
# Every name/lexical comparison below (`[[ a > b ]]`, `[[ a == b ]]` on
# migration names, `sort`) must be byte-order, not locale-dependent -- a host
# whose collation differs from CI could otherwise judge L3's "pending sorts
# after M11" differently than the same code was tested under.
export LC_ALL=C
usage(){ echo "usage: $0 (--check-only|--migrate) --source-dir D --compose-prod F --compose-alpha F --env-file F" >&2; exit 64; }
MODE= SOURCE_DIR= COMPOSE_PROD= COMPOSE_ALPHA= ENV_FILE=
while (($#)); do case "$1" in
  --check-only) MODE=check-only; shift;;
  --migrate) MODE=migrate; shift;;
  --source-dir) SOURCE_DIR=${2:?}; shift 2;;
  --compose-prod) COMPOSE_PROD=${2:?}; shift 2;;
  --compose-alpha) COMPOSE_ALPHA=${2:?}; shift 2;;
  --env-file) ENV_FILE=${2:?}; shift 2;;
  *) usage;;
esac; done
[[ -n "${MODE}" && -d "${SOURCE_DIR}" && -f "${COMPOSE_PROD}" && -f "${COMPOSE_ALPHA}" && -f "${ENV_FILE}" ]] || usage

sha(){ sha256sum "$1" | awk '{print $1}'; }
fail(){ echo "[task168-final-steady] $*" >&2; exit 1; }

readonly M11_NAME=20260911090000_retire_tournament_fixture_tables
readonly M11_SHA=08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323
readonly TASK168_NAMES=(
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
  "${M11_NAME}"
)

# StageB's actual producers (deploy/task168-stage-b-migrate.sh,
# deploy/deploy-alpha-stage-b.sh's R-A recovery path) write one
# migration-stage.json per release sha under task168/<sha>/, not under a
# fixed task168-final/ path -- this script does not know which sha StageB
# ran under (it can predate the sha that finally merges this file), so it
# scans every receipt under STAGE_B_STATE_ROOT below instead of reading one
# fixed path.
STAGE_B_STATE_ROOT="${ALPHA_RELEASE_STATE_DIR:-/home/ec2-user/.teameet-alpha-releases}/task168"

compose=(docker compose --project-name deploy -f "${COMPOSE_PROD}" -f "${COMPOSE_ALPHA}" --env-file "${ENV_FILE}")
dbq(){ "${compose[@]}" exec -T v1_postgres psql -v ON_ERROR_STOP=1 -At -U "${V1_DB_USER:-teameet_v1}" -d "${V1_DB_NAME:-teameet_v1}" -c "$1"; }
db_identity(){ dbq "SELECT current_database() || '|' || current_user || '|' || COALESCE(inet_server_addr()::text,'local') || '|' || COALESCE(inet_server_port()::text,'local')"; }

# ── candidate source tree (L1's right-hand side) ────────────────────────────
declare -A SOURCE_SHA
source_names=()
while IFS= read -r dir; do
  name="$(basename "${dir}")"
  [[ -f "${dir}/migration.sql" ]] || continue
  SOURCE_SHA["${name}"]="$(sha "${dir}/migration.sql")"
  source_names+=("${name}")
done < <(find "${SOURCE_DIR}/apps/v1_api/prisma/migrations" -mindepth 1 -maxdepth 1 -type d | LC_ALL=C sort)

[[ "${#source_names[@]}" -gt 0 ]] || fail 'no migrations found in the candidate source tree'
[[ -n "${SOURCE_SHA[${M11_NAME}]:-}" ]] || fail 'candidate source tree is missing M11'
[[ "${SOURCE_SHA[${M11_NAME}]}" == "${M11_SHA}" ]] || fail 'M11 checksum in the candidate source tree does not match the pinned value'

# ── live DB ledger (L1's left-hand side) ────────────────────────────────────
# Postgres's `boolean::text` cast (and any boolean forced to text by `||`
# concatenation) yields 'true'/'false', not the 't'/'f' psql shows for a bare
# boolean column -- CASE WHEN ... THEN 't' ELSE 'f' END is what actually
# emits the single-char tokens the parsing below compares against.
DB_ID="$(db_identity)" || fail 'target DB identity unavailable'
migrations_table_exists="$(dbq "SELECT CASE WHEN to_regclass('public.\"_prisma_migrations\"') IS NOT NULL THEN 't' ELSE 'f' END")" || fail 'could not check for the Prisma migrations table'
rows=''
if [[ "${migrations_table_exists}" == t ]]; then
  rows="$(dbq "SELECT migration_name || '|' || COALESCE(checksum,'') || '|' || CASE WHEN finished_at IS NOT NULL THEN 't' ELSE 'f' END || '|' || CASE WHEN rolled_back_at IS NOT NULL THEN 't' ELSE 'f' END FROM \"_prisma_migrations\" ORDER BY migration_name")" || fail 'ledger query failed'
fi

declare -A APPLIED_SHA
unresolved_count=0
contradictory_count=0
while IFS='|' read -r name checksum finished rolledback; do
  [[ -n "${name}" ]] || continue
  if [[ "${finished}" == t && "${rolledback}" == f ]]; then
    # _prisma_migrations keys on an id column, not migration_name -- a
    # second applied row for the same name (corrupted table, or a manual
    # `migrate resolve` sequence gone wrong) must be rejected, not silently
    # collapsed into a single associative-array entry (L2's "exactly 1 row").
    [[ -z "${APPLIED_SHA[${name}]+x}" ]] || fail "L2 violated: migration '${name}' has more than one applied ledger row"
    APPLIED_SHA["${name}"]="${checksum}"
  elif [[ "${finished}" == f && "${rolledback}" == f ]]; then
    # finished_at IS NULL AND rolled_back_at IS NULL: the P3009 "in-flight or
    # crashed" state.
    unresolved_count=$((unresolved_count + 1))
  elif [[ "${finished}" == t && "${rolledback}" == t ]]; then
    # finished_at IS NOT NULL AND rolled_back_at IS NOT NULL: Prisma never
    # produces this row itself, but nothing stops a manual `migrate resolve`
    # sequence (or a corrupted table) from leaving one -- it is neither a
    # valid applied row nor a legitimate resolved-rolled-back one, so it must
    # be rejected rather than silently dropped.
    contradictory_count=$((contradictory_count + 1))
  fi
  # finished_at IS NULL AND rolled_back_at IS NOT NULL (a `migrate resolve
  # --rolled-back` attempt) is deliberately excluded from all four counts
  # above: it is neither an applied row (L1/L2 do not see it) nor an
  # unresolved or contradictory one, so it cannot violate L1, L2, or L4 by
  # construction.
done <<<"${rows}"

# L4: zero unresolved (P3009) attempts and zero contradictory rows.
[[ "${unresolved_count}" -eq 0 ]] || fail "L4 violated: ${unresolved_count} unresolved migration attempt(s) in the ledger"
[[ "${contradictory_count}" -eq 0 ]] || fail "L4 violated: ${contradictory_count} ledger row(s) have both finished_at and rolled_back_at set"

# L1: every applied DB row exists in the candidate source with the same name and checksum.
for name in "${!APPLIED_SHA[@]}"; do
  [[ -n "${SOURCE_SHA[${name}]:-}" ]] || fail "L1 violated: applied migration '${name}' is not in the candidate source tree"
  [[ "${APPLIED_SHA[${name}]}" == "${SOURCE_SHA[${name}]}" ]] || fail "L1 violated: applied migration '${name}' checksum differs from the candidate source tree"
done

# L2: the 11 Task168 names are each applied exactly once, and M11's checksum is pinned.
for name in "${TASK168_NAMES[@]}"; do
  [[ -n "${APPLIED_SHA[${name}]:-}" ]] || fail "L2 violated: Task168 migration '${name}' is not an applied ledger row"
done
[[ "${APPLIED_SHA[${M11_NAME}]}" == "${M11_SHA}" ]] || fail 'L2 violated: applied M11 checksum does not match the pinned value'

# L3: source-only (pending) names must sort lexically after M11 — a pending
# migration named before M11 would mean the deploy order assumption (M11 is
# already the newest applied history) broke.
for name in "${source_names[@]}"; do
  [[ -n "${APPLIED_SHA[${name}]:-}" ]] && continue
  [[ "${name}" > "${M11_NAME}" ]] || fail "L3 violated: pending migration '${name}' sorts at or before M11"
done

pending_count=$(( ${#source_names[@]} - ${#APPLIED_SHA[@]} ))
echo "[task168-final-steady] L1-L4 passed (${#APPLIED_SHA[@]} applied, ${pending_count} pending)"

if [[ "${MODE}" == check-only ]]; then
  # Find the StageB migration receipt bound to this database and the pinned
  # M11 checksum. There is exactly one migration-stage.json per release sha
  # (task168-stage-b-migrate.sh refuses to overwrite one), so scan every sha
  # directory instead of assuming which sha StageB ran under.
  migration_receipts=()
  if [[ -d "${STAGE_B_STATE_ROOT}" ]]; then
    while IFS= read -r f; do
      jq -e --arg db "${DB_ID}" --arg m11 "${M11_SHA}" '
        .schemaVersion==1 and .kind=="task168StageBMigration" and .stage=="stageBFinal" and
        (.status=="MIGRATION_COMMITTED" or .status=="MIGRATION_COMMITTED_RECOVERED") and
        .databaseIdentity==$db and .m11Sha256==$m11
      ' "${f}" >/dev/null 2>&1 && migration_receipts+=("${f}")
    done < <(find "${STAGE_B_STATE_ROOT}" -mindepth 2 -maxdepth 2 -name migration-stage.json 2>/dev/null | LC_ALL=C sort)
  fi
  [[ "${#migration_receipts[@]}" -gt 0 ]] || fail 'StageB MIGRATION_COMMITTED receipt is missing (no migration-stage.json under the StageB state root is bound to this database and the pinned M11 checksum)'
  [[ "${#migration_receipts[@]}" -eq 1 ]] || fail "StageB MIGRATION_COMMITTED receipt is ambiguous: ${#migration_receipts[@]} receipts are bound to this database and M11 checksum"
  migration_receipt="${migration_receipts[0]}"
  migration_receipt_sha="$(sha "${migration_receipt}")"
  runtime_verification="$(dirname "${migration_receipt}")/runtime-verification.json"
  [[ -s "${runtime_verification}" ]] || fail 'StageB runtimeVerification receipt is missing'
  jq -e --arg receiptSha "${migration_receipt_sha}" \
    '.schemaVersion==1 and .kind=="task168StageBRuntimeVerification" and .migrationReceiptSha256==$receiptSha and .ledgerCount==11' \
    "${runtime_verification}" >/dev/null || fail 'StageB runtimeVerification receipt is invalid or not bound to the MIGRATION_COMMITTED receipt'

  # The MIGRATION_COMMITTED receipt names the exact StageB manifest it was
  # produced from (deploy/task168-stage-b-migrate.sh's receipt_json:
  # `manifest`/`manifestSha256`). Re-verify that file is still the same
  # bytes before trusting anything it says -- a receipt is durable evidence
  # only as long as the manifest it points at has not been replaced.
  migration_manifest="$(jq -er '.manifest' "${migration_receipt}")" || fail 'StageB migration receipt does not name its manifest file'
  migration_manifest_sha="$(jq -er '.manifestSha256' "${migration_receipt}")" || fail 'StageB migration receipt does not bind its manifest checksum'
  [[ -s "${migration_manifest}" ]] || fail 'StageB manifest file named by the migration receipt is missing'
  [[ "$(sha "${migration_manifest}")" == "${migration_manifest_sha}" ]] || fail 'StageB manifest file named by the migration receipt has changed since StageB ran'

  # L4's resolved-attempt binding (spec L4: "resolved 시도 행은 ... StageB
  # 영수증에 기록된 resolved snapshot sha와 같아야 한다"). The manifest fixes
  # the exact resolved-attempt (finished_at NULL, rolled_back_at NOT NULL)
  # rows the StageB run started from as
  # .database.task168.resolvedMigrationAttemptsSha256 -- computed with the
  # same SQL/order as deploy/task168-migration-contract.sh's
  # resolved_attempt_rows()/resolved_attempt_sha() (duplicated here, not
  # sourced, because that file lives on the StageB wiring PR, which has not
  # landed on this branch yet; keep both in sync if either changes).
  #
  # Binding scope (orchestrator decision): only resolved rows named at or
  # before M11 must match this snapshot exactly. A resolved row named AFTER
  # M11 (e.g. a later migration that failed and was cleaned up with
  # `migrate resolve --rolled-back` on some future ordinary deploy) is
  # excluded from the comparison -- otherwise every deploy after the first
  # such cleanup would be permanently rejected by a snapshot StageB could
  # never have known about.
  expected_resolved_sha="$(jq -er '.database.task168.resolvedMigrationAttemptsSha256' "${migration_manifest}")" || fail 'StageB manifest is missing its resolved migration-attempt snapshot binding'
  resolved_rows_raw="$(dbq "SELECT migration_name || '|' || COALESCE(checksum,'') || '|' || COALESCE(finished_at::text,'') || '|' || COALESCE(rolled_back_at::text,'') FROM \"_prisma_migrations\" WHERE finished_at IS NULL AND rolled_back_at IS NOT NULL ORDER BY migration_name,rolled_back_at,checksum,id")" || fail 'resolved migration-attempt query failed'
  resolved_le_m11=()
  while IFS= read -r resolved_line; do
    [[ -n "${resolved_line}" ]] || continue
    resolved_name="${resolved_line%%|*}"
    [[ "${resolved_name}" == "${M11_NAME}" || "${resolved_name}" < "${M11_NAME}" ]] || continue
    resolved_le_m11+=("${resolved_line}")
  done <<<"${resolved_rows_raw}"
  resolved_snapshot_text="$(printf '%s\n' "${resolved_le_m11[@]:-}")"
  resolved_snapshot_sha="$(printf '%s' "${resolved_snapshot_text}" | sha256sum | awk '{print $1}')"
  [[ "${resolved_snapshot_sha}" == "${expected_resolved_sha}" ]] || fail 'L4 violated: rolled-back migration-attempt snapshot at or before M11 differs from the StageB receipt'

  echo '[task168-final-steady] check-only passed: StageB receipts present and bound to this database'
  exit 0
fi

# ── --migrate: apply whatever is pending. M11 is always a no-op here (it was
# applied by StageB); anything after it already passed the expand-contract
# gate in CI, so this is an ordinary `prisma migrate deploy`. ─────────────────
tmp="$(mktemp -d "${TMPDIR:-/tmp}/task168-final-steady.XXXXXX")"
c=''
cleanup(){ local rc=$?; [[ -z "${c}" ]] || docker rm -f "${c}" >/dev/null 2>&1 || true; rm -rf "${tmp}"; exit "${rc}"; }
trap cleanup EXIT
mkdir -p "${tmp}/migrations"
cp "${SOURCE_DIR}/apps/v1_api/prisma/migrations/migration_lock.toml" "${tmp}/migrations/"
cp "${SOURCE_DIR}/apps/v1_api/prisma/schema.prisma" "${tmp}/schema.prisma"
for name in "${source_names[@]}"; do
  cp -R "${SOURCE_DIR}/apps/v1_api/prisma/migrations/${name}" "${tmp}/migrations/${name}"
done
c="$("${compose[@]}" run -d --no-deps --entrypoint sh v1_api -c 'while :; do sleep 3600; done')"
docker cp "${tmp}/." "${c}:/tmp/task168-final"
docker exec -u 0 "${c}" sh -ceu 'chown -R app:app /tmp/task168-final'
docker exec -u app "${c}" sh -ceu 'cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy --schema /tmp/task168-final/schema.prisma'
docker exec -u app "${c}" sh -ceu 'cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate status --schema /tmp/task168-final/schema.prisma'

# Re-verify L1 holds after the deploy: every row the deploy just applied must
# still resolve to a name+checksum pair from the same candidate source tree.
rows_after="$(dbq "SELECT migration_name || '|' || COALESCE(checksum,'') || '|' || CASE WHEN finished_at IS NOT NULL THEN 't' ELSE 'f' END || '|' || CASE WHEN rolled_back_at IS NOT NULL THEN 't' ELSE 'f' END FROM \"_prisma_migrations\" ORDER BY migration_name")" || fail 'post-migrate ledger query failed'
while IFS='|' read -r name checksum finished rolledback; do
  [[ -n "${name}" ]] || continue
  [[ "${finished}" == t && "${rolledback}" == f ]] || continue
  [[ -n "${SOURCE_SHA[${name}]:-}" && "${SOURCE_SHA[${name}]}" == "${checksum}" ]] || fail "post-migrate L1 violated: '${name}' is applied but not in (or differs from) the candidate source tree"
done <<<"${rows_after}"

echo '[task168-final-steady] migrate deploy complete'

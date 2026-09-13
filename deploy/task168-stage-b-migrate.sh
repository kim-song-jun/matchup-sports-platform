#!/usr/bin/env bash
# Task 168 Stage B final retirement runner. Alpha only; M11 is irreversible at
# the application-image layer and is never dispatched through the Stage A runner.
#
# CLI contract is frozen (task168-stageb-a2 contract §3): exactly five named
# flags below, usage/arg errors exit 64, every other failure exits 1 with a
# "[task168-stage-b] " stderr line. Concurrent-run locking is NOT this
# script's job — the wrapper (deploy-alpha-stage-b.sh, wiring track) holds an
# flock around every invocation (contract §7).
set -Eeuo pipefail
usage(){ echo "usage: $0 --source-dir D --manifest F --compose-prod F --compose-alpha F --env-file F" >&2; exit 64; }
SOURCE_DIR= MANIFEST= COMPOSE_PROD= COMPOSE_ALPHA= ENV_FILE=
while (($#)); do case "$1" in
  --source-dir) SOURCE_DIR=${2:?}; shift 2;;
  --manifest) MANIFEST=${2:?}; shift 2;;
  --compose-prod) COMPOSE_PROD=${2:?}; shift 2;;
  --compose-alpha) COMPOSE_ALPHA=${2:?}; shift 2;;
  --env-file) ENV_FILE=${2:?}; shift 2;;
  *) usage;;
esac; done
[[ -d "$SOURCE_DIR" && -f "$MANIFEST" && -f "$COMPOSE_PROD" && -f "$COMPOSE_ALPHA" && -f "$ENV_FILE" ]] || usage
sha(){ sha256sum "$1" | awk '{print $1}'; }
FAILURE_REASON=""
fail(){ FAILURE_REASON="$*"; echo "[task168-stage-b] $*" >&2; exit 1; }

# jq-generate, jq-validate, atomically publish. Content comes from stdin so
# every receipt is built with `jq -n` (no string interpolation into JSON) and
# is schema-checked against its own bytes before anything can read it.
# `mv -n` is not atomically no-clobber on its own (GNU/BSD mv both silently
# skip and return 0 when the destination exists), so existence of the temp
# file after the move is the actual no-clobber signal.
write_json(){
  local path="$1" validate_filter="$2" tmp
  install -d -m 700 "$(dirname "$path")"
  tmp="$(mktemp "$(dirname "$path")/.task168.XXXXXX")" || fail "cannot create receipt temp file for $path"
  cat > "$tmp"
  chmod 600 "$tmp"
  jq -e "$validate_filter" "$tmp" >/dev/null || { rm -f "$tmp"; fail "receipt failed its own schema check: $path"; }
  mv -n "$tmp" "$path"
  if [[ -e "$tmp" ]]; then rm -f "$tmp"; fail "receipt already exists, refusing to overwrite: $path"; fi
}

readonly TASK_SCHEMA_SHA=e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46
readonly STAGE_A_SCHEMA_SHA=91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f
readonly M11=20260911090000_retire_tournament_fixture_tables
readonly M11_SHA=08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323
readonly M1=(20260908130000_v1_team_match_tournament_expand 20260908150000_v1_operation_audit_team_match_expand 20260908160000_v1_official_fact_team_match_scope 20260908170000_v1_lineup_invalidation 20260908180000_v1_staff_scope_team_match 20260909000000_v1_tournament_result_lineage 20260909110000_v1_operation_audit_canonical_binding)
readonly M8=20260910010000_v1_official_fact_source_history
readonly M9=20260910020000_v1_canonical_game_db_guards
readonly M10=20260910160000_v1_outbox_cutover_claim_gate
readonly ALL_MIGRATIONS=("${M1[@]}" "$M8" "$M9" "$M10" "$M11")
# Backup format is U4 (single-place placeholder until the user decides
# plain-sql-gzip vs custom). Every downstream reference reads this one
# variable so U4 resolves to a one-line change.
readonly BACKUP_FORMAT=custom
# round-3 blocking finding #2: the constant above used to be receipt-only
# decoration -- the actual dump (`pg_dump --format=custom`) and verify
# (`pg_restore --list`) commands were hardcoded past it, so flipping U4 to
# plain-sql-gzip would have produced a receipt claiming plain-sql-gzip while
# the file on disk was still a custom dump, and the restore procedure
# (spec §6.3-4) would pick the wrong tool. Fail before any writer is touched
# if BACKUP_FORMAT is ever anything neither backup_dump/backup_verify below
# knows how to handle.
case "$BACKUP_FORMAT" in
  custom|plain-sql-gzip) ;;
  *) fail "unsupported BACKUP_FORMAT: $BACKUP_FORMAT" ;;
esac
# Both read the one BACKUP_FORMAT constant above; called with the compose
# helper, DB_USER/DB_NAME (set once the target DB identity is verified) and a
# destination/source path. `dump` writes the backup to $2; `verify` proves
# the bytes at $1 are a well-formed backup of that format without applying
# them (never actually restores).
backup_dump(){
  local dest="$1"
  case "$BACKUP_FORMAT" in
    custom) "${compose[@]}" exec -T v1_postgres sh -ceu 'pg_dump --format=custom --no-owner --no-acl -U "$1" -d "$2"' sh "$DB_USER" "$DB_NAME" > "$dest" ;;
    plain-sql-gzip) "${compose[@]}" exec -T v1_postgres sh -ceu 'pg_dump --format=plain --no-owner --no-acl -U "$1" -d "$2" | gzip -c' sh "$DB_USER" "$DB_NAME" > "$dest" ;;
  esac
}
backup_verify(){
  local src="$1"
  case "$BACKUP_FORMAT" in
    custom) "${compose[@]}" exec -T v1_postgres sh -ceu 'pg_restore --list -U "$1" -d "$2" >/dev/null' sh "$DB_USER" "$DB_NAME" < "$src" ;;
    plain-sql-gzip) gunzip -t "$src" ;;
  esac
}
# Disk headroom coefficient is a single named constant (U4-adjacent decision
# left to real-world measurement) so future tuning is also a one-line change.
readonly BACKUP_DISK_HEADROOM_FACTOR=3

EXPECTED_MIGRATION_NAMES="$(printf '%s\n' "${ALL_MIGRATIONS[@]}" | jq -Rsc 'split("\n") | map(select(length > 0))')" || fail 'could not construct ordered migration contract'

# Full manifest contract check, run before any host/container mutation.
# Independent review r1-4: the candidate left `schemaSha256`,
# `runtimeClientSchemaSha256`, `migrationValidatedFrom`/`rollbackCompatibleWith`
# null-ness, and image repository/digest/uri self-consistency unchecked. Per
# contract §5/§10, this runner does not call `validate_alpha_stage_b_final_manifest`
# (that stays creator/resume/recover-only to avoid a second verification path);
# instead the runner's own inline jq contract absorbs the missing fields.
jq -e --argjson names "$EXPECTED_MIGRATION_NAMES" --arg schema "$TASK_SCHEMA_SHA" '
  .schemaVersion == 1
  and .environment == "alpha"
  and (.release.version | strings | length > 0)
  and (.source.key | strings | endswith(".tar.gz"))
  and (.source.sha256 | strings | test("^[0-9a-f]{64}$"))
  and .database.migrationPolicy == "task168-stageBFinal"
  and .database.rollbackMode == "backup-only"
  and .database.compatibilityCheck == "expand-contract-sql-v1"
  and .database.migrationValidatedFrom == null
  and .database.rollbackCompatibleWith == null
  and .database.task168.stage == "stageBFinal"
  and .database.task168.schemaSha256 == $schema
  and .database.task168.runtimeClientSchemaSha256 == $schema
  and (.database.task168.recoveryFrom == null)
  and (.database.task168.rollbackTarget == null)
  and ([.database.task168.migrations[].name] == $names)
  and (.database.task168.fullMigrationHistory | type == "array" and length > 11)
  and (.database.task168.resolvedMigrationAttemptsSha256 | strings | test("^[0-9a-f]{64}$"))
  and (.database.task168.predecessor.releaseSha | strings | test("^[0-9a-f]{40}$"))
  and (.database.task168.predecessor.transition | strings | length > 0)
  and (.database.task168.finalImagePreflight.receipt | strings | length > 0)
  and (.database.task168.finalImagePreflight.receiptSha256 | strings | test("^[0-9a-f]{64}$"))
  and (.images.api.repository | strings | length > 0)
  and (.images.web.repository | strings | length > 0)
  and (.images.cutoverTool.repository | strings | length > 0)
  and (.images.api.digest | strings | test("^sha256:[0-9a-f]{64}$"))
  and (.images.web.digest | strings | test("^sha256:[0-9a-f]{64}$"))
  and (.images.cutoverTool.digest | strings | test("^sha256:[0-9a-f]{64}$"))
  and .images.api.uri == (.images.api.repository + "@" + .images.api.digest)
  and .images.web.uri == (.images.web.repository + "@" + .images.web.digest)
  and .images.cutoverTool.uri == (.images.cutoverTool.repository + "@" + .images.cutoverTool.digest)
' "$MANIFEST" >/dev/null || fail 'manifest is not the exact StageBFinal/backup-only contract'
RELEASE_SHA="$(jq -er '.release.sha | strings | select(test("^[0-9a-f]{40}$"))' "$MANIFEST")" || fail 'release SHA is not authenticated'
API_IMAGE="$(jq -er '.images.api.uri | strings | select(length > 0)' "$MANIFEST")" || fail 'API image is missing'
PREDECESSOR_RELEASE="$(jq -er '.database.task168.predecessor.releaseSha | strings | select(test("^[0-9a-f]{40}$"))' "$MANIFEST")" || fail 'predecessor Stage A release is missing'
PREDECESSOR_TRANSITION="$(jq -er '.database.task168.predecessor.transition | strings | select(length > 0)' "$MANIFEST")" || fail 'predecessor transition path is missing'
PREDECESSOR_TRANSITION_SHA="$(jq -er '.database.task168.predecessor.transitionSha256 | strings | select(test("^[0-9a-f]{64}$"))' "$MANIFEST")" || fail 'predecessor transition hash is missing'
PREDECESSOR_SCHEMA_SHA="$(jq -er --arg schema "$STAGE_A_SCHEMA_SHA" '.database.task168.predecessor.schemaSha256 | select(.==$schema)' "$MANIFEST")" || fail 'predecessor Stage A schema binding is missing'
PREDECESSOR_API_IMAGE="$(jq -er '.database.task168.predecessor.apiImage | strings | select(length > 0)' "$MANIFEST")" || fail 'predecessor API image is missing'
FINAL_PREFLIGHT_RECEIPT="$(jq -er '.database.task168.finalImagePreflight.receipt | strings | select(length > 0)' "$MANIFEST")" || fail 'final image preflight receipt is missing'
FINAL_PREFLIGHT_SHA="$(jq -er '.database.task168.finalImagePreflight.receiptSha256 | strings | select(test("^[0-9a-f]{64}$"))' "$MANIFEST")" || fail 'final image preflight receipt hash is missing'
FINAL_PREFLIGHT_REPORT="$(jq -er '.rehearsal.report | strings | select(length > 0)' "$FINAL_PREFLIGHT_RECEIPT" 2>/dev/null || true)"
FINAL_PREFLIGHT_REPORT_SHA="$(jq -er '.rehearsal.reportSha256 | strings | select(test("^[0-9a-f]{64}$"))' "$FINAL_PREFLIGHT_RECEIPT" 2>/dev/null || true)"
SOURCE_SHA="$(jq -er '.source.sha256 | strings | select(test("^[0-9a-f]{64}$"))' "$MANIFEST")" || fail 'release source hash is missing'
INPUT_SNAPSHOT_SHA="$(jq -er '.database.task168.finalImagePreflight.inputSnapshotSha256 | strings | select(test("^[0-9a-f]{64}$"))' "$MANIFEST")" || fail 'input snapshot hash is missing'
WEB_IMAGE="$(jq -er '.images.web.uri | strings | select(length > 0)' "$MANIFEST")" || fail 'final web image is missing'
RESOLVED_ATTEMPTS_SHA="$(jq -er '.database.task168.resolvedMigrationAttemptsSha256 | strings | select(test("^[0-9a-f]{64}$"))' "$MANIFEST")" || fail 'resolved migration-attempt snapshot binding is missing'
TOOL_IMAGE="$(jq -er '.images.cutoverTool.uri | strings | select(length > 0)' "$MANIFEST")" || fail 'final cutover image is missing'
[[ "$API_IMAGE" =~ @sha256:[0-9a-f]{64}$ ]] || fail 'final API image is not immutable'
[[ -s "$FINAL_PREFLIGHT_RECEIPT" && "$(sha "$FINAL_PREFLIGHT_RECEIPT")" == "$FINAL_PREFLIGHT_SHA" ]] || fail 'final image preflight receipt is missing or changed'
FULL_MIGRATION_HISTORY="$(jq -cer ' .database.task168.fullMigrationHistory | select(type=="array" and length>11) ' "$MANIFEST")" || fail 'complete migration history is unavailable'
jq -e --arg m11 "$M11" --arg sha "$M11_SHA" 'length > 11 and ([.[].name] == ([.[].name] | sort)) and ((map(.name)|unique|length)==length) and ([.[] | (.name|strings|test("^[0-9]{14}_")) and (.sha256|strings|test("^[0-9a-f]{64}$"))] | all) and .[-1]=={name:$m11,sha256:$sha}' <<<"$FULL_MIGRATION_HISTORY" >/dev/null || fail 'complete migration history is malformed or M11 is not sole final entry'
EXPECTED_FINAL_MIGRATIONS="$(jq -c '.database.task168.migrations | map({name,sha256})' "$MANIFEST")" || fail 'final migration hashes are unavailable'
[[ -s "$FINAL_PREFLIGHT_REPORT" && "$(sha "$FINAL_PREFLIGHT_REPORT")" == "$FINAL_PREFLIGHT_REPORT_SHA" ]] || fail 'final image preflight rehearsal report is missing or changed'
jq -e --arg release "$RELEASE_SHA" --arg source "$SOURCE_SHA" --arg schema "$TASK_SCHEMA_SHA" --arg snapshot "$INPUT_SNAPSHOT_SHA" --arg api "$API_IMAGE" --arg web "$WEB_IMAGE" --arg tool "$TOOL_IMAGE" --argjson migrations "$EXPECTED_FINAL_MIGRATIONS" --argjson fullHistory "$FULL_MIGRATION_HISTORY" --arg resolvedSha "$RESOLVED_ATTEMPTS_SHA" --arg report "$FINAL_PREFLIGHT_REPORT" --arg reportSha "$FINAL_PREFLIGHT_REPORT_SHA" '.schemaVersion == 1 and .kind == "task168FinalImagePreflight" and .status == "COMPLETED" and .releaseSha == $release and .sourceSha256 == $source and .schemaSha256 == $schema and .apiImage == $api and .webImage == $web and .cutoverToolImage == $tool and (.harness.sourceSha256 == $source) and (.harness.schemaSha256 == $schema) and (.harness.migrationHashes == $migrations) and .harness.fullMigrationHistory == $fullHistory and (.harness.migrationLockSha256 | strings | test("^[0-9a-f]{64}$")) and .harness.resolvedMigrationAttemptsSha256 == $resolvedSha and (.inputSnapshot.kind == "task168-stageB-inputs" and .inputSnapshot.sha256 == $snapshot) and .execution.status == "COMPLETED" and .execution.cleanupStatus == "COMPLETED" and .rehearsal.status == "COMPLETED" and .rehearsal.postM11 == true and .rehearsal.report == $report and .rehearsal.reportSha256 == $reportSha and .rehearsal.catalog.legacyTables == 0 and .rehearsal.catalog.legacyLinkColumns == 0 and .rehearsal.catalog.retirementTriggers == 0 and .rehearsal.catalog.retirementFunctions == 0 and (.rehearsal.ledger.applied == ($migrations | map(.name))) and .rehearsal.fullLedger.applied == ($fullHistory | map(.name)) and .rehearsal.ledger.count == 11 and .rehearsal.ledger.m11OnlyNew == true' "$FINAL_PREFLIGHT_RECEIPT" >/dev/null || fail 'final image preflight receipt is not authenticated for this release/source/schema/images or lacks executable rehearsal evidence'
jq -e --arg schema "$TASK_SCHEMA_SHA" --argjson migrations "$EXPECTED_FINAL_MIGRATIONS" --argjson fullHistory "$FULL_MIGRATION_HISTORY" --arg resolvedSha "$RESOLVED_ATTEMPTS_SHA" '.schemaSha256 == $schema and .migrations == $migrations and .fullMigrationHistory == $fullHistory and .resolvedMigrationAttemptsSha256 == $resolvedSha and .status == "COMPLETED" and .catalog.legacyTables == 0 and .catalog.legacyLinkColumns == 0 and .catalog.retirementTriggers == 0 and .catalog.retirementFunctions == 0 and .ledger.count == 11 and .ledger.m11OnlyNew == true' "$FINAL_PREFLIGHT_REPORT" >/dev/null || fail 'final image preflight report does not contain matching raw catalog/ledger evidence'
SCHEMA="$SOURCE_DIR/apps/v1_api/prisma/schema.prisma"
[[ "$(sha "$SCHEMA")" == "$TASK_SCHEMA_SHA" ]] || fail 'active schema is not the pinned final client schema'
[[ -f "$SOURCE_DIR/apps/v1_api/prisma/migrations/$M11/migration.sql" && "$(sha "$SOURCE_DIR/apps/v1_api/prisma/migrations/$M11/migration.sql")" == "$M11_SHA" ]] || fail 'M11 raw SQL checksum mismatch'
for name in "${ALL_MIGRATIONS[@]}"; do
  path="$SOURCE_DIR/apps/v1_api/prisma/migrations/$name/migration.sql"
  expected="$(jq -er --arg name "$name" '.database.task168.migrations[] | select(.name == $name) | .sha256 | strings | select(test("^[0-9a-f]{64}$"))' "$MANIFEST")" || fail "manifest migration hash missing: $name"
  [[ -f "$path" && "$(sha "$path")" == "$expected" ]] || fail "raw migration checksum mismatch: $name"
done
[[ "$(jq -r '.database.task168.migrations[-1].name' "$MANIFEST")" == "$M11" && "$(jq -r '.database.task168.migrations[-1].sha256' "$MANIFEST")" == "$M11_SHA" ]] || fail 'M11 is not the sole final migration entry'
canonical_history_from_root(){
  local root="$1" result='[]' dir name sql extras
  [[ -f "$root/migration_lock.toml" ]] || fail 'complete migration history lock is missing'
  while IFS= read -r -d '' dir; do
    name="$(basename "$dir")"; sql="$dir/migration.sql"
    [[ -f "$sql" ]] || fail "migration history entry has no migration.sql: $name"
    mapfile -d '' -t extras < <(find "$dir" -mindepth 1 -maxdepth 1 -type f ! -name migration.sql -print0)
    ((${#extras[@]} == 0)) || fail "migration history entry contains unexpected files: $name"
    result="$(jq -c --arg name "$name" --arg sha "$(sha "$sql")" '. + [{name:$name,sha256:$sha}]' <<<"$result")"
  done < <(find "$root" -mindepth 1 -maxdepth 1 -type d -print0 | LC_ALL=C sort -z)
  printf '%s\n' "$result"
}
history_dir="$SOURCE_DIR/apps/v1_api/prisma/migrations"
ACTUAL_SOURCE_HISTORY="$(canonical_history_from_root "$history_dir")"
[[ "$ACTUAL_SOURCE_HISTORY" == "$FULL_MIGRATION_HISTORY" ]] || fail 'source migration directory set or checksum differs from bound complete history'
MIGRATION_LOCK_SHA="$(jq -er '.harness.migrationLockSha256 | strings | select(test("^[0-9a-f]{64}$"))' "$FINAL_PREFLIGHT_RECEIPT")" || fail 'preflight receipt does not bind migration lock'
[[ "$(sha "$history_dir/migration_lock.toml")" == "$MIGRATION_LOCK_SHA" ]] || fail 'source migration lock differs from preflight binding'
while IFS=$'\t' read -r name expected; do
  path="$SOURCE_DIR/apps/v1_api/prisma/migrations/$name/migration.sql"
  [[ -f "$path" && "$(sha "$path")" == "$expected" ]] || fail "complete-history source checksum mismatch: $name"
done < <(jq -r '.[] | [.name,.sha256] | @tsv' <<<"$FULL_MIGRATION_HISTORY")

compose=(docker compose --project-name deploy -f "$COMPOSE_PROD" -f "$COMPOSE_ALPHA" --env-file "$ENV_FILE")
[[ "$("${compose[@]}" ps -q v1_postgres | sed '/^$/d' | wc -l | tr -d ' ')" == 1 ]] || fail 'expected exactly one database container'
postgres_id="$("${compose[@]}" ps -q v1_postgres | sed '/^$/d')"
DB_USER="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$postgres_id" | awk -F= '$1=="POSTGRES_USER" {print substr($0,index($0,"=")+1)}')"
DB_NAME="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$postgres_id" | awk -F= '$1=="POSTGRES_DB" {print substr($0,index($0,"=")+1)}')"
[[ "$DB_USER" =~ ^[A-Za-z_][A-Za-z0-9_]*$ && "$DB_NAME" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || fail 'database container does not expose one valid POSTGRES_USER/POSTGRES_DB binding'
dbq(){ "${compose[@]}" exec -T v1_postgres psql -X -v ON_ERROR_STOP=1 -At -U "$DB_USER" -d "$DB_NAME" -c "$1"; }
DB_ID="$(dbq "SELECT current_database() || '|' || current_user || '|' || COALESCE(inet_server_addr()::text,'local') || '|' || COALESCE(inet_server_port()::text,'local')")" || fail 'target DB identity unavailable'
EXPECTED_DB_ID="$(jq -er '.database.task168.predecessor.databaseIdentity' "$MANIFEST")" || fail 'manifest database identity missing'
[[ "$DB_ID" == "$EXPECTED_DB_ID" ]] || fail 'database identity differs from predecessor binding'

# newDefect(blocking): the one-off migration runner container inherits
# v1_api's compose-rendered DATABASE_URL, which is not otherwise bound to the
# `v1_postgres` identity everything above just verified. Render the same
# config M11 will actually run under and require it to point at the exact
# service (and user/db pair) `dbq` used, before any writer is touched.
V1_API_DATABASE_URL="$(jq -er '.services.v1_api.environment.DATABASE_URL // empty' <<<"$("${compose[@]}" config --format json)")" || fail 'v1_api DATABASE_URL is not resolvable from the rendered compose config'
[[ "$V1_API_DATABASE_URL" =~ ^postgres(ql)?://([^:@/]+):[^@]*@([^:/]+):[0-9]+/([^?]+)(\?.*)?$ ]] || fail 'v1_api DATABASE_URL has an unexpected form'
db_url_user="${BASH_REMATCH[2]}"; db_url_host="${BASH_REMATCH[3]}"; db_url_name="${BASH_REMATCH[4]}"; db_url_query="${BASH_REMATCH[5]#\?}"
[[ "$db_url_host" == v1_postgres ]] || fail 'v1_api DATABASE_URL host is not the verified v1_postgres service; refusing to migrate an unauthenticated database'
[[ "$db_url_user" == "$DB_USER" && "$db_url_name" == "$DB_NAME" ]] || fail 'v1_api DATABASE_URL user/database differs from the verified v1_postgres identity'
# nonBlocking finding (round-3 review): host/user/db alone still let a query
# string retarget the connection -- Prisma honours `?schema=`, and libpq
# honours `?options=...` (which can itself set `-csearch_path=...`). Either
# would migrate against something other than the verified public schema of
# the identity checked above, so reject both before any writer is touched.
if [[ -n "$db_url_query" ]]; then
  while IFS='=' read -r qk qv; do
    [[ -n "$qk" ]] || continue
    case "$qk" in
      schema) [[ "$qv" == public ]] || fail 'v1_api DATABASE_URL targets a non-public schema; refusing to migrate an unauthenticated target' ;;
      options) fail 'v1_api DATABASE_URL sets libpq options (can override search_path); refusing to migrate an unauthenticated target' ;;
    esac
  done < <(tr '&' '\n' <<<"$db_url_query")
fi

[[ -f "$PREDECESSOR_TRANSITION" && "$(sha "$PREDECESSOR_TRANSITION")" == "$PREDECESSOR_TRANSITION_SHA" ]] || fail 'predecessor transition receipt missing or changed'
EXPECTED_PREDECESSOR_MIGRATIONS="$(jq -c '.database.task168.migrations[0:10] | map({name,sha256})' "$MANIFEST")" || fail 'manifest predecessor migration boundary is malformed'
jq -e --arg rel "$PREDECESSOR_RELEASE" --arg api "$PREDECESSOR_API_IMAGE" --arg db "$DB_ID" --arg schema "$PREDECESSOR_SCHEMA_SHA" --argjson first10 "$EXPECTED_PREDECESSOR_MIGRATIONS" '.status=="COMPLETED" and .stage=="stageAIntermediate" and .releaseSha==$rel and .apiImage==$api and .databaseIdentity==$db and .schemaSha256==$schema and (.migrationHashes == $first10) and (.quiesceReceiptSha256|test("^[0-9a-f]{64}$")) and (.backupReceiptSha256|test("^[0-9a-f]{64}$")) and (.backupSha256|test("^[0-9a-f]{64}$")) and (.cutoverReportSha256|test("^[0-9a-f]{64}$"))' "$PREDECESSOR_TRANSITION" >/dev/null || fail 'predecessor transition is not an authenticated completed Stage A receipt'
verify_artifact(){ local path="$1" expected="$2"; [[ -s "$path" && "$(sha "$path")" == "$expected" ]] || fail "predecessor artifact missing or changed: $path"; }
verify_artifact "$(jq -er '.quiesceReceipt' "$PREDECESSOR_TRANSITION")" "$(jq -er '.quiesceReceiptSha256' "$PREDECESSOR_TRANSITION")"
verify_artifact "$(jq -er '.backupReceipt' "$PREDECESSOR_TRANSITION")" "$(jq -er '.backupReceiptSha256' "$PREDECESSOR_TRANSITION")"
verify_artifact "$(jq -er '.cutoverReport' "$PREDECESSOR_TRANSITION")" "$(jq -er '.cutoverReportSha256' "$PREDECESSOR_TRANSITION")"
prior_quiesce="$(jq -er '.quiesceReceipt' "$PREDECESSOR_TRANSITION")"; prior_backup_receipt="$(jq -er '.backupReceipt' "$PREDECESSOR_TRANSITION")"; prior_report="$(jq -er '.cutoverReport' "$PREDECESSOR_TRANSITION")"; prior_backup="$(jq -er '.backupPath' "$prior_backup_receipt")"
jq -e --arg rel "$PREDECESSOR_RELEASE" --arg api "$PREDECESSOR_API_IMAGE" --arg db "$DB_ID" '.schemaVersion==1 and .status=="COMPLETED" and .stage=="stageAIntermediate" and .releaseSha==$rel and .apiImage==$api and .databaseIdentity==$db and (.services|sort)==["v1_api","v1_game_operations_worker"]' "$prior_quiesce" >/dev/null || fail 'predecessor quiesce receipt is not bound to the recovered Stage A'
jq -e --arg rel "$PREDECESSOR_RELEASE" --arg api "$PREDECESSOR_API_IMAGE" --arg db "$DB_ID" '(.schemaVersion==1 and .status=="COMPLETED" and .stage=="stageAIntermediate" and .releaseSha==$rel and .apiImage==$api and .databaseIdentity==$db and ((.backupBytes|type)=="number") and (.backupBytes>0) and (.backupSha256|test("^[0-9a-f]{64}$")))' "$prior_backup_receipt" >/dev/null || fail 'predecessor backup receipt is not authenticated'
verify_artifact "$prior_backup" "$(jq -er '.backupSha256' "$prior_backup_receipt")"; [[ "$(wc -c < "$prior_backup" | tr -d ' ')" == "$(jq -er '.backupBytes' "$prior_backup_receipt")" ]] || fail 'predecessor backup bytes changed'

# missedDefect: Stage A treats COMPLETED_WITH_GATE_RELEASE_ERROR + an
# authenticated committedResume as a valid completed transition (its own
# assert_transition_report). The candidate accepted only literal COMPLETED,
# so a predecessor that finished through that resume path could never feed
# a Stage B run. Mirror Stage A's rule exactly.
assert_predecessor_report(){
  local report_path="$1" report_status resume_path resume_sha
  report_status="$(jq -er '.status' "$report_path")" || fail 'predecessor cutover report has no status'
  case "$report_status" in
    COMPLETED)
      jq -e '.result.verification.remainingLegacyGameLinks==0 and .result.verification.remainingLegacyStaffScopes==0 and .result.verification.remainingLegacyAuditScopes==0' "$report_path" >/dev/null \
        || fail 'predecessor report has legacy links'
      ;;
    COMPLETED_WITH_GATE_RELEASE_ERROR)
      resume_path="$(jq -er '.committedResume' "$PREDECESSOR_TRANSITION")" || fail 'gate-error predecessor transition lacks committedResume'
      resume_sha="$(jq -er '.committedResumeSha256' "$PREDECESSOR_TRANSITION")" || fail 'gate-error predecessor transition lacks committedResumeSha256'
      [[ -s "$resume_path" && "$resume_sha" =~ ^[0-9a-f]{64}$ && "$(sha "$resume_path")" == "$resume_sha" ]] \
        || fail 'gate-error predecessor lacks authenticated committed-resume evidence'
      jq -e --arg db "$DB_ID" --arg schema "$PREDECESSOR_SCHEMA_SHA" --arg report "$report_path" \
        --arg reportSha "$(jq -er '.cutoverReportSha256' "$PREDECESSOR_TRANSITION")" \
        --arg release "$PREDECESSOR_RELEASE" --arg api "$PREDECESSOR_API_IMAGE" \
        --arg quiesce "$prior_quiesce" --arg quiesceSha "$(jq -er '.quiesceReceiptSha256' "$PREDECESSOR_TRANSITION")" \
        --arg backup "$prior_backup_receipt" --arg backupSha "$(jq -er '.backupReceiptSha256' "$PREDECESSOR_TRANSITION")" \
        --arg backupPath "$prior_backup" --arg backupPathSha "$(jq -er '.backupSha256' "$PREDECESSOR_TRANSITION")" \
        '.schemaVersion==1 and .kind=="committedCutoverResume" and .status=="AUTHENTICATED" and .stage=="stageAIntermediate"
         and .databaseIdentity==$db and .schemaSha256==$schema and .releaseSha==$release and .apiImage==$api
         and .cutoverReport==$report and .cutoverReportSha256==$reportSha
         and .quiesceReceipt==$quiesce and .quiesceReceiptSha256==$quiesceSha
         and .backupReceipt==$backup and .backupReceiptSha256==$backupSha
         and .backupPath==$backupPath and .backupSha256==$backupPathSha' "$resume_path" >/dev/null \
        || fail 'gate-error committed-resume evidence is not authenticated'
      jq -e '.result.verification.remainingLegacyGameLinks==0 and .result.verification.remainingLegacyStaffScopes==0 and .result.verification.remainingLegacyAuditScopes==0' "$report_path" >/dev/null \
        || fail 'gate-error predecessor report has legacy links'
      ;;
    *) fail 'predecessor cutover report has unsupported status' ;;
  esac
}
assert_predecessor_report "$prior_report"

# Timezone-dependent resolved-attempt hashing (rolled_back_at::text) is left
# unchanged here on purpose: RESOLVED_ATTEMPTS_SHA above is produced by
# task168-final-image-preflight.sh with this exact query shape, and that file
# is outside this delegation's owned paths. Changing the formula on only one
# side would silently break every StageB run instead of merely leaving a
# theoretical cross-TZ risk. See the final report for the coordination note.
full_ledger_rows(){ dbq "SELECT migration_name || '|' || COALESCE(checksum,'') || '|' || CASE WHEN finished_at IS NOT NULL AND rolled_back_at IS NULL THEN 'applied' ELSE 'invalid' END FROM \"_prisma_migrations\" WHERE rolled_back_at IS NULL ORDER BY migration_name,id"; }
resolved_attempt_rows(){ dbq "SELECT migration_name || '|' || COALESCE(checksum,'') || '|' || COALESCE(finished_at::text,'') || '|' || COALESCE(rolled_back_at::text,'') FROM \"_prisma_migrations\" WHERE finished_at IS NULL AND rolled_back_at IS NOT NULL ORDER BY migration_name,rolled_back_at,checksum,id"; }
resolved_attempt_sha(){ local rows; rows="$(resolved_attempt_rows)" || fail 'resolved migration-attempt query failed'; printf '%s' "$rows" | sha256sum | awk '{print $1}'; }
assert_resolved_attempts(){ [[ "$(resolved_attempt_sha)" == "$RESOLVED_ATTEMPTS_SHA" ]] || fail 'resolved migration-attempt audit snapshot changed'; [[ "$(dbq "SELECT count(*) FROM \"_prisma_migrations\" WHERE (finished_at IS NULL AND rolled_back_at IS NULL) OR (finished_at IS NOT NULL AND rolled_back_at IS NOT NULL)")" == 0 ]] || fail 'unresolved or unclassified migration attempt exists'; }
expected_full_ledger(){ local include_m11="$1"; jq -r --arg m11 "$M11" --argjson include "$include_m11" '.[] | select($include or .name != $m11) | .name + "|" + .sha256 + "|applied"' <<<"$FULL_MIGRATION_HISTORY"; }
assert_full_ledger_rows(){ local include_m11="$1" actual="$2" expected; expected="$(expected_full_ledger "$include_m11")"; [[ "$actual" == "$expected" ]] || fail 'database migration ledger differs from the complete source history'; }
assert_full_ledger(){ local include_m11="$1" actual; actual="$(full_ledger_rows)" || fail 'complete migration ledger query failed'; assert_full_ledger_rows "$include_m11" "$actual"; }
# newDefect(non-blocking) fix: a resolved (rolled-back) attempt sharing a
# Task168 name used to make this query return two rows for that name and
# `ledger_assert_exact` would fail-closed on every run forever. Resolved
# attempts are asserted separately by assert_resolved_attempts(); this query
# only needs to see the currently-applied row.
ledger_rows(){ dbq "SELECT migration_name || '|' || COALESCE(checksum,'') || '|' || CASE WHEN finished_at IS NOT NULL AND rolled_back_at IS NULL THEN 'applied' ELSE 'invalid' END FROM \"_prisma_migrations\" WHERE rolled_back_at IS NULL AND migration_name IN ('${M1[0]}','${M1[1]}','${M1[2]}','${M1[3]}','${M1[4]}','${M1[5]}','${M1[6]}','$M8','$M9','$M10','$M11') ORDER BY migration_name"; }
ledger_assert_exact(){
  local expected_count="$1"; local rows="$2"; shift 2; local name expected actual
  [[ "$(grep -c '|applied$' <<<"$rows")" == "$expected_count" ]] || fail "ledger does not contain exactly $expected_count applied migrations"
  for name in "$@"; do
    expected="$(jq -er --arg n "$name" '.database.task168.migrations[] | select(.name==$n) | .sha256' "$MANIFEST")" || fail "manifest checksum unavailable: $name"
    [[ "$(grep -c "^$name|" <<<"$rows")" == 1 ]] || fail "ledger does not contain exactly one row for $name"
    actual="$(awk -F'|' -v n="$name" '$1==n {print $2}' <<<"$rows")"
    [[ "$actual" == "$expected" ]] || fail "database ledger checksum mismatch: $name"
  done
}
# r1-6 (NOT_RESOLVED): the candidate inferred `retirementTriggers`/`retirementFunctions`
# absence from the retirement-write/link functions being gone, and never checked
# the three CREATE OR REPLACE guard functions M11 rewrites, the exact CHECK
# definitions it re-adds, or the audit constraint it drops. Query each directly.
catalog_checks_pre_m11(){
  # T4(c): check "M11 already present" first, with its specific message,
  # before assert_full_ledger(false) -- which expects M11 absent from the
  # *entire* source history and would otherwise fail first with the generic
  # "differs from the complete source history" for the exact same state.
  local rows; assert_resolved_attempts; rows="$(ledger_rows)"; ! grep -q "^$M11|" <<<"$rows" || fail 'M11 is already present in the pre-retirement ledger'; assert_full_ledger false; ledger_assert_exact 10 "$rows" "${M1[@]}" "$M8" "$M9" "$M10";
  [[ "$(dbq "SELECT count(*) FROM v1_outbox_events WHERE status::text='PROCESSING'")" == 0 ]] || fail 'processing outbox rows remain';
  [[ "$(dbq "SELECT count(*) FROM v1_game_cutover_epochs WHERE write_mode::text <> 'new'")" == 0 ]] || fail 'noncanonical game write mode remains';
  [[ "$(dbq "SELECT (SELECT count(*) FROM pg_trigger t WHERE t.tgname='v1_tournament_fixture_retired_write' AND t.tgfoid=to_regprocedure('v1_reject_retired_tournament_fixture_write()') AND t.tgenabled='A' AND t.tgtype::int=62 AND NOT t.tgisinternal AND t.tgrelid IN ('v1_tournament_fixtures'::regclass,'v1_tournament_fixture_results'::regclass,'v1_tournament_fixture_goals'::regclass,'v1_tournament_fixture_videos'::regclass,'v1_tournament_fixture_advancement_edges'::regclass))::text || '|' || (SELECT count(*) FROM pg_trigger t WHERE t.tgname='v1_tournament_fixture_retired_row_write' AND t.tgfoid=to_regprocedure('v1_reject_retired_tournament_fixture_write()') AND t.tgenabled='A' AND t.tgtype::int=27 AND NOT t.tgisinternal AND t.tgrelid IN ('v1_tournament_fixtures'::regclass,'v1_tournament_fixture_results'::regclass,'v1_tournament_fixture_goals'::regclass,'v1_tournament_fixture_videos'::regclass,'v1_tournament_fixture_advancement_edges'::regclass))::text || '|' || (SELECT count(*) FROM pg_trigger t WHERE t.tgname='v1_000_tournament_fixture_retired_link' AND t.tgfoid=to_regprocedure('v1_reject_retired_tournament_fixture_link()') AND t.tgenabled='A' AND t.tgtype::int=23 AND NOT t.tgisinternal AND t.tgrelid IN ('v1_games'::regclass,'v1_tournament_staff_fixture_scopes'::regclass,'v1_operation_audits'::regclass))::text")" == '5|5|3' ]] || fail 'retirement seals are not exact';
  [[ "$(dbq "SELECT (SELECT count(*) FROM v1_games WHERE source_type::text='TOURNAMENT_FIXTURE' OR tournament_fixture_id IS NOT NULL)+(SELECT count(*) FROM v1_tournament_staff_fixture_scopes WHERE fixture_id IS NOT NULL)+(SELECT count(*) FROM v1_operation_audits WHERE fixture_id IS NOT NULL)")" == 0 ]] || fail 'legacy links remain';
  [[ "$(dbq "SELECT count(*) FROM (VALUES ('v1_tournament_fixtures'),('v1_tournament_fixture_results'),('v1_tournament_fixture_goals'),('v1_tournament_fixture_videos'),('v1_tournament_fixture_advancement_edges')) x(name) WHERE to_regclass(x.name) IS NOT NULL")" == 5 ]] || fail 'legacy physical schema is not present before M11';
}
# newDefect fix: disk headroom is a single database-size-derived check so the
# coefficient (BACKUP_DISK_HEADROOM_FACTOR) stays the one place to tune.
assert_disk_headroom(){
  local db_bytes required_bytes state_free tmp_free
  db_bytes="$(dbq "SELECT pg_database_size(current_database())")" || fail 'could not determine database size for the disk headroom check'
  [[ "$db_bytes" =~ ^[0-9]+$ ]] || fail 'database size query returned a non-numeric value'
  required_bytes=$(( db_bytes * BACKUP_DISK_HEADROOM_FACTOR ))
  install -d -m 700 "$state_dir" || fail 'could not prepare the state directory for the disk headroom check'
  state_free="$(df -Pk "$state_dir" | awk 'NR==2{print $4*1024}')" || fail 'could not determine state directory free space'
  tmp_free="$(df -Pk "${TMPDIR:-/tmp}" | awk 'NR==2{print $4*1024}')" || fail 'could not determine TMPDIR free space'
  [[ "$state_free" =~ ^[0-9]+$ && "$tmp_free" =~ ^[0-9]+$ ]] || fail 'disk free space query returned a non-numeric value'
  (( state_free >= required_bytes )) || fail "insufficient disk space in the state directory for a fresh pre-M11 backup (need >= ${required_bytes} bytes, have ${state_free})"
  (( tmp_free >= required_bytes )) || fail "insufficient disk space in TMPDIR for the migration staging copy (need >= ${required_bytes} bytes, have ${tmp_free})"
}

STATE_ROOT="${ALPHA_RELEASE_STATE_DIR:-/home/ec2-user/.teameet-alpha-releases}/task168"; state_dir="$STATE_ROOT/$RELEASE_SHA"; backup_file="$state_dir/pre-m11-backup.sql"; quiesce_intent="$state_dir/quiesce-intent.json"; quiesce="$state_dir/quiesce.json"; receipt_file="$state_dir/migration-stage.json"; m11_marker="$state_dir/m11-entry-marker.json"
[[ ! -e "$receipt_file" ]] || fail 'final retirement receipt already exists'
# spec-backup-overwrite fix: a quiesce receipt already existing for this
# release sha means a prior attempt got at least as far as stopping writers.
# A fresh run must not silently re-quiesce and truncate that backup; recovery
# of a partial attempt is a dedicated entrypoint's job, not this script's.
[[ ! -e "$quiesce" ]] || fail 'a stage-b quiesce receipt already exists for this release; use the dedicated recovery entrypoint instead of a fresh run'
# blocking finding #2: same reasoning for quiesce-intent.json (written below,
# before any writer is stopped) -- its existence means a prior attempt at
# least identified the writers to quiesce.
[[ ! -e "$quiesce_intent" ]] || fail 'a stage-b quiesce-intent receipt already exists for this release; use the dedicated recovery entrypoint instead of a fresh run'
manifest_sha="$(sha "$MANIFEST")"

# newDefect fix (정지 전 preflight 거부): run the full pre-M11 preflight
# (ledger/seal/legacy-link/disk-headroom) once *before* touching any writer.
# An already-applied M11, or any other precondition failure, is now rejected
# with zero container mutation instead of stopping writers first and only
# then discovering the run cannot proceed.
catalog_checks_pre_m11
assert_disk_headroom

pre_api_id="$("${compose[@]}" ps -q v1_api | sed '/^$/d')"; pre_worker_id="$("${compose[@]}" ps -q v1_game_operations_worker | sed '/^$/d')"
[[ -n "$pre_api_id" && -n "$pre_worker_id" ]] || fail 'expected one API and worker container before quiescence'
pre_api_image="$(docker inspect --format '{{.Config.Image}}' "$pre_api_id")"; pre_worker_image="$(docker inspect --format '{{.Config.Image}}' "$pre_worker_id")"
[[ -n "$pre_api_image" && -n "$pre_worker_image" ]] || fail 'pre-quiesce service image identity is unavailable'
[[ "$(docker inspect --format '{{.State.Running}}' "$pre_api_id")" == true && "$(docker inspect --format '{{.State.Running}}' "$pre_worker_id")" == true ]] || fail 'API and worker must both be running before quiescence'
# r1-3 (refuted as RESOLVED by independent re-review): the manifest-bound
# PREDECESSOR_API_IMAGE was never compared against the image actually running
# right now. Without this, a writer running some other image than the
# authenticated Stage A predecessor would still be quiesced, migrated past,
# and — on a before_m11 failure — restored back into service unverified.
[[ "$pre_api_image" == "$PREDECESSOR_API_IMAGE" && "$pre_worker_image" == "$PREDECESSOR_API_IMAGE" ]] || fail 'currently running writer image does not match the authenticated Stage A predecessor image'
pre_api_restart_policy="$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$pre_api_id")" || fail 'cannot read the pre-quiesce v1_api restart policy'
pre_worker_restart_policy="$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$pre_worker_id")" || fail 'cannot read the pre-quiesce worker restart policy'
[[ -n "$pre_api_restart_policy" ]] || pre_api_restart_policy=no
[[ -n "$pre_worker_restart_policy" ]] || pre_worker_restart_policy=no
restart_policy_before_json="$(jq -n --arg api "$pre_api_restart_policy" --arg worker "$pre_worker_restart_policy" '{api:$api,worker:$worker}')" || fail 'cannot encode the pre-quiesce restart policy snapshot'
# blocking finding #2: the pre-quiesce container ids/images/restart policies
# above exist only in shell memory until quiesce.json is written after the
# backup finishes (the longest step, on a real DB). A kill in that window
# (SIGKILL, or SIGTERM before the trap fix above can run) leaves writers
# stopped with restart=no and nothing on disk identifying them -- a fresh
# run refuses (quiesce.json/quiesce-intent.json guard above and after this
# write), and a recovery entrypoint has no receipt to recover from. Record
# the identity atomically, before any writer is touched, so that a kill
# anywhere after this point leaves a recoverable trace even if quiesce.json
# itself never gets written. Recovering FROM this file is the wrapper
# track's job (deploy-alpha-stage-b.sh stageBRecover, out of scope here).
quiesce_intent_json="$(jq -n \
  --arg releaseSha "$RELEASE_SHA" --arg apiImage "$API_IMAGE" --arg predecessor "$PREDECESSOR_RELEASE" \
  --arg dbId "$DB_ID" --arg manifestSha "$manifest_sha" \
  --arg preApiId "$pre_api_id" --arg preWorkerId "$pre_worker_id" \
  --arg preApiImage "$pre_api_image" --arg preWorkerImage "$pre_worker_image" \
  --argjson restartBefore "$restart_policy_before_json" \
  --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{schemaVersion:1,kind:"quiesceIntent",status:"INTENDED",stage:"stageBFinal",releaseSha:$releaseSha,apiImage:$apiImage,previousStageAReleaseSha:$predecessor,databaseIdentity:$dbId,manifestSha256:$manifestSha,services:["v1_api","v1_game_operations_worker"],preApiContainerId:$preApiId,preWorkerContainerId:$preWorkerId,preApiImage:$preApiImage,preWorkerImage:$preWorkerImage,restartPolicyBefore:$restartBefore,intendedAt:$now}'
)" || fail 'cannot encode the quiesce-intent receipt'
printf '%s\n' "$quiesce_intent_json" | write_json "$quiesce_intent" '
  .schemaVersion==1 and .kind=="quiesceIntent" and .status=="INTENDED" and .stage=="stageBFinal"
  and (.releaseSha|strings|test("^[0-9a-f]{40}$")) and (.apiImage|strings|length>0)
  and (.databaseIdentity|strings|length>0) and (.manifestSha256|strings|test("^[0-9a-f]{64}$"))
  and (.services|sort)==["v1_api","v1_game_operations_worker"]
  and (.preApiContainerId|strings|length>0) and (.preWorkerContainerId|strings|length>0)
  and (.preApiImage|strings|length>0) and (.preWorkerImage|strings|length>0)
  and (.restartPolicyBefore.api|strings|length>0) and (.restartPolicyBefore.worker|strings|length>0)
'
phase=before_m11
runner=''
migration_completed=0
cleanup(){ [[ -z "${migration_tmp:-}" ]] || rm -rf "$migration_tmp"; }
# r2-blocking-1: best-effort ledger check from inside the EXIT trap -- if the
# database is unreachable (e.g. the daemon itself is what's failing), fail
# closed to the pre-existing diagnosis-receipt behavior rather than silently
# writing nothing.
m11_committed_in_ledger(){
  local row
  row="$(dbq "SELECT migration_name || '|' || COALESCE(checksum,'') || '|' || CASE WHEN finished_at IS NOT NULL AND rolled_back_at IS NULL THEN 'applied' ELSE 'invalid' END FROM \"_prisma_migrations\" WHERE migration_name = '$M11'" 2>/dev/null || true)"
  [[ "$row" == "$M11|$M11_SHA|applied" ]]
}
restore_pre_quiesce_writers(){
  [[ "$phase" == before_m11 ]] || return 0
  echo '[task168-stage-b] pre-M11 failure; restoring the exact pre-quiesce API and worker containers' >&2
  docker update --restart="$pre_api_restart_policy" "$pre_api_id" >/dev/null 2>&1 || { echo '[task168-stage-b] failed to restore the original v1_api restart policy; manual diagnosis required' >&2; return 1; }
  docker update --restart="$pre_worker_restart_policy" "$pre_worker_id" >/dev/null 2>&1 || { echo '[task168-stage-b] failed to restore the original worker restart policy; manual diagnosis required' >&2; return 1; }
  "${compose[@]}" start v1_api v1_game_operations_worker >/dev/null 2>&1 || { echo '[task168-stage-b] failed to restore pre-quiesce writers; manual diagnosis required' >&2; return 1; }
  local api_id worker_id
  api_id="$("${compose[@]}" ps -q v1_api | sed '/^$/d')"; worker_id="$("${compose[@]}" ps -q v1_game_operations_worker | sed '/^$/d')"
  [[ "$api_id" == "$pre_api_id" && "$worker_id" == "$pre_worker_id" ]] || { echo '[task168-stage-b] restored writer container identity differs; manual diagnosis required' >&2; return 1; }
  [[ "$(docker inspect --format '{{.Config.Image}}' "$api_id")" == "$pre_api_image" && "$(docker inspect --format '{{.Config.Image}}' "$worker_id")" == "$pre_worker_image" ]] || { echo '[task168-stage-b] restored writer image differs; manual diagnosis required' >&2; return 1; }
  [[ "$(docker inspect --format '{{.State.Running}}' "$api_id")" == true && "$(docker inspect --format '{{.State.Running}}' "$worker_id")" == true ]] || { echo '[task168-stage-b] restored writers are not running; manual diagnosis required' >&2; return 1; }
  [[ "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$api_id")" == "$pre_api_restart_policy" && "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$worker_id")" == "$pre_worker_restart_policy" ]] || { echo '[task168-stage-b] restored restart policy differs from the pre-quiesce value; manual diagnosis required' >&2; return 1; }
}
# missedDefect (blocking): the candidate's after_m11 branch only echoed
# "MIGRATION_DIAGNOSIS_REQUIRED" to stderr and wrote nothing to disk, so
# stageBRecover would have had no failure reason, ledger snapshot, or
# artifact hashes to diagnose from. Best-effort by design: this runs from an
# already-failing trap, so every step degrades to a stderr warning instead of
# masking the original failure with a second one.
write_diagnosis_receipt(){
  local reason ledger_snapshot post_backup_sha quiesce_sha diag_json
  reason="${FAILURE_REASON:-unknown after-M11 failure}"
  ledger_snapshot="$(ledger_rows 2>/dev/null || true)"
  post_backup_sha="$(sha "$backup_file" 2>/dev/null || echo null)"
  quiesce_sha="$(sha "$quiesce" 2>/dev/null || echo null)"
  diag_json="$(jq -n \
    --arg releaseSha "$RELEASE_SHA" --arg apiImage "$API_IMAGE" --arg dbId "$DB_ID" \
    --arg manifestSha "${manifest_sha:-}" --arg m11 "$M11" --arg m11Sha "$M11_SHA" \
    --arg reason "$reason" --arg ledger "$ledger_snapshot" \
    --arg quiesceSha "$quiesce_sha" --arg backupSha "$post_backup_sha" \
    --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{schemaVersion:1,kind:"task168StageBMigration",status:"MIGRATION_DIAGNOSIS_REQUIRED",stage:"stageBFinal",releaseSha:$releaseSha,apiImage:$apiImage,databaseIdentity:$dbId,manifestSha256:$manifestSha,m11:$m11,m11Sha256:$m11Sha,failureReason:$reason,ledgerSnapshot:$ledger,quiesceReceiptSha256:$quiesceSha,preM11BackupSha256:$backupSha,failedAt:$now}' \
  2>/dev/null)" || { echo '[task168-stage-b] MIGRATION_DIAGNOSIS_REQUIRED: could not even encode the diagnosis receipt; writers remain stopped for manual diagnosis' >&2; return 1; }
  printf '%s\n' "$diag_json" | write_json "$receipt_file" '.status=="MIGRATION_DIAGNOSIS_REQUIRED" and .kind=="task168StageBMigration" and (.failureReason|strings|length>0) and (.releaseSha|strings|length>0) and (.m11Sha256|strings|test("^[0-9a-f]{64}$"))' 2>/dev/null \
    || { echo '[task168-stage-b] MIGRATION_DIAGNOSIS_REQUIRED: failed to persist the diagnosis receipt; writers remain stopped for manual diagnosis' >&2; return 1; }
  echo "[task168-stage-b] MIGRATION_DIAGNOSIS_REQUIRED receipt written: $receipt_file" >&2
}
cleanup_pre_quiesce(){
  local status=$?
  [[ -z "${runner:-}" ]] || docker rm -f "$runner" >/dev/null 2>&1 || true
  cleanup
  # blocking finding #1: a signal (SIGTERM from an SSM cancel/timeout or a
  # GitHub Actions cancel) that arrives while bash is inside a command
  # substitution (dbq/docker inspect, most of this script's runtime) can make
  # `$?` read back as 0 in this trap even though the run never reached
  # MIGRATION_COMMITTED -- verified experimentally on bash 5.3
  # (`x="$(sleep 6)"` + SIGTERM -> EXIT trap sees status=0). Without this,
  # both branches below are skipped and the script exits 0 with writers
  # stopped and restart=no, and no diagnosis receipt. `migration_completed`
  # is set to 1 only after the MIGRATION_COMMITTED receipt is durably
  # written, so any exit without it is treated as a failure regardless of
  # what `$?` claims.
  if [[ "$status" == 0 && "${migration_completed:-0}" != 1 ]]; then status=1; fi
  if [[ "$status" != 0 && "$phase" == before_m11 ]]; then
    restore_pre_quiesce_writers || status=1
  elif [[ "$status" != 0 && "$phase" == after_m11 ]]; then
    # r2-blocking-1: a signal received while bash is blocked in a foreground
    # command (the `docker exec ... prisma migrate deploy`, not a command
    # substitution) is deferred until that command returns -- so a TERM sent
    # any time during M11's real execution only fires *after* M11 has already
    # committed. Writing MIGRATION_DIAGNOSIS_REQUIRED unconditionally here
    # would then be a false receipt for an already-successful migration, and
    # the only scripted recovery (stageBRecover R-A) refuses whenever
    # migration-stage.json already exists. Check the ledger directly before
    # diagnosing: a committed M11 gets no receipt from this trap at all,
    # exactly as an untrappable SIGKILL in the same window already leaves
    # (m11-entry-marker.json + ledger are the recoverable trace; writing that
    # receipt is stageBRecover's job, out of scope here).
    # round-3 blocking finding #1: the previous version skipped the receipt
    # whenever M11 was committed, full stop -- but `fail()` always exits 1,
    # so every real post-commit check (:550 status drift, :553 full ledger,
    # :555 lineage trigger, :557-558 CHECK defs, :561 audit constraint,
    # :564-566 guard signatures, :567 enum types, :570 outbox, :575 backup
    # hash) also lands here with M11 already committed and got silently
    # swallowed -- a real verification failure with no diagnosis, which
    # stageBRecover's R-A would then treat as recoverable and turn into a
    # false MIGRATION_COMMITTED_RECOVERED. Only a genuine deferred signal
    # (129/130/143 from the TERM/INT/HUP traps above, landing while bash was
    # blocked inside the foreground migrate-deploy/migrate-status exec) is
    # the "nothing actually failed, the exit code just arrived late" case;
    # every other nonzero status past this point is our own explicit fail().
    if [[ "$status" == 129 || "$status" == 130 || "$status" == 143 ]] && m11_committed_in_ledger; then
      echo '[task168-stage-b] M11 is already committed to the ledger and this exit was a deferred signal that arrived while blocked inside the migrate/status exec; leaving no MIGRATION_DIAGNOSIS_REQUIRED receipt so recovery judges from the ledger and m11-entry-marker instead of a false diagnosis' >&2
    else
      write_diagnosis_receipt || true
      echo '[task168-stage-b] MIGRATION_DIAGNOSIS_REQUIRED: writers remain stopped after M11-phase failure' >&2
    fi
  fi
  exit "$status"
}
trap cleanup_pre_quiesce EXIT
# Same root cause as above: without an explicit handler, a signal caught
# mid-command-substitution can lose its exit code by the time the EXIT trap
# runs. These force `exit <128+signum>` so `cleanup_pre_quiesce` always sees
# the real termination reason for the signals a cancel/timeout/manual kill
# actually send.
trap 'exit 143' TERM
trap 'exit 130' INT
trap 'exit 129' HUP
"${compose[@]}" stop v1_api v1_game_operations_worker >/dev/null || fail 'API/worker quiescence failed'
for service in v1_api v1_game_operations_worker; do [[ -z "$("${compose[@]}" ps --status running -q "$service")" ]] || fail "$service remains running after quiescence"; done
# spec-D-6: `restart: always` (docker-compose.prod.yml v1_api/worker) means a
# daemon or host restart would resurrect the pre-M11 writers against a
# post-M11 database even though this script only ever "stops" them. Disable
# automatic restart the moment they are quiesced, and restore the exact prior
# policy (never a hardcoded "always") on the before_m11 recovery path above.
docker update --restart=no "$pre_api_id" "$pre_worker_id" >/dev/null || fail 'could not disable automatic restart for the quiesced writers'
[[ "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$pre_api_id")" == no && "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$pre_worker_id")" == no ]] || fail 'quiesced writer restart policy was not confirmed disabled'
catalog_checks_pre_m11
assert_disk_headroom

# spec-backup-overwrite fix: dump to a fresh temp file inside state_dir,
# verify it, and only then no-clobber-publish it as the release's backup —
# never truncate a backup that might already exist for this release sha.
install -d -m 700 "$state_dir"
backup_tmp="$(mktemp "$state_dir/.task168-backup.XXXXXX")" || fail 'cannot create a backup temp file'
chmod 600 "$backup_tmp"
backup_dump "$backup_tmp" || { rm -f "$backup_tmp"; fail 'fresh pre-M11 backup failed'; }
backup_bytes="$(wc -c < "$backup_tmp" | tr -d ' ')"; backup_sha="$(sha "$backup_tmp")"; [[ "$backup_bytes" =~ ^[1-9][0-9]*$ && "$backup_sha" =~ ^[0-9a-f]{64}$ ]] || { rm -f "$backup_tmp"; fail 'fresh backup is empty or unauthenticated'; }
backup_verify "$backup_tmp" || { rm -f "$backup_tmp"; fail 'fresh backup verification failed'; }
mv -n "$backup_tmp" "$backup_file"
if [[ -e "$backup_tmp" ]]; then rm -f "$backup_tmp"; fail 'pre-M11 backup path already exists; refusing to overwrite'; fi
# manifest_sha/restart_policy_before_json were already computed before the
# writers were touched (quiesce-intent.json, blocking finding #2) -- reused
# here rather than recomputed so both receipts agree by construction.
quiesce_json="$(jq -n \
  --arg releaseSha "$RELEASE_SHA" --arg apiImage "$API_IMAGE" --arg predecessor "$PREDECESSOR_RELEASE" \
  --arg dbId "$DB_ID" --arg manifestSha "$manifest_sha" --arg backupPath "$backup_file" \
  --arg backupSha "$backup_sha" --argjson backupBytes "$backup_bytes" --arg backupFormat "$BACKUP_FORMAT" \
  --arg preApiId "$pre_api_id" --arg preWorkerId "$pre_worker_id" \
  --arg preApiImage "$pre_api_image" --arg preWorkerImage "$pre_worker_image" \
  --argjson restartBefore "$restart_policy_before_json" \
  --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{schemaVersion:1,kind:"quiesce",status:"COMPLETED",stage:"stageBFinal",releaseSha:$releaseSha,apiImage:$apiImage,previousStageAReleaseSha:$predecessor,databaseIdentity:$dbId,manifestSha256:$manifestSha,backupPath:$backupPath,backupSha256:$backupSha,backupBytes:$backupBytes,backupFormat:$backupFormat,services:["v1_api","v1_game_operations_worker"],preApiContainerId:$preApiId,preWorkerContainerId:$preWorkerId,preApiImage:$preApiImage,preWorkerImage:$preWorkerImage,restartPolicyBefore:$restartBefore,restartPolicyDuringQuiesce:"no",completedAt:$now}'
)" || fail 'cannot encode the quiesce receipt'
printf '%s\n' "$quiesce_json" | write_json "$quiesce" '
  .schemaVersion==1 and .kind=="quiesce" and .status=="COMPLETED" and .stage=="stageBFinal"
  and (.releaseSha|strings|test("^[0-9a-f]{40}$")) and (.apiImage|strings|length>0)
  and (.databaseIdentity|strings|length>0) and (.manifestSha256|strings|test("^[0-9a-f]{64}$"))
  and (.backupSha256|strings|test("^[0-9a-f]{64}$")) and (.backupBytes|type=="number" and .>0)
  and (.services|sort)==["v1_api","v1_game_operations_worker"]
  and (.preApiContainerId|strings|length>0) and (.preWorkerContainerId|strings|length>0)
  and (.preApiImage|strings|length>0) and (.preWorkerImage|strings|length>0)
  and (.restartPolicyBefore.api|strings|length>0) and (.restartPolicyBefore.worker|strings|length>0)
  and .restartPolicyDuringQuiesce=="no" and (.completedAt|strings|length>0)
'

migration_tmp="$(mktemp -d "${TMPDIR:-/tmp}/task168-stage-b-migrations.XXXXXX")"
[[ -f "$history_dir/migration_lock.toml" ]] || fail 'complete pinned migration history lock is missing'
while IFS= read -r -d '' history_migration; do [[ -f "$history_migration/migration.sql" ]] || fail "migration history entry has no migration.sql: $history_migration"; done < <(find "$history_dir" -mindepth 1 -maxdepth 1 -type d -print0)
mkdir -p "$migration_tmp/migrations"; cp -Rp "$history_dir/." "$migration_tmp/migrations/"; cp "$SCHEMA" "$migration_tmp/schema.prisma"
[[ "$(canonical_history_from_root "$migration_tmp/migrations")" == "$FULL_MIGRATION_HISTORY" ]] || fail 'copied migration directory set or checksum differs from bound complete history'
[[ "$(sha "$migration_tmp/migrations/migration_lock.toml")" == "$MIGRATION_LOCK_SHA" && "$(sha "$migration_tmp/schema.prisma")" == "$TASK_SCHEMA_SHA" ]] || fail 'copied migration lock or schema differs from bound input'
for name in "${ALL_MIGRATIONS[@]}"; do
  [[ -f "$migration_tmp/migrations/$name/migration.sql" ]] || fail "exact StageB migration is missing from complete history: $name"
  expected="$(jq -er --arg name "$name" '.database.task168.migrations[] | select(.name == $name) | .sha256 | strings | select(test("^[0-9a-f]{64}$"))' "$MANIFEST")" || fail "manifest migration hash missing: $name"
  [[ "$(sha "$migration_tmp/migrations/$name/migration.sql")" == "$expected" ]] || fail "complete-history migration checksum mismatch: $name"
done
docker image inspect "$API_IMAGE" >/dev/null || fail 'final API image is unavailable locally'
jq -e --arg api "$API_IMAGE" '.services.v1_api.image == $api' <<<"$("${compose[@]}" config --format json)" >/dev/null || fail 'compose v1_api image does not match the immutable manifest image'
runner="$("${compose[@]}" run --pull never -d --no-deps --entrypoint sh --label com.teameet.task168.stage-b="$RELEASE_SHA" v1_api -c 'while :; do sleep 3600; done')" || fail 'migration runner container failed to start'
[[ "$runner" =~ ^[0-9a-f]{12,64}$ ]] || fail 'migration runner did not return one container id'
[[ "$(docker inspect --format '{{.Config.Image}}' "$runner")" == "$API_IMAGE" ]] || fail 'migration runner container image differs from manifest-pinned API image'
docker exec -u 0 "$runner" sh -ceu 'test ! -e /tmp/task168 && mkdir /tmp/task168.staging'
docker cp "$migration_tmp/." "$runner:/tmp/task168.staging"
docker exec -u 0 "$runner" sh -ceu 'chown -R app:app /tmp/task168.staging && test -f /tmp/task168.staging/schema.prisma && test -f /tmp/task168.staging/migrations/migration_lock.toml && mv /tmp/task168.staging /tmp/task168'

# spec-mid-termination: SIGKILL (or an SSM executionTimeout kill) cannot be
# trapped, so if it lands between M11 committing and the receipt being
# written, nothing on disk would otherwise say M11 happened at all. Record
# the marker a stageBRecover-style entrypoint needs (quiesce/backup hashes +
# runner container id) atomically, immediately before crossing into the
# irreversible phase. Contract note: §4 does not yet list this file — flagged
# in the final report as a suggested contract addition for the wiring track.
# PR-A2 review round 3 (runner-track item 4): the marker used to omit which
# release/manifest entered M11 -- a wrapper-side stageBRecover reading only
# ALPHA_SHA has no way to bind "this marker is THIS run's" without them, so
# it could certify a days-old backup from a different release as the pre-M11
# backup for whatever sha it happens to be invoked with.
m11_marker_json="$(jq -n --arg releaseSha "$RELEASE_SHA" --arg manifestSha "$manifest_sha" --arg quiesceSha "$(sha "$quiesce")" --arg backupSha "$backup_sha" --arg runner "$runner" --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{schemaVersion:1,kind:"task168StageBM11EntryMarker",status:"ENTERED",releaseSha:$releaseSha,manifestSha256:$manifestSha,quiesceReceiptSha256:$quiesceSha,preM11BackupSha256:$backupSha,runnerContainerId:$runner,enteredAt:$now}')" || fail 'cannot encode the M11 entry marker'
printf '%s\n' "$m11_marker_json" | write_json "$m11_marker" '.schemaVersion==1 and .kind=="task168StageBM11EntryMarker" and .status=="ENTERED" and (.releaseSha|strings|test("^[0-9a-f]{40}$")) and (.manifestSha256|strings|test("^[0-9a-f]{64}$")) and (.quiesceReceiptSha256|strings|test("^[0-9a-f]{64}$")) and (.preM11BackupSha256|strings|test("^[0-9a-f]{64}$")) and (.runnerContainerId|strings|length>0)'

# blocking finding #3 (runner-side): the writers were confirmed stopped only
# once, right after quiescence (line ~431) -- backup and preflight both take
# real time on a real DB, during which an unlocked concurrent deploy (the
# wrapper's deploy lock is the wiring track's job, out of scope here) could
# recreate and restart them with the pre-M11 image before this irreversible
# step. Re-confirm the exact quiesced container ids (not `compose ps -q
# <service>`, which can also match the ephemeral migration-runner container
# started above under the v1_api service) are still stopped with restart=no
# immediately before running M11.
for cid in "$pre_api_id" "$pre_worker_id"; do
  docker inspect "$cid" >/dev/null 2>&1 || fail 'a quiesced writer container no longer exists; refusing to migrate'
  [[ "$(docker inspect --format '{{.State.Running}}' "$cid")" == false ]] || fail 'a quiesced writer is running again; refusing to migrate against writers that may have been revived'
  [[ "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$cid")" == no ]] || fail 'a quiesced writer restart policy changed since quiescence; refusing to migrate'
done

phase=after_m11
docker exec -u app "$runner" sh -ceu 'cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy --schema /tmp/task168/schema.prisma' || fail 'M11 migration failed; leave ledger for explicit diagnosis'; docker exec -u app "$runner" sh -ceu 'cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate status --schema /tmp/task168/schema.prisma' || fail 'post-M11 Prisma migration status has drift'
docker rm -f "$runner" >/dev/null 2>&1 || true

assert_resolved_attempts; assert_full_ledger true; ledger_after="$(ledger_rows)"; ledger_assert_exact 11 "$ledger_after" "${M1[@]}" "$M8" "$M9" "$M10" "$M11"; [[ "$(grep -c "^$M11|$M11_SHA|applied$" <<<"$ledger_after")" == 1 ]] || fail 'post-M11 ledger is not exactly M1-M11'
[[ "$(dbq "SELECT count(*) FROM (VALUES ('v1_tournament_fixtures'),('v1_tournament_fixture_results'),('v1_tournament_fixture_goals'),('v1_tournament_fixture_videos'),('v1_tournament_fixture_advancement_edges')) x(name) WHERE to_regclass(x.name) IS NOT NULL")" == 0 ]] || fail 'retired tables remain'
[[ "$(dbq "SELECT count(*) FROM pg_trigger t WHERE t.tgname='v1_block_tournament_result_lineage_game_reparent' AND t.tgfoid=to_regprocedure('v1_block_tournament_result_lineage_game_reparent()') AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal AND t.tgrelid='v1_games'::regclass")" == 1 ]] || fail 'canonical lineage trigger is missing'
# r1-6 fix: exact CHECK definitions (pg_get_constraintdef), not just names.
[[ "$(dbq "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='v1_games_canonical_source_guard_ck'")" == "CHECK ((((source_type)::text = 'TEAM_MATCH'::text) AND (team_match_id IS NOT NULL)))" ]] || fail 'canonical source guard constraint on v1_games is missing or its definition changed'
[[ "$(dbq "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='v1_staff_scope_canonical_source_guard_ck'")" == "CHECK (((team_match_id IS NOT NULL) AND (tournament_id IS NOT NULL)))" ]] || fail 'canonical source guard constraint on the staff scope table is missing or its definition changed'
# r1-6 fix: M11 drops this constraint outright (no canonical replacement) —
# confirm it is actually gone, not merely renamed.
[[ "$(dbq "SELECT count(*) FROM pg_constraint WHERE conname='v1_operation_audits_canonical_source_guard_ck'")" == 0 ]] || fail 'legacy audit canonical-source guard constraint remains'
# r1-6 fix: the three guard functions M11 rewrites in place (CREATE OR
# REPLACE) must exist with their expected argument/return signature intact.
[[ "$(dbq "SELECT count(*) FROM pg_proc p WHERE p.proname='v1_resolve_canonical_guard_game' AND pg_get_function_result(p.oid)='TABLE(team_match_id text, semantic_tournament_id text, home_team_id text, away_team_id text)'")" == 1 ]] || fail 'v1_resolve_canonical_guard_game is missing or its signature changed'
[[ "$(dbq "SELECT count(*) FROM pg_proc p WHERE p.proname='v1_guard_staff_fixture_scope' AND pg_get_function_result(p.oid)='trigger'")" == 1 ]] || fail 'v1_guard_staff_fixture_scope is missing or its signature changed'
[[ "$(dbq "SELECT count(*) FROM pg_proc p WHERE p.proname='v1_guard_tournament_result_lineage_insert' AND pg_get_function_result(p.oid)='trigger'")" == 1 ]] || fail 'v1_guard_tournament_result_lineage_insert is missing or its signature changed'
[[ "$(dbq "SELECT count(*) FROM pg_type WHERE typname IN ('V1TournamentGoalTeam','V1TournamentFixtureStatus')")" == 0 ]] || fail 'retired enum types remain'
[[ "$(dbq "SELECT count(*) FROM pg_proc WHERE proname IN ('v1_reject_retired_tournament_fixture_write','v1_reject_retired_tournament_fixture_link')")" == 0 ]] || fail 'retirement functions remain'
[[ "$(dbq "SELECT count(*) FROM (VALUES ('tournament_fixture_id'),('fixture_id')) x(name) WHERE EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.column_name=x.name AND c.table_name IN ('v1_games','v1_tournament_staff_fixture_scopes','v1_operation_audits'))")" == 0 ]] || fail 'legacy link columns remain'
[[ "$(dbq "SELECT count(*) FROM v1_outbox_events WHERE status::text='PROCESSING'")" == 0 ]] || fail 'processing outbox rows appeared during M11'
# r1-6 fix: retirementTriggers in the committed receipt is now a directly
# queried count, not inferred from the retirement functions being gone.
retirement_triggers_count="$(dbq "SELECT count(*) FROM pg_trigger WHERE tgname IN ('v1_tournament_fixture_retired_write','v1_tournament_fixture_retired_row_write','v1_000_tournament_fixture_retired_link')")" || fail 'could not query the retirement trigger count'
[[ "$retirement_triggers_count" == 0 ]] || fail 'retirement enforcement triggers remain'
post_hash="$(sha "$backup_file")"; [[ "$post_hash" == "$backup_sha" ]] || fail 'pre-M11 backup changed during M11'; quiesce_sha="$(sha "$quiesce")"
receipt_json="$(jq -n \
  --arg releaseSha "$RELEASE_SHA" --arg apiImage "$API_IMAGE" --arg dbId "$DB_ID" --arg schemaSha "$TASK_SCHEMA_SHA" \
  --arg manifest "$MANIFEST" --arg manifestSha "$manifest_sha" \
  --arg preflightReceipt "$FINAL_PREFLIGHT_RECEIPT" --arg preflightSha "$FINAL_PREFLIGHT_SHA" \
  --arg preflightReport "$FINAL_PREFLIGHT_REPORT" --arg preflightReportSha "$FINAL_PREFLIGHT_REPORT_SHA" \
  --arg inputSnapshotSha "$INPUT_SNAPSHOT_SHA" \
  --arg predecessor "$PREDECESSOR_RELEASE" --arg predecessorTransition "$PREDECESSOR_TRANSITION" --arg predecessorTransitionSha "$PREDECESSOR_TRANSITION_SHA" \
  --arg quiesceReceipt "$quiesce" --arg quiesceSha "$quiesce_sha" \
  --arg backupPath "$backup_file" --arg backupSha "$post_hash" --argjson backupBytes "$backup_bytes" --arg backupFormat "$BACKUP_FORMAT" \
  --arg m11 "$M11" --arg m11Sha "$M11_SHA" --argjson retirementTriggers "$retirement_triggers_count" \
  --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{schemaVersion:1,kind:"task168StageBMigration",status:"MIGRATION_COMMITTED",stage:"stageBFinal",releaseSha:$releaseSha,apiImage:$apiImage,databaseIdentity:$dbId,schemaSha256:$schemaSha,manifest:$manifest,manifestSha256:$manifestSha,
     finalImagePreflight:{receipt:$preflightReceipt,receiptSha256:$preflightSha,report:$preflightReport,reportSha256:$preflightReportSha,inputSnapshotSha256:$inputSnapshotSha},
     predecessorStageAReleaseSha:$predecessor,predecessorTransition:$predecessorTransition,predecessorTransitionSha256:$predecessorTransitionSha,
     quiesceReceipt:$quiesceReceipt,quiesceReceiptSha256:$quiesceSha,
     preM11Backup:$backupPath,preM11BackupSha256:$backupSha,preM11BackupBytes:$backupBytes,backupFormat:$backupFormat,
     m11:$m11,m11Sha256:$m11Sha,ledger:"M1-M11 exact; M11 sole new applied row",
     postVerification:{legacyTables:0,legacyLinkColumns:0,retirementTriggers:$retirementTriggers,retirementFunctions:0,processingOutbox:0},
     completedAt:$now}'
)" || fail 'cannot encode the MIGRATION_COMMITTED receipt'
printf '%s\n' "$receipt_json" | write_json "$receipt_file" '
  .status=="MIGRATION_COMMITTED" and .kind=="task168StageBMigration" and .stage=="stageBFinal"
  and (.releaseSha|strings|test("^[0-9a-f]{40}$")) and (.m11Sha256|strings|test("^[0-9a-f]{64}$"))
  and (.quiesceReceiptSha256|strings|test("^[0-9a-f]{64}$")) and (.preM11BackupSha256|strings|test("^[0-9a-f]{64}$"))
  and .postVerification.retirementTriggers==0 and .postVerification.legacyTables==0
'
# Only after the MIGRATION_COMMITTED receipt is durably on disk does the EXIT
# trap's status==0 mean an actual success (blocking finding #1).
migration_completed=1

#!/usr/bin/env bash
set -Eeuo pipefail
schema=apps/v1_api/prisma/schema.prisma; archive=deploy/task168-pre-retirement-v7.tar.gz
[[ -f "$schema" && -f "$archive" ]] || { echo 'Stage A source inputs missing' >&2; exit 1; }
schema_sha="$(sha256sum "$schema"|awk '{print $1}')"; archive_sha="$(sha256sum "$archive"|awk '{print $1}')"
[[ "$schema_sha" == 91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f && "$archive_sha" == 829cbb214afc26c417947c864fd477647498003e06915ca20b4d2f8b44b80c4b ]] || { echo 'Stage A schema/archive digest mismatch' >&2; exit 1; }
manifest_sha="$(tar -xOzf "$archive" MANIFEST.json | sha256sum | awk '{print $1}')"; [[ "$manifest_sha" == b270be3c365ad780a2988ccf16f4850c15807ebc3eb9eb763f2bcdd0418f2f74 ]] || { echo 'cutover archive manifest mismatch' >&2; exit 1; }
items='[]'
for name in 20260908130000_v1_team_match_tournament_expand 20260908150000_v1_operation_audit_team_match_expand 20260908160000_v1_official_fact_team_match_scope 20260908170000_v1_lineup_invalidation 20260908180000_v1_staff_scope_team_match 20260909000000_v1_tournament_result_lineage 20260909110000_v1_operation_audit_canonical_binding 20260910010000_v1_official_fact_source_history 20260910020000_v1_canonical_game_db_guards 20260910160000_v1_outbox_cutover_claim_gate; do path="apps/v1_api/prisma/migrations/$name/migration.sql"; [[ -f "$path" ]] || exit 1; items="$(jq -c --arg name "$name" --arg sha "$(sha256sum "$path"|awk '{print $1}')" '.+[{name:$name,sha256:$sha}]' <<<"$items")"; done
[[ ! -e apps/v1_api/prisma/migrations/20260911090000_retire_tournament_fixture_tables ]] || { echo 'Stage A active history includes final DROP' >&2; exit 1; }
recovery_json="${TASK168_RECOVERY_FROM_JSON:-}"
if [[ -z "$recovery_json" && -f deploy/task168-recovery-from.json ]]; then
  recovery_json="$(jq -c . deploy/task168-recovery-from.json)" || { echo 'Invalid tracked Task168 recovery input' >&2; exit 1; }
fi
if [[ -n "$recovery_json" ]]; then
  recovery_json="$(jq -c . <<<"$recovery_json")" || { echo 'Invalid Task168 recovery input' >&2; exit 1; }
  jq -e 'type == "object" and (.releaseSha | test("^[0-9a-f]{40}$")) and (.cutoverReport | type == "string" and length > 0) and (.quiesceReceipt | type == "string" and length > 0) and (.backupReceipt | type == "string" and length > 0) and (.backupPath | type == "string" and length > 0) and (.cutoverReportSha256 | test("^[0-9a-f]{64}$")) and (.quiesceReceiptSha256 | test("^[0-9a-f]{64}$")) and (.backupReceiptSha256 | test("^[0-9a-f]{64}$")) and (.backupSha256 | test("^[0-9a-f]{64}$"))' <<<"$recovery_json" >/dev/null || { echo 'Invalid Task168 recovery input' >&2; exit 1; }
else
  recovery_json=null
fi
printf 'TASK168_SCHEMA_SHA256=%s\nTASK168_RUNTIME_CLIENT_SCHEMA_SHA256=%s\nTASK168_CUTOVER_ARCHIVE_SHA256=%s\nTASK168_CUTOVER_MANIFEST_SHA256=%s\nTASK168_MIGRATIONS_JSON=%s\nTASK168_RECOVERY_FROM_JSON=%s\n' "$schema_sha" "$schema_sha" "$archive_sha" "$manifest_sha" "$items" "$recovery_json" >> "$GITHUB_ENV"

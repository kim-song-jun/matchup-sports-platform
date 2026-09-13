#!/usr/bin/env bash
set -Eeuo pipefail

# StageB-only source preparer. It materializes the reviewed post-M11 Prisma
# schema and the exact M1-M11 migration inputs for a later archive/manifest
# builder. It never selects an image, release SHA, database, or deployment.
usage(){ echo "usage: $0 --source-dir D --source-commit SHA --final-schema F --m11 F --output-dir D" >&2; exit 64; }
SOURCE_DIR= SOURCE_COMMIT= FINAL_SCHEMA= M11_FILE= OUTPUT_DIR=
while (($#)); do case "$1" in
  --source-dir) SOURCE_DIR=${2:?}; shift 2;;
  --source-commit) SOURCE_COMMIT=${2:?}; shift 2;;
  --final-schema) FINAL_SCHEMA=${2:?}; shift 2;;
  --m11) M11_FILE=${2:?}; shift 2;;
  --output-dir) OUTPUT_DIR=${2:?}; shift 2;;
  *) usage;;
esac; done
[[ -d "$SOURCE_DIR" && -f "$FINAL_SCHEMA" && -f "$M11_FILE" && -n "$OUTPUT_DIR" ]] || usage
[[ "$SOURCE_COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo 'source commit must be one pinned 40-hex commit' >&2; exit 1; }
[[ ! -e "$OUTPUT_DIR" ]] || { echo 'output directory already exists; refusing overwrite' >&2; exit 1; }
fail(){ echo "[task168-final-inputs] $*" >&2; exit 1; }
sha(){ sha256sum "$1" | awk '{print $1}'; }
mode(){ stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }
readonly FINAL_SCHEMA_SHA=e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46
readonly M11_SHA=08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323
readonly M1=20260908130000_v1_team_match_tournament_expand
readonly M2=20260908150000_v1_operation_audit_team_match_expand
readonly M3=20260908160000_v1_official_fact_team_match_scope
readonly M4=20260908170000_v1_lineup_invalidation
readonly M5=20260908180000_v1_staff_scope_team_match
readonly M6=20260909000000_v1_tournament_result_lineage
readonly M7=20260909110000_v1_operation_audit_canonical_binding
readonly M8=20260910010000_v1_official_fact_source_history
readonly M9=20260910020000_v1_canonical_game_db_guards
readonly M10=20260910160000_v1_outbox_cutover_claim_gate
readonly M11=20260911090000_retire_tournament_fixture_tables
readonly MIGRATIONS=($M1 $M2 $M3 $M4 $M5 $M6 $M7 $M8 $M9 $M10 $M11)

[[ "$(sha "$FINAL_SCHEMA")" == "$FINAL_SCHEMA_SHA" ]] || fail 'reviewed final schema checksum mismatch'
[[ "$(sha "$M11_FILE")" == "$M11_SHA" ]] || fail 'M11 checksum mismatch'
git -C "$SOURCE_DIR" cat-file -e "$SOURCE_COMMIT^{commit}" 2>/dev/null || fail 'caller-pinned source commit is not present in the git object store'

stage="$(mktemp -d "${TMPDIR:-/tmp}/task168-final-inputs.XXXXXX")"
cleanup(){ [[ -z "${stage:-}" ]] || rm -rf "$stage"; }
trap cleanup EXIT
mkdir -p "$stage"
git -C "$SOURCE_DIR" archive --format=tar "$SOURCE_COMMIT" apps/v1_api/prisma/migrations | tar -xf - -C "$stage" || fail 'could not materialize pinned migration history'
[[ -f "$stage/apps/v1_api/prisma/migrations/migration_lock.toml" ]] || fail 'pinned migration lock file is missing'
install -m "$(mode "$FINAL_SCHEMA")" "$FINAL_SCHEMA" "$stage/apps/v1_api/prisma/schema.prisma"
for name in "${MIGRATIONS[@]}"; do
  [[ "$name" == "$M11" || -d "$stage/apps/v1_api/prisma/migrations/$name" ]] || fail "pinned migration history is missing: $name"
done
for name in "${MIGRATIONS[@]}"; do
  if [[ "$name" == "$M11" ]]; then
    source_file="$M11_FILE"
    rm -rf "$stage/apps/v1_api/prisma/migrations/$name"
    mkdir -p "$stage/apps/v1_api/prisma/migrations/$name"
  else
    source_file="$stage/apps/v1_api/prisma/migrations/$name/migration.sql"
  fi
  [[ -f "$source_file" ]] || fail "migration source is missing: $name"
  if [[ "$name" != "$M11" ]]; then
    mapfile -t extras < <(find "$(dirname "$source_file")" -type f ! -name migration.sql -print)
    ((${#extras[@]} == 0)) || fail "migration directory contains unexpected files: $name"
  else
    install -m "$(mode "$source_file")" "$source_file" "$stage/apps/v1_api/prisma/migrations/$name/migration.sql"
  fi
done

items='[]'
while IFS= read -r -d '' path; do
  rel="${path#$stage/}"
  items="$(jq -c --arg path "$rel" --arg sha "$(sha "$path")" --arg mode "$(mode "$path")" --argjson bytes "$(wc -c < "$path" | tr -d ' ')" '. + [{path:$path,sha256:$sha,mode:$mode,bytes:$bytes}]' <<<"$items")"
done < <(find "$stage" -type f -print0 | LC_ALL=C sort -z)
full_history='[]'
while IFS= read -r -d '' migration_dir; do
  name="$(basename "$migration_dir")"; sql="$migration_dir/migration.sql"
  [[ -f "$sql" ]] || fail "migration history entry has no migration.sql: $name"
  full_history="$(jq -c --arg name "$name" --arg sha "$(sha "$sql")" '. + [{name:$name,sha256:$sha}]' <<<"$full_history")"
done < <(find "$stage/apps/v1_api/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -print0 | LC_ALL=C sort -z)
[[ "$(jq 'length' <<<"$full_history")" -gt 11 ]] || fail 'complete migration history is unexpectedly short'
[[ "$(jq -r '.[-1].name' <<<"$full_history")" == "$M11" ]] || fail 'M11 is not the sole final source migration'
mkdir -p "$(dirname "$OUTPUT_DIR")"
jq -n --arg sourceCommit "$SOURCE_COMMIT" --arg schema "$FINAL_SCHEMA_SHA" --arg m11 "$M11_SHA" --argjson files "$items" --argjson fullHistory "$full_history" \
  '{schemaVersion:1,kind:"task168StageBFinalInputs",sourceCommit:$sourceCommit,finalSchema:{path:"apps/v1_api/prisma/schema.prisma",sha256:$schema},migrationPolicy:"task168-stageBFinal",files:$files,fullMigrationHistory:$fullHistory,m11:{name:"20260911090000_retire_tournament_fixture_tables",sha256:$m11},image:null,release:null}' > "$stage/INPUT-MANIFEST.json"
mv "$stage" "$OUTPUT_DIR"
stage=
trap - EXIT
cleanup
printf '%s\n' "$OUTPUT_DIR"

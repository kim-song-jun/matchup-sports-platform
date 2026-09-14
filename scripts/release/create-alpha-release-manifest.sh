#!/usr/bin/env bash
set -Eeuo pipefail

# Sourced only for validate_alpha_stage_b_final_manifest (StageB path below) —
# the StageA path's validate_existing_manifest is unchanged and keeps its own
# inline schema, matching this file's pre-existing convention.
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../deploy" && pwd)/alpha-manifest-common.sh"

# Task 168 name list, order fixed (identical to
# deploy/task168-stage-b-migrate.sh's ALL_MIGRATIONS[0:10] + M11).
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
readonly TASK168_M11=20260911090000_retire_tournament_fixture_tables
readonly TASK168_M11_PATH="deploy/task168-final-drop/migrations/${TASK168_M11}/migration.sql"
readonly TASK168_FINAL_SCHEMA_SHA256=e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46

build_stage_b_migrations_json() {
  local name path
  local result='[]'
  for name in "${TASK168_M1_M10[@]}" "${TASK168_M11}"; do
    if [[ "${name}" == "${TASK168_M11}" ]]; then
      path="${TASK168_M11_PATH}"
    else
      path="apps/v1_api/prisma/migrations/${name}/migration.sql"
    fi
    [[ -f "${path}" ]] || { echo "Task168 migration file missing: ${path}" >&2; return 1; }
    result="$(jq -c --arg name "${name}" --arg sha "$(sha256sum "${path}" | awk '{print $1}')" \
      '. + [{name:$name,sha256:$sha}]' <<< "${result}")"
  done
  printf '%s\n' "${result}"
}

# The runner's full-ledger check (deploy/task168-stage-b-migrate.sh
# canonical_history_from_root) walks EVERY migration under
# apps/v1_api/prisma/migrations in sorted order and appends M11 last — this
# mirrors that walk exactly so the manifest binds to the same list the
# runner will independently recompute from the source tree at execution
# time. Their disagreement is exactly what the runner's own comparison
# against FULL_MIGRATION_HISTORY is designed to catch; this function
# existing does not weaken that check, since the two are computed
# independently from the same source tree by different code.
build_stage_b_full_history_json() {
  local dir result='[]' name sha
  while IFS= read -r -d '' dir; do
    name="$(basename "${dir}")"
    [[ -f "${dir}/migration.sql" ]] || { echo "migration history entry has no migration.sql: ${name}" >&2; return 1; }
    sha="$(sha256sum "${dir}/migration.sql" | awk '{print $1}')"
    result="$(jq -c --arg name "${name}" --arg sha "${sha}" '. + [{name:$name,sha256:$sha}]' <<< "${result}")"
  done < <(find apps/v1_api/prisma/migrations -mindepth 1 -maxdepth 1 -type d -print0 | LC_ALL=C sort -z)
  result="$(jq -c --arg name "${TASK168_M11}" --arg sha "$(sha256sum "${TASK168_M11_PATH}" | awk '{print $1}')" \
    '. + [{name:$name,sha256:$sha}]' <<< "${result}")"
  printf '%s\n' "${result}"
}

validate_existing_manifest() {
  local manifest_file="$1"
  jq -e \
    --arg sha "$RELEASE_SHA" --arg version "$RELEASE_VERSION" \
    --arg bucket "$DEPLOY_BUCKET" --arg sourceVersionId "$SOURCE_VERSION_ID" --arg sourceSha256 "$SOURCE_SHA256" \
    --arg apiRepository "$REGISTRY/teameet-alpha-v1-api" --arg apiDigest "$api_digest" \
    --arg webRepository "$REGISTRY/teameet-alpha-v1-web" --arg webDigest "$web_digest" \
    --arg toolRepository "$REGISTRY/teameet-alpha-v1-api" --arg toolDigest "$tool_digest" \
    --arg previous "$PREVIOUS_SHA" --arg migrationBase "$MIGRATION_BASE_SHA" \
    --arg schema "$TASK168_SCHEMA_SHA256" --arg runtime "$TASK168_RUNTIME_CLIENT_SCHEMA_SHA256" \
    --arg archive "$TASK168_CUTOVER_ARCHIVE_SHA256" --arg archiveManifest "$TASK168_CUTOVER_MANIFEST_SHA256" \
    --argjson migrations "$TASK168_MIGRATIONS_JSON" --argjson recoveryFrom "${TASK168_RECOVERY_FROM_JSON:-null}" \
    '.schemaVersion == 1 and .environment == "alpha" and
     .release.sha == $sha and .release.version == $version and
     .source.bucket == $bucket and .source.key == ("releases/" + $sha + ".tar.gz") and
     .source.versionId == $sourceVersionId and .source.sha256 == $sourceSha256 and
     .images.api.repository == $apiRepository and .images.api.digest == $apiDigest and .images.api.uri == ($apiRepository + "@" + $apiDigest) and
     .images.web.repository == $webRepository and .images.web.digest == $webDigest and .images.web.uri == ($webRepository + "@" + $webDigest) and
     .images.cutoverTool.repository == $toolRepository and .images.cutoverTool.digest == $toolDigest and .images.cutoverTool.uri == ($toolRepository + "@" + $toolDigest) and
     .database.migrationPolicy == "task168-stageAIntermediate" and .database.rollbackMode == "canonical-intermediate-only" and
     .database.compatibilityCheck == "expand-contract-sql-v1" and
     ((.database.migrationValidatedFrom == null) or (.database.migrationValidatedFrom | test("^[0-9a-f]{40}$"))) and
     (($migrationBase == $sha) or .database.migrationValidatedFrom == (if $migrationBase == "none" then null else $migrationBase end)) and
     ((($previous == "none" or $previous == $sha) and ((.database.rollbackCompatibleWith == null) or (.database.rollbackCompatibleWith | test("^[0-9a-f]{40}$")))) or .database.rollbackCompatibleWith == $previous) and
     .database.task168.stage == "stageAIntermediate" and .database.task168.schemaSha256 == $schema and
     .database.task168.runtimeClientSchemaSha256 == $runtime and .database.task168.cutoverArchiveSha256 == $archive and
     .database.task168.cutoverManifestSha256 == $archiveManifest and .database.task168.migrations == $migrations and
     ((.database.task168.recoveryFrom == null and $recoveryFrom == null) or .database.task168.recoveryFrom == $recoveryFrom) and
     .database.task168.rollbackTarget == null' \
    "$manifest_file" >/dev/null
}

if [[ "${1:-}" == '--self-test' ]]; then
  RELEASE_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  RELEASE_VERSION=0.1.0-alpha.20260719.gbbbbbbbbbbbb
  DEPLOY_BUCKET=alpha-bucket
  SOURCE_VERSION_ID=version-1
  SOURCE_SHA256=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
  REGISTRY=111111111111.dkr.ecr.ap-northeast-2.amazonaws.com
  PREVIOUS_SHA="$RELEASE_SHA"
  MIGRATION_BASE_SHA="$RELEASE_SHA"
  TASK168_SCHEMA_SHA256=91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f
  TASK168_RUNTIME_CLIENT_SCHEMA_SHA256="$TASK168_SCHEMA_SHA256"
  TASK168_CUTOVER_ARCHIVE_SHA256=829cbb214afc26c417947c864fd477647498003e06915ca20b4d2f8b44b80c4b
  TASK168_CUTOVER_MANIFEST_SHA256=b270be3c365ad780a2988ccf16f4850c15807ebc3eb9eb763f2bcdd0418f2f74
  TASK168_MIGRATIONS_JSON='[{"name":"20260908130000_v1_x","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'
  api_digest=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  web_digest=sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
  tool_digest=sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
  fixture="$(mktemp)"
  trap 'rm -f "${fixture}"' EXIT
  jq -n \
    --arg sha "$RELEASE_SHA" --arg version "$RELEASE_VERSION" --arg bucket "$DEPLOY_BUCKET" --arg sourceVersion "$SOURCE_VERSION_ID" --arg sourceSha "$SOURCE_SHA256" --arg registry "$REGISTRY" \
    --arg apiDigest "$api_digest" --arg webDigest "$web_digest" --arg toolDigest "$tool_digest" --arg schema "$TASK168_SCHEMA_SHA256" --arg runtime "$TASK168_RUNTIME_CLIENT_SCHEMA_SHA256" --arg archive "$TASK168_CUTOVER_ARCHIVE_SHA256" --arg archiveManifest "$TASK168_CUTOVER_MANIFEST_SHA256" --argjson migrations "$TASK168_MIGRATIONS_JSON" --argjson recoveryFrom "${TASK168_RECOVERY_FROM_JSON:-null}" \
    '{schemaVersion:1,environment:"alpha",release:{sha:$sha,version:$version},source:{bucket:$bucket,key:("releases/"+$sha+".tar.gz"),versionId:$sourceVersion,sha256:$sourceSha},database:{migrationPolicy:"task168-stageAIntermediate",rollbackMode:"canonical-intermediate-only",compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",rollbackCompatibleWith:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",task168:{stage:"stageAIntermediate",schemaSha256:$schema,runtimeClientSchemaSha256:$runtime,cutoverArchiveSha256:$archive,cutoverManifestSha256:$archiveManifest,migrations:$migrations,recoveryFrom:$recoveryFrom,rollbackTarget:null}},images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:$apiDigest,uri:($registry+"/teameet-alpha-v1-api@"+$apiDigest)},web:{repository:($registry+"/teameet-alpha-v1-web"),digest:$webDigest,uri:($registry+"/teameet-alpha-v1-web@"+$webDigest)},cutoverTool:{repository:($registry+"/teameet-alpha-v1-api"),digest:$toolDigest,uri:($registry+"/teameet-alpha-v1-api@"+$toolDigest)}}}' > "$fixture"
  validate_existing_manifest "$fixture"
  MIGRATION_BASE_SHA=cccccccccccccccccccccccccccccccccccccccc
  if validate_existing_manifest "$fixture"; then echo 'Mismatched non-idempotent migration provenance was accepted' >&2; exit 1; fi
  echo '[alpha-release-manifest] Stage A idempotent provenance passed'
  exit 0
fi

# D-2 (S3 namespacing) — StageB branch. Falls through to the unchanged StageA
# body below when TASK168_STAGE is unset or stageAIntermediate, so every
# existing caller (the "Create or reuse immutable release manifest" step)
# keeps byte-identical behavior.
if [[ "${TASK168_STAGE:-stageAIntermediate}" != stageAIntermediate ]]; then
  [[ "${TASK168_STAGE}" == stageBFinal ]] || { echo "unsupported TASK168_STAGE for manifest creation: ${TASK168_STAGE}" >&2; exit 1; }
  for name in RELEASE_SHA RELEASE_VERSION REGISTRY DEPLOY_BUCKET EXPECTED_BUCKET_OWNER \
    SOURCE_VERSION_ID SOURCE_SHA256 IMAGE_TAG WEB_IMAGE_TAG TOOL_IMAGE_TAG \
    TASK168_PREDECESSOR_RELEASE_SHA TASK168_PREDECESSOR_TRANSITION_PATH TASK168_PREDECESSOR_TRANSITION_SHA256 \
    TASK168_PREDECESSOR_API_IMAGE TASK168_PREDECESSOR_DATABASE_IDENTITY TASK168_RESOLVED_MIGRATION_ATTEMPTS_SHA256 \
    TASK168_FINAL_PREFLIGHT_RECEIPT_PATH TASK168_FINAL_PREFLIGHT_RECEIPT_SHA256 TASK168_FINAL_PREFLIGHT_INPUT_SNAPSHOT_SHA256; do
    [[ -n "${!name:-}" ]] || { echo "$name is required for TASK168_STAGE=stageBFinal" >&2; exit 1; }
  done
  [[ "${RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]] || { echo 'RELEASE_SHA must be a full commit SHA' >&2; exit 1; }

  api_digest="$(aws ecr describe-images --repository-name teameet-alpha-v1-api --image-ids "imageTag=${IMAGE_TAG}" --query 'imageDetails[0].imageDigest' --output text)"
  web_digest="$(aws ecr describe-images --repository-name teameet-alpha-v1-web --image-ids "imageTag=${WEB_IMAGE_TAG}" --query 'imageDetails[0].imageDigest' --output text)"
  tool_digest="$(aws ecr describe-images --repository-name teameet-alpha-v1-api --image-ids "imageTag=${TOOL_IMAGE_TAG}" --query 'imageDetails[0].imageDigest' --output text)"

  migrations_json="$(build_stage_b_migrations_json)" || exit 1
  full_history_json="$(build_stage_b_full_history_json)" || exit 1
  predecessor_json="$(jq -nc \
    --arg releaseSha "${TASK168_PREDECESSOR_RELEASE_SHA}" \
    --arg transition "${TASK168_PREDECESSOR_TRANSITION_PATH}" \
    --arg transitionSha256 "${TASK168_PREDECESSOR_TRANSITION_SHA256}" \
    --arg apiImage "${TASK168_PREDECESSOR_API_IMAGE}" \
    --arg databaseIdentity "${TASK168_PREDECESSOR_DATABASE_IDENTITY}" \
    '{releaseSha:$releaseSha,transition:$transition,transitionSha256:$transitionSha256,apiImage:$apiImage,databaseIdentity:$databaseIdentity,schemaSha256:"91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f"}')"
  preflight_json="$(jq -nc \
    --arg receipt "${TASK168_FINAL_PREFLIGHT_RECEIPT_PATH}" \
    --arg receiptSha256 "${TASK168_FINAL_PREFLIGHT_RECEIPT_SHA256}" \
    --arg inputSnapshotSha256 "${TASK168_FINAL_PREFLIGHT_INPUT_SNAPSHOT_SHA256}" \
    '{receipt:$receipt,receiptSha256:$receiptSha256,inputSnapshotSha256:$inputSnapshotSha256}')"

  resolved_migration_attempts_sha256="${TASK168_RESOLVED_MIGRATION_ATTEMPTS_SHA256}"

  manifest="/tmp/teameet-alpha-task168-stage-b-${RELEASE_SHA}.json"
  manifest_key="manifests/task168-stage-b/${RELEASE_SHA}.json"
  if manifest_version_id="$(aws s3api head-object --bucket "$DEPLOY_BUCKET" --key "$manifest_key" --expected-bucket-owner "$EXPECTED_BUCKET_OWNER" --query VersionId --output text 2>/dev/null)"; then
    aws s3api get-object --bucket "$DEPLOY_BUCKET" --key "$manifest_key" --version-id "$manifest_version_id" --expected-bucket-owner "$EXPECTED_BUCKET_OWNER" "$manifest" >/dev/null
    validate_alpha_stage_b_final_manifest "$manifest" "$RELEASE_SHA" "$RELEASE_VERSION" \
      "$(sha256sum "$manifest" | awk '{print $1}')" "$REGISTRY" "${TASK168_FINAL_SCHEMA_SHA256}" \
      "$migrations_json" "$predecessor_json" "$preflight_json" "$full_history_json"
  else
    created_at="$(git show -s --format=%cI "$RELEASE_SHA")"
    jq -n --arg sha "$RELEASE_SHA" --arg version "$RELEASE_VERSION" --arg createdAt "$created_at" \
      --arg bucket "$DEPLOY_BUCKET" --arg sourceVersionId "$SOURCE_VERSION_ID" --arg sourceSha256 "$SOURCE_SHA256" \
      --arg registry "$REGISTRY" --arg apiDigest "$api_digest" --arg webDigest "$web_digest" --arg toolDigest "$tool_digest" \
      --arg schema "${TASK168_FINAL_SCHEMA_SHA256}" --argjson migrations "$migrations_json" \
      --argjson fullHistory "$full_history_json" --arg resolvedSha "$resolved_migration_attempts_sha256" \
      --argjson predecessor "$predecessor_json" --argjson preflight "$preflight_json" \
      '{schemaVersion:1,environment:"alpha",release:{sha:$sha,version:$version,createdAt:$createdAt},
        source:{bucket:$bucket,key:("releases/task168-stage-b/"+$sha+".tar.gz"),versionId:$sourceVersionId,sha256:$sourceSha256},
        database:{migrationPolicy:"task168-stageBFinal",rollbackMode:"backup-only",compatibilityCheck:"expand-contract-sql-v1",
          migrationValidatedFrom:null,rollbackCompatibleWith:null,
          task168:{stage:"stageBFinal",schemaSha256:$schema,runtimeClientSchemaSha256:$schema,migrations:$migrations,fullMigrationHistory:$fullHistory,
            resolvedMigrationAttemptsSha256:$resolvedSha,predecessor:$predecessor,finalImagePreflight:$preflight,
            recoveryFrom:null,rollbackTarget:null}},
        images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:$apiDigest,uri:($registry+"/teameet-alpha-v1-api@"+$apiDigest)},
          web:{repository:($registry+"/teameet-alpha-v1-web"),digest:$webDigest,uri:($registry+"/teameet-alpha-v1-web@"+$webDigest)},
          cutoverTool:{repository:($registry+"/teameet-alpha-v1-api"),digest:$toolDigest,uri:($registry+"/teameet-alpha-v1-api@"+$toolDigest)}}}' \
      > "$manifest"
    validate_alpha_stage_b_final_manifest "$manifest" "$RELEASE_SHA" "$RELEASE_VERSION" \
      "$(sha256sum "$manifest" | awk '{print $1}')" "$REGISTRY" "${TASK168_FINAL_SCHEMA_SHA256}" \
      "$migrations_json" "$predecessor_json" "$preflight_json" "$full_history_json"
    manifest_version_id="$(aws s3api put-object --bucket "$DEPLOY_BUCKET" --key "$manifest_key" --body "$manifest" --content-type application/json --if-none-match '*' --expected-bucket-owner "$EXPECTED_BUCKET_OWNER" --query VersionId --output text)"
  fi
  [[ "$manifest_version_id" =~ ^[A-Za-z0-9._+=/-]{1,255}$ ]]
  echo "manifestSha256=$(sha256sum "$manifest" | awk '{print $1}')" >> "$GITHUB_OUTPUT"
  echo "manifestVersionId=$manifest_version_id" >> "$GITHUB_OUTPUT"
  exit 0
fi

for name in RELEASE_SHA RELEASE_VERSION REGISTRY DEPLOY_BUCKET EXPECTED_BUCKET_OWNER SOURCE_VERSION_ID SOURCE_SHA256 IMAGE_TAG TOOL_IMAGE_TAG PREVIOUS_SHA MIGRATION_BASE_SHA TASK168_SCHEMA_SHA256 TASK168_RUNTIME_CLIENT_SCHEMA_SHA256 TASK168_CUTOVER_ARCHIVE_SHA256 TASK168_CUTOVER_MANIFEST_SHA256 TASK168_MIGRATIONS_JSON; do
  [[ -n "${!name:-}" ]] || { echo "$name is required" >&2; exit 1; }
done
[[ "$TASK168_SCHEMA_SHA256" == 91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f && "$TASK168_RUNTIME_CLIENT_SCHEMA_SHA256" == "$TASK168_SCHEMA_SHA256" && "$TASK168_CUTOVER_ARCHIVE_SHA256" == 829cbb214afc26c417947c864fd477647498003e06915ca20b4d2f8b44b80c4b && "$TASK168_CUTOVER_MANIFEST_SHA256" == b270be3c365ad780a2988ccf16f4850c15807ebc3eb9eb763f2bcdd0418f2f74 ]] || { echo 'Task168 immutable binding mismatch' >&2; exit 1; }
jq -e 'length == 10 and ([.[] | (.name|test("^[0-9]{14}_v1_")) and (.sha256|test("^[0-9a-f]{64}$"))] | all)' <<<"$TASK168_MIGRATIONS_JSON" >/dev/null
api_digest="$(aws ecr describe-images --repository-name teameet-alpha-v1-api --image-ids "imageTag=${IMAGE_TAG}" --query 'imageDetails[0].imageDigest' --output text)"
web_digest="$(aws ecr describe-images --repository-name teameet-alpha-v1-web --image-ids "imageTag=${IMAGE_TAG}" --query 'imageDetails[0].imageDigest' --output text)"
tool_digest="$(aws ecr describe-images --repository-name teameet-alpha-v1-api --image-ids "imageTag=${TOOL_IMAGE_TAG}" --query 'imageDetails[0].imageDigest' --output text)"
manifest="/tmp/teameet-alpha-${RELEASE_SHA}.json"; manifest_key="manifests/${RELEASE_SHA}.json"
if manifest_version_id="$(aws s3api head-object --bucket "$DEPLOY_BUCKET" --key "$manifest_key" --expected-bucket-owner "$EXPECTED_BUCKET_OWNER" --query VersionId --output text 2>/dev/null)"; then
  aws s3api get-object --bucket "$DEPLOY_BUCKET" --key "$manifest_key" --version-id "$manifest_version_id" --expected-bucket-owner "$EXPECTED_BUCKET_OWNER" "$manifest" >/dev/null
  validate_existing_manifest "$manifest"
else
  created_at="$(git show -s --format=%cI "$RELEASE_SHA")"
  jq -n --arg sha "$RELEASE_SHA" --arg version "$RELEASE_VERSION" --arg createdAt "$created_at" --arg bucket "$DEPLOY_BUCKET" --arg sourceVersionId "$SOURCE_VERSION_ID" --arg sourceSha256 "$SOURCE_SHA256" --arg previous "$PREVIOUS_SHA" --arg migrationBase "$MIGRATION_BASE_SHA" --arg registry "$REGISTRY" --arg apiDigest "$api_digest" --arg webDigest "$web_digest" --arg toolDigest "$tool_digest" --arg schema "$TASK168_SCHEMA_SHA256" --arg runtime "$TASK168_RUNTIME_CLIENT_SCHEMA_SHA256" --arg archive "$TASK168_CUTOVER_ARCHIVE_SHA256" --arg archiveManifest "$TASK168_CUTOVER_MANIFEST_SHA256" --argjson migrations "$TASK168_MIGRATIONS_JSON" --argjson recoveryFrom "${TASK168_RECOVERY_FROM_JSON:-null}" '{schemaVersion:1,environment:"alpha",release:{sha:$sha,version:$version,createdAt:$createdAt},source:{bucket:$bucket,key:("releases/"+$sha+".tar.gz"),versionId:$sourceVersionId,sha256:$sourceSha256},database:{migrationPolicy:"task168-stageAIntermediate",rollbackMode:"canonical-intermediate-only",compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:(if $migrationBase=="none" then null else $migrationBase end),rollbackCompatibleWith:(if $previous=="none" then null else $previous end),task168:{stage:"stageAIntermediate",schemaSha256:$schema,runtimeClientSchemaSha256:$runtime,cutoverArchiveSha256:$archive,cutoverManifestSha256:$archiveManifest,migrations:$migrations,recoveryFrom:$recoveryFrom,rollbackTarget:null}},images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:$apiDigest,uri:($registry+"/teameet-alpha-v1-api@"+$apiDigest)},web:{repository:($registry+"/teameet-alpha-v1-web"),digest:$webDigest,uri:($registry+"/teameet-alpha-v1-web@"+$webDigest)},cutoverTool:{repository:($registry+"/teameet-alpha-v1-api"),digest:$toolDigest,uri:($registry+"/teameet-alpha-v1-api@"+$toolDigest)}}}' > "$manifest"
  manifest_version_id="$(aws s3api put-object --bucket "$DEPLOY_BUCKET" --key "$manifest_key" --body "$manifest" --content-type application/json --if-none-match '*' --expected-bucket-owner "$EXPECTED_BUCKET_OWNER" --query VersionId --output text)"
fi
[[ "$manifest_version_id" =~ ^[A-Za-z0-9._+=/-]{1,1024}$ ]]
echo "manifestSha256=$(sha256sum "$manifest" | awk '{print $1}')" >> "$GITHUB_OUTPUT"
echo "manifestVersionId=$manifest_version_id" >> "$GITHUB_OUTPUT"
echo "apiDigest=$api_digest" >> "$GITHUB_OUTPUT"
echo "webDigest=$web_digest" >> "$GITHUB_OUTPUT"
echo "toolDigest=$tool_digest" >> "$GITHUB_OUTPUT"

#!/usr/bin/env bash
set -Eeuo pipefail

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
    --argjson migrations "$TASK168_MIGRATIONS_JSON" \
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
  TASK168_CUTOVER_ARCHIVE_SHA256=694a17ba8ed3d062b68908d4fd4ca3085be28afbe2c9661dd7a1cfae2c6e799b
  TASK168_CUTOVER_MANIFEST_SHA256=aa1753551026795af1af70352e54bfed31759fda826fe7a0244f43603ac8bb26
  TASK168_MIGRATIONS_JSON='[{"name":"20260908130000_v1_x","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'
  api_digest=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  web_digest=sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
  tool_digest=sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
  fixture="$(mktemp)"
  trap 'rm -f "${fixture}"' EXIT
  jq -n \
    --arg sha "$RELEASE_SHA" --arg version "$RELEASE_VERSION" --arg bucket "$DEPLOY_BUCKET" --arg sourceVersion "$SOURCE_VERSION_ID" --arg sourceSha "$SOURCE_SHA256" --arg registry "$REGISTRY" \
    --arg apiDigest "$api_digest" --arg webDigest "$web_digest" --arg toolDigest "$tool_digest" --arg schema "$TASK168_SCHEMA_SHA256" --arg runtime "$TASK168_RUNTIME_CLIENT_SCHEMA_SHA256" --arg archive "$TASK168_CUTOVER_ARCHIVE_SHA256" --arg archiveManifest "$TASK168_CUTOVER_MANIFEST_SHA256" --argjson migrations "$TASK168_MIGRATIONS_JSON" \
    '{schemaVersion:1,environment:"alpha",release:{sha:$sha,version:$version},source:{bucket:$bucket,key:("releases/"+$sha+".tar.gz"),versionId:$sourceVersion,sha256:$sourceSha},database:{migrationPolicy:"task168-stageAIntermediate",rollbackMode:"canonical-intermediate-only",compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",rollbackCompatibleWith:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",task168:{stage:"stageAIntermediate",schemaSha256:$schema,runtimeClientSchemaSha256:$runtime,cutoverArchiveSha256:$archive,cutoverManifestSha256:$archiveManifest,migrations:$migrations,rollbackTarget:null}},images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:$apiDigest,uri:($registry+"/teameet-alpha-v1-api@"+$apiDigest)},web:{repository:($registry+"/teameet-alpha-v1-web"),digest:$webDigest,uri:($registry+"/teameet-alpha-v1-web@"+$webDigest)},cutoverTool:{repository:($registry+"/teameet-alpha-v1-api"),digest:$toolDigest,uri:($registry+"/teameet-alpha-v1-api@"+$toolDigest)}}}' > "$fixture"
  validate_existing_manifest "$fixture"
  MIGRATION_BASE_SHA=cccccccccccccccccccccccccccccccccccccccc
  if validate_existing_manifest "$fixture"; then echo 'Mismatched non-idempotent migration provenance was accepted' >&2; exit 1; fi
  echo '[alpha-release-manifest] Stage A idempotent provenance passed'
  exit 0
fi

for name in RELEASE_SHA RELEASE_VERSION REGISTRY DEPLOY_BUCKET EXPECTED_BUCKET_OWNER SOURCE_VERSION_ID SOURCE_SHA256 IMAGE_TAG TOOL_IMAGE_TAG PREVIOUS_SHA MIGRATION_BASE_SHA TASK168_SCHEMA_SHA256 TASK168_RUNTIME_CLIENT_SCHEMA_SHA256 TASK168_CUTOVER_ARCHIVE_SHA256 TASK168_CUTOVER_MANIFEST_SHA256 TASK168_MIGRATIONS_JSON; do
  [[ -n "${!name:-}" ]] || { echo "$name is required" >&2; exit 1; }
done
[[ "$TASK168_SCHEMA_SHA256" == 91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f && "$TASK168_RUNTIME_CLIENT_SCHEMA_SHA256" == "$TASK168_SCHEMA_SHA256" && "$TASK168_CUTOVER_ARCHIVE_SHA256" == 694a17ba8ed3d062b68908d4fd4ca3085be28afbe2c9661dd7a1cfae2c6e799b && "$TASK168_CUTOVER_MANIFEST_SHA256" == aa1753551026795af1af70352e54bfed31759fda826fe7a0244f43603ac8bb26 ]] || { echo 'Task168 immutable binding mismatch' >&2; exit 1; }
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
  jq -n --arg sha "$RELEASE_SHA" --arg version "$RELEASE_VERSION" --arg createdAt "$created_at" --arg bucket "$DEPLOY_BUCKET" --arg sourceVersionId "$SOURCE_VERSION_ID" --arg sourceSha256 "$SOURCE_SHA256" --arg previous "$PREVIOUS_SHA" --arg migrationBase "$MIGRATION_BASE_SHA" --arg registry "$REGISTRY" --arg apiDigest "$api_digest" --arg webDigest "$web_digest" --arg toolDigest "$tool_digest" --arg schema "$TASK168_SCHEMA_SHA256" --arg runtime "$TASK168_RUNTIME_CLIENT_SCHEMA_SHA256" --arg archive "$TASK168_CUTOVER_ARCHIVE_SHA256" --arg archiveManifest "$TASK168_CUTOVER_MANIFEST_SHA256" --argjson migrations "$TASK168_MIGRATIONS_JSON" '{schemaVersion:1,environment:"alpha",release:{sha:$sha,version:$version,createdAt:$createdAt},source:{bucket:$bucket,key:("releases/"+$sha+".tar.gz"),versionId:$sourceVersionId,sha256:$sourceSha256},database:{migrationPolicy:"task168-stageAIntermediate",rollbackMode:"canonical-intermediate-only",compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:(if $migrationBase=="none" then null else $migrationBase end),rollbackCompatibleWith:(if $previous=="none" then null else $previous end),task168:{stage:"stageAIntermediate",schemaSha256:$schema,runtimeClientSchemaSha256:$runtime,cutoverArchiveSha256:$archive,cutoverManifestSha256:$archiveManifest,migrations:$migrations,rollbackTarget:null}},images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:$apiDigest,uri:($registry+"/teameet-alpha-v1-api@"+$apiDigest)},web:{repository:($registry+"/teameet-alpha-v1-web"),digest:$webDigest,uri:($registry+"/teameet-alpha-v1-web@"+$webDigest)},cutoverTool:{repository:($registry+"/teameet-alpha-v1-api"),digest:$toolDigest,uri:($registry+"/teameet-alpha-v1-api@"+$toolDigest)}}}' > "$manifest"
  manifest_version_id="$(aws s3api put-object --bucket "$DEPLOY_BUCKET" --key "$manifest_key" --body "$manifest" --content-type application/json --if-none-match '*' --expected-bucket-owner "$EXPECTED_BUCKET_OWNER" --query VersionId --output text)"
fi
[[ "$manifest_version_id" =~ ^[A-Za-z0-9._+=/-]{1,1024}$ ]]
echo "manifestSha256=$(sha256sum "$manifest" | awk '{print $1}')" >> "$GITHUB_OUTPUT"
echo "manifestVersionId=$manifest_version_id" >> "$GITHUB_OUTPUT"
echo "apiDigest=$api_digest" >> "$GITHUB_OUTPUT"
echo "webDigest=$web_digest" >> "$GITHUB_OUTPUT"
echo "toolDigest=$tool_digest" >> "$GITHUB_OUTPUT"

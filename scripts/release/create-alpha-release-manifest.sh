#!/usr/bin/env bash
set -Eeuo pipefail

# Task 168 M11 converged: this creator now emits the "final" release policy
# manifest (schema.prisma is the post-retirement schema; M11 lives in
# apps/v1_api/prisma/migrations like any other migration). There is no more
# cutover tool image or frozen M1-M10 checksum list in this manifest — the
# steady check-only script (deploy/task168-final-steady-migrate.sh) reads the
# candidate source tree directly against the live DB ledger at deploy time.
#
# rollbackCompatibleWith is final<->final only (item 8): it is set only when
# the caller attests the previous active release was ALSO the final policy
# (PREVIOUS_STAGE=final). A previous StageA release, or no previous release,
# leaves it null so rollback-alpha.sh cannot be pointed at a StageA release.

validate_existing_manifest() {
  local manifest_file="$1"
  jq -e \
    --arg sha "$RELEASE_SHA" --arg version "$RELEASE_VERSION" \
    --arg bucket "$DEPLOY_BUCKET" --arg sourceVersionId "$SOURCE_VERSION_ID" --arg sourceSha256 "$SOURCE_SHA256" \
    --arg apiRepository "$REGISTRY/teameet-alpha-v1-api" --arg apiDigest "$api_digest" \
    --arg webRepository "$REGISTRY/teameet-alpha-v1-web" --arg webDigest "$web_digest" \
    --arg previous "$PREVIOUS_SHA" --arg migrationBase "$MIGRATION_BASE_SHA" \
    --arg schema "$TASK168_SCHEMA_SHA256" --arg m11 "$TASK168_M11_SHA256" \
    --arg rollbackCompatible "$rollback_compatible_with" \
    '.schemaVersion == 1 and .environment == "alpha" and
     .release.sha == $sha and .release.version == $version and
     .source.bucket == $bucket and .source.key == ("releases/" + $sha + ".tar.gz") and
     .source.versionId == $sourceVersionId and .source.sha256 == $sourceSha256 and
     .images.api.repository == $apiRepository and .images.api.digest == $apiDigest and .images.api.uri == ($apiRepository + "@" + $apiDigest) and
     .images.web.repository == $webRepository and .images.web.digest == $webDigest and .images.web.uri == ($webRepository + "@" + $webDigest) and
     .database.migrationPolicy == "task168-final" and .database.rollbackMode == "final-only" and
     .database.compatibilityCheck == "expand-contract-sql-v1" and
     ((.database.migrationValidatedFrom == null) or (.database.migrationValidatedFrom | test("^[0-9a-f]{40}$"))) and
     (($migrationBase == $sha) or .database.migrationValidatedFrom == (if $migrationBase == "none" then null else $migrationBase end)) and
     .database.rollbackCompatibleWith == (if $rollbackCompatible == "" then null else $rollbackCompatible end) and
     .database.task168.stage == "final" and .database.task168.schemaSha256 == $schema and
     .database.task168.runtimeClientSchemaSha256 == $schema and
     .database.task168.m11Sha256 == $m11' \
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
  PREVIOUS_STAGE=final
  MIGRATION_BASE_SHA="$RELEASE_SHA"
  TASK168_SCHEMA_SHA256=e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46
  TASK168_M11_SHA256=08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323
  api_digest=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  web_digest=sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
  fixture="$(mktemp)"
  trap 'rm -f "${fixture}"' EXIT

  rollback_compatible_with="$PREVIOUS_SHA"
  jq -n \
    --arg sha "$RELEASE_SHA" --arg version "$RELEASE_VERSION" --arg bucket "$DEPLOY_BUCKET" --arg sourceVersion "$SOURCE_VERSION_ID" --arg sourceSha "$SOURCE_SHA256" --arg registry "$REGISTRY" \
    --arg apiDigest "$api_digest" --arg webDigest "$web_digest" --arg schema "$TASK168_SCHEMA_SHA256" --arg m11 "$TASK168_M11_SHA256" --arg rollbackCompatible "$rollback_compatible_with" \
    '{schemaVersion:1,environment:"alpha",release:{sha:$sha,version:$version},source:{bucket:$bucket,key:("releases/"+$sha+".tar.gz"),versionId:$sourceVersion,sha256:$sourceSha},database:{migrationPolicy:"task168-final",rollbackMode:"final-only",compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",rollbackCompatibleWith:$rollbackCompatible,task168:{stage:"final",schemaSha256:$schema,runtimeClientSchemaSha256:$schema,m11Sha256:$m11}},images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:$apiDigest,uri:($registry+"/teameet-alpha-v1-api@"+$apiDigest)},web:{repository:($registry+"/teameet-alpha-v1-web"),digest:$webDigest,uri:($registry+"/teameet-alpha-v1-web@"+$webDigest)}}}' > "$fixture"
  validate_existing_manifest "$fixture"

  # Positive: previous release was StageA (or absent) -> rollbackCompatibleWith
  # must be null, never bound to a StageA sha.
  PREVIOUS_STAGE=stageAIntermediate
  rollback_compatible_with=""
  jq -n \
    --arg sha "$RELEASE_SHA" --arg version "$RELEASE_VERSION" --arg bucket "$DEPLOY_BUCKET" --arg sourceVersion "$SOURCE_VERSION_ID" --arg sourceSha "$SOURCE_SHA256" --arg registry "$REGISTRY" \
    --arg apiDigest "$api_digest" --arg webDigest "$web_digest" --arg schema "$TASK168_SCHEMA_SHA256" --arg m11 "$TASK168_M11_SHA256" \
    '{schemaVersion:1,environment:"alpha",release:{sha:$sha,version:$version},source:{bucket:$bucket,key:("releases/"+$sha+".tar.gz"),versionId:$sourceVersion,sha256:$sourceSha},database:{migrationPolicy:"task168-final",rollbackMode:"final-only",compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",rollbackCompatibleWith:null,task168:{stage:"final",schemaSha256:$schema,runtimeClientSchemaSha256:$schema,m11Sha256:$m11}},images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:$apiDigest,uri:($registry+"/teameet-alpha-v1-api@"+$apiDigest)},web:{repository:($registry+"/teameet-alpha-v1-web"),digest:$webDigest,uri:($registry+"/teameet-alpha-v1-web@"+$webDigest)}}}' > "$fixture"
  validate_existing_manifest "$fixture"

  # Negative: a manifest that binds rollbackCompatibleWith to a StageA
  # predecessor must be rejected once this script's own gating (below,
  # PREVIOUS_STAGE != final -> rollback_compatible_with empty) disagrees
  # with what is in the file.
  PREVIOUS_STAGE=stageAIntermediate
  rollback_compatible_with=""
  jq -n \
    --arg sha "$RELEASE_SHA" --arg version "$RELEASE_VERSION" --arg bucket "$DEPLOY_BUCKET" --arg sourceVersion "$SOURCE_VERSION_ID" --arg sourceSha "$SOURCE_SHA256" --arg registry "$REGISTRY" \
    --arg apiDigest "$api_digest" --arg webDigest "$web_digest" --arg schema "$TASK168_SCHEMA_SHA256" --arg m11 "$TASK168_M11_SHA256" --arg previous "$PREVIOUS_SHA" \
    '{schemaVersion:1,environment:"alpha",release:{sha:$sha,version:$version},source:{bucket:$bucket,key:("releases/"+$sha+".tar.gz"),versionId:$sourceVersion,sha256:$sourceSha},database:{migrationPolicy:"task168-final",rollbackMode:"final-only",compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",rollbackCompatibleWith:$previous,task168:{stage:"final",schemaSha256:$schema,runtimeClientSchemaSha256:$schema,m11Sha256:$m11}},images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:$apiDigest,uri:($registry+"/teameet-alpha-v1-api@"+$apiDigest)},web:{repository:($registry+"/teameet-alpha-v1-web"),digest:$webDigest,uri:($registry+"/teameet-alpha-v1-web@"+$webDigest)}}}' > "$fixture"
  if validate_existing_manifest "$fixture"; then
    echo 'A StageA predecessor was accepted as rollback-compatible with a final release' >&2
    exit 1
  fi

  MIGRATION_BASE_SHA=cccccccccccccccccccccccccccccccccccccccc
  PREVIOUS_STAGE=final
  rollback_compatible_with="$PREVIOUS_SHA"
  jq -n \
    --arg sha "$RELEASE_SHA" --arg version "$RELEASE_VERSION" --arg bucket "$DEPLOY_BUCKET" --arg sourceVersion "$SOURCE_VERSION_ID" --arg sourceSha "$SOURCE_SHA256" --arg registry "$REGISTRY" \
    --arg apiDigest "$api_digest" --arg webDigest "$web_digest" --arg schema "$TASK168_SCHEMA_SHA256" --arg m11 "$TASK168_M11_SHA256" --arg rollbackCompatible "$rollback_compatible_with" \
    '{schemaVersion:1,environment:"alpha",release:{sha:$sha,version:$version},source:{bucket:$bucket,key:("releases/"+$sha+".tar.gz"),versionId:$sourceVersion,sha256:$sourceSha},database:{migrationPolicy:"task168-final",rollbackMode:"final-only",compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",rollbackCompatibleWith:$rollbackCompatible,task168:{stage:"final",schemaSha256:$schema,runtimeClientSchemaSha256:$schema,m11Sha256:$m11}},images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:$apiDigest,uri:($registry+"/teameet-alpha-v1-api@"+$apiDigest)},web:{repository:($registry+"/teameet-alpha-v1-web"),digest:$webDigest,uri:($registry+"/teameet-alpha-v1-web@"+$webDigest)}}}' > "$fixture"
  if validate_existing_manifest "$fixture"; then
    echo 'Mismatched non-idempotent migration provenance was accepted' >&2
    exit 1
  fi
  echo '[alpha-release-manifest] Task168 final-policy provenance passed'
  exit 0
fi

for name in RELEASE_SHA RELEASE_VERSION REGISTRY DEPLOY_BUCKET EXPECTED_BUCKET_OWNER SOURCE_VERSION_ID SOURCE_SHA256 IMAGE_TAG PREVIOUS_SHA PREVIOUS_STAGE MIGRATION_BASE_SHA TASK168_SCHEMA_SHA256 TASK168_M11_SHA256; do
  [[ -n "${!name:-}" ]] || { echo "$name is required" >&2; exit 1; }
done
[[ "$TASK168_SCHEMA_SHA256" == e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46 && "$TASK168_M11_SHA256" == 08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323 ]] || { echo 'Task168 final-policy binding mismatch' >&2; exit 1; }

if [[ "$PREVIOUS_STAGE" == final && "$PREVIOUS_SHA" != none ]]; then
  rollback_compatible_with="$PREVIOUS_SHA"
else
  rollback_compatible_with=""
fi

api_digest="$(aws ecr describe-images --repository-name teameet-alpha-v1-api --image-ids "imageTag=${IMAGE_TAG}" --query 'imageDetails[0].imageDigest' --output text)"
web_digest="$(aws ecr describe-images --repository-name teameet-alpha-v1-web --image-ids "imageTag=${IMAGE_TAG}" --query 'imageDetails[0].imageDigest' --output text)"
manifest="/tmp/teameet-alpha-${RELEASE_SHA}.json"; manifest_key="manifests/${RELEASE_SHA}.json"
if manifest_version_id="$(aws s3api head-object --bucket "$DEPLOY_BUCKET" --key "$manifest_key" --expected-bucket-owner "$EXPECTED_BUCKET_OWNER" --query VersionId --output text 2>/dev/null)"; then
  aws s3api get-object --bucket "$DEPLOY_BUCKET" --key "$manifest_key" --version-id "$manifest_version_id" --expected-bucket-owner "$EXPECTED_BUCKET_OWNER" "$manifest" >/dev/null
  validate_existing_manifest "$manifest"
else
  created_at="$(git show -s --format=%cI "$RELEASE_SHA")"
  jq -n --arg sha "$RELEASE_SHA" --arg version "$RELEASE_VERSION" --arg createdAt "$created_at" --arg bucket "$DEPLOY_BUCKET" --arg sourceVersionId "$SOURCE_VERSION_ID" --arg sourceSha256 "$SOURCE_SHA256" --arg migrationBase "$MIGRATION_BASE_SHA" --arg rollbackCompatible "$rollback_compatible_with" --arg registry "$REGISTRY" --arg apiDigest "$api_digest" --arg webDigest "$web_digest" --arg schema "$TASK168_SCHEMA_SHA256" --arg m11 "$TASK168_M11_SHA256" '{schemaVersion:1,environment:"alpha",release:{sha:$sha,version:$version,createdAt:$createdAt},source:{bucket:$bucket,key:("releases/"+$sha+".tar.gz"),versionId:$sourceVersionId,sha256:$sourceSha256},database:{migrationPolicy:"task168-final",rollbackMode:"final-only",compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:(if $migrationBase=="none" then null else $migrationBase end),rollbackCompatibleWith:(if $rollbackCompatible=="" then null else $rollbackCompatible end),task168:{stage:"final",schemaSha256:$schema,runtimeClientSchemaSha256:$schema,m11Sha256:$m11}},images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:$apiDigest,uri:($registry+"/teameet-alpha-v1-api@"+$apiDigest)},web:{repository:($registry+"/teameet-alpha-v1-web"),digest:$webDigest,uri:($registry+"/teameet-alpha-v1-web@"+$webDigest)}}}' > "$manifest"
  manifest_version_id="$(aws s3api put-object --bucket "$DEPLOY_BUCKET" --key "$manifest_key" --body "$manifest" --content-type application/json --if-none-match '*' --expected-bucket-owner "$EXPECTED_BUCKET_OWNER" --query VersionId --output text)"
fi
[[ "$manifest_version_id" =~ ^[A-Za-z0-9._+=/-]{1,1024}$ ]]
echo "manifestSha256=$(sha256sum "$manifest" | awk '{print $1}')" >> "$GITHUB_OUTPUT"
echo "manifestVersionId=$manifest_version_id" >> "$GITHUB_OUTPUT"
echo "apiDigest=$api_digest" >> "$GITHUB_OUTPUT"
echo "webDigest=$web_digest" >> "$GITHUB_OUTPUT"

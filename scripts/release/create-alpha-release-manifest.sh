#!/usr/bin/env bash

set -Eeuo pipefail

validate_existing_manifest() {
  local manifest_file="$1"

  jq -e \
    --arg sha "${RELEASE_SHA}" --arg version "${RELEASE_VERSION}" \
    --arg bucket "${DEPLOY_BUCKET}" --arg sourceVersionId "${SOURCE_VERSION_ID}" --arg sourceSha256 "${SOURCE_SHA256}" \
    --arg apiRepository "${REGISTRY}/teameet-alpha-v1-api" --arg apiDigest "${api_digest}" \
    --arg webRepository "${REGISTRY}/teameet-alpha-v1-web" --arg webDigest "${web_digest}" \
    --arg previous "${PREVIOUS_SHA}" --arg migrationBase "${MIGRATION_BASE_SHA}" \
    '.release.sha == $sha and .release.version == $version and .source.bucket == $bucket and .source.versionId == $sourceVersionId and .source.sha256 == $sourceSha256 and .images.api.repository == $apiRepository and .images.api.digest == $apiDigest and .images.web.repository == $webRepository and .images.web.digest == $webDigest and .database.compatibilityCheck == "expand-contract-sql-v1" and ((.database.migrationValidatedFrom == null) or (.database.migrationValidatedFrom | test("^[0-9a-f]{40}$"))) and (($migrationBase == $sha) or .database.migrationValidatedFrom == (if $migrationBase == "none" then null else $migrationBase end)) and ((($previous == "none" or $previous == $sha) and ((.database.rollbackCompatibleWith == null) or (.database.rollbackCompatibleWith | test("^[0-9a-f]{40}$")))) or .database.rollbackCompatibleWith == $previous)' \
    "${manifest_file}" >/dev/null
}

if [[ "${1:-}" == '--self-test' ]]; then
  RELEASE_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  RELEASE_VERSION=0.1.0-alpha.20260719.gbbbbbbbbbbbb
  DEPLOY_BUCKET=alpha-bucket
  SOURCE_VERSION_ID=version-1
  SOURCE_SHA256=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
  REGISTRY=111111111111.dkr.ecr.ap-northeast-2.amazonaws.com
  PREVIOUS_SHA="${RELEASE_SHA}"
  MIGRATION_BASE_SHA="${RELEASE_SHA}"
  api_digest=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  web_digest=sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
  fixture="$(mktemp)"
  trap 'rm -f "${fixture}"' EXIT
  jq -n \
    --arg sha "${RELEASE_SHA}" --arg version "${RELEASE_VERSION}" \
    --arg bucket "${DEPLOY_BUCKET}" --arg sourceVersion "${SOURCE_VERSION_ID}" \
    --arg sourceSha "${SOURCE_SHA256}" --arg registry "${REGISTRY}" \
    --arg apiDigest "${api_digest}" --arg webDigest "${web_digest}" \
    '{release:{sha:$sha,version:$version},source:{bucket:$bucket,versionId:$sourceVersion,sha256:$sourceSha},database:{compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",rollbackCompatibleWith:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:$apiDigest},web:{repository:($registry+"/teameet-alpha-v1-web"),digest:$webDigest}}}' \
    > "${fixture}"
  validate_existing_manifest "${fixture}"
  MIGRATION_BASE_SHA=cccccccccccccccccccccccccccccccccccccccc
  if validate_existing_manifest "${fixture}"; then
    echo "Mismatched non-idempotent migration provenance was accepted" >&2
    exit 1
  fi
  echo "[alpha-release-manifest] idempotent provenance passed"
  exit 0
fi

for name in RELEASE_SHA RELEASE_VERSION REGISTRY DEPLOY_BUCKET EXPECTED_BUCKET_OWNER \
  SOURCE_VERSION_ID SOURCE_SHA256 IMAGE_TAG PREVIOUS_SHA; do
  [[ -n "${!name:-}" ]] || { echo "${name} is required" >&2; exit 1; }
done
: "${MIGRATION_BASE_SHA:?MIGRATION_BASE_SHA is required}"

api_digest="$(aws ecr describe-images --repository-name teameet-alpha-v1-api \
  --image-ids "imageTag=${IMAGE_TAG}" --query 'imageDetails[0].imageDigest' --output text)"
web_digest="$(aws ecr describe-images --repository-name teameet-alpha-v1-web \
  --image-ids "imageTag=${IMAGE_TAG}" --query 'imageDetails[0].imageDigest' --output text)"
manifest="/tmp/teameet-alpha-${RELEASE_SHA}.json"
manifest_key="manifests/${RELEASE_SHA}.json"

if manifest_version_id="$(aws s3api head-object --bucket "${DEPLOY_BUCKET}" \
  --key "${manifest_key}" --expected-bucket-owner "${EXPECTED_BUCKET_OWNER}" \
  --query VersionId --output text 2>/dev/null)"; then
  aws s3api get-object --bucket "${DEPLOY_BUCKET}" --key "${manifest_key}" \
    --version-id "${manifest_version_id}" --expected-bucket-owner "${EXPECTED_BUCKET_OWNER}" \
    "${manifest}" >/dev/null
  validate_existing_manifest "${manifest}"
else
  created_at="$(git show -s --format=%cI "${RELEASE_SHA}")"
  jq -Sn \
    --arg sha "${RELEASE_SHA}" --arg version "${RELEASE_VERSION}" --arg createdAt "${created_at}" \
    --arg bucket "${DEPLOY_BUCKET}" --arg sourceVersionId "${SOURCE_VERSION_ID}" --arg sourceSha256 "${SOURCE_SHA256}" \
    --arg apiRepository "${REGISTRY}/teameet-alpha-v1-api" --arg apiDigest "${api_digest}" \
    --arg webRepository "${REGISTRY}/teameet-alpha-v1-web" --arg webDigest "${web_digest}" --arg previous "${PREVIOUS_SHA}" --arg migrationBase "${MIGRATION_BASE_SHA}" \
    '{schemaVersion:1,environment:"alpha",release:{sha:$sha,version:$version,createdAt:$createdAt},source:{bucket:$bucket,key:("releases/"+$sha+".tar.gz"),versionId:$sourceVersionId,sha256:$sourceSha256},database:{migrationPolicy:"expand-contract",rollbackMode:"application-images-only",compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:(if $migrationBase == "none" then null else $migrationBase end),rollbackCompatibleWith:(if $previous == "none" then null else $previous end)},images:{api:{repository:$apiRepository,digest:$apiDigest,uri:($apiRepository+"@"+$apiDigest)},web:{repository:$webRepository,digest:$webDigest,uri:($webRepository+"@"+$webDigest)}}}' \
    > "${manifest}"
  manifest_version_id="$(aws s3api put-object --bucket "${DEPLOY_BUCKET}" \
    --key "${manifest_key}" --body "${manifest}" --content-type application/json \
    --if-none-match '*' \
    --expected-bucket-owner "${EXPECTED_BUCKET_OWNER}" --query VersionId --output text)"
fi

[[ "${manifest_version_id}" =~ ^[A-Za-z0-9._+=/-]{1,1024}$ ]]
echo "manifestSha256=$(sha256sum "${manifest}" | awk '{print $1}')" >> "${GITHUB_OUTPUT}"
echo "manifestVersionId=${manifest_version_id}" >> "${GITHUB_OUTPUT}"
echo "apiDigest=${api_digest}" >> "${GITHUB_OUTPUT}"
echo "webDigest=${web_digest}" >> "${GITHUB_OUTPUT}"

#!/usr/bin/env bash

set -Eeuo pipefail

# scripts/release/create-alpha-release-manifest.sh 를 prod 용으로 일반화한 것.
# D2: S3 에 manifest 를 영속 저장하지 않으므로(소스는 ssh-rsync 로 직접 전송) "이미 존재하는
# manifest 재사용" 케이스 자체가 없다 — validate_existing_manifest() 는 이식하지 않는다.
# 매 실행이 항상 신규 생성이다.

for name in RELEASE_SHA RELEASE_VERSION REGISTRY SOURCE_SHA256 IMAGE_TAG PREVIOUS_SHA; do
  [[ -n "${!name:-}" ]] || { echo "${name} is required" >&2; exit 1; }
done
: "${MIGRATION_BASE_SHA:?MIGRATION_BASE_SHA is required}"

api_digest="$(aws ecr describe-images --repository-name teameet-prod-v1-api \
  --image-ids "imageTag=${IMAGE_TAG}" --query 'imageDetails[0].imageDigest' --output text)"
web_digest="$(aws ecr describe-images --repository-name teameet-prod-v1-web \
  --image-ids "imageTag=${IMAGE_TAG}" --query 'imageDetails[0].imageDigest' --output text)"
manifest="/tmp/teameet-prod-${RELEASE_SHA}.json"
created_at="$(git show -s --format=%cI "${RELEASE_SHA}")"

jq -Sn \
  --arg sha "${RELEASE_SHA}" --arg version "${RELEASE_VERSION}" --arg createdAt "${created_at}" \
  --arg sourceSha256 "${SOURCE_SHA256}" \
  --arg apiRepository "${REGISTRY}/teameet-prod-v1-api" --arg apiDigest "${api_digest}" \
  --arg webRepository "${REGISTRY}/teameet-prod-v1-web" --arg webDigest "${web_digest}" \
  --arg previous "${PREVIOUS_SHA}" --arg migrationBase "${MIGRATION_BASE_SHA}" \
  '{schemaVersion:1,environment:"production",release:{sha:$sha,version:$version,createdAt:$createdAt},source:{transfer:"ssh-rsync",sha256:$sourceSha256},database:{migrationPolicy:"expand-contract",rollbackMode:"application-images-only",compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:(if $migrationBase == "none" then null else $migrationBase end),rollbackCompatibleWith:(if $previous == "none" then null else $previous end)},images:{api:{repository:$apiRepository,digest:$apiDigest,uri:($apiRepository+"@"+$apiDigest)},web:{repository:$webRepository,digest:$webDigest,uri:($webRepository+"@"+$webDigest)}}}' \
  > "${manifest}"

echo "manifestSha256=$(sha256sum "${manifest}" | awk '{print $1}')" >> "${GITHUB_OUTPUT}"
echo "apiDigest=${api_digest}" >> "${GITHUB_OUTPUT}"
echo "webDigest=${web_digest}" >> "${GITHUB_OUTPUT}"
echo "manifestPath=${manifest}" >> "${GITHUB_OUTPUT}"

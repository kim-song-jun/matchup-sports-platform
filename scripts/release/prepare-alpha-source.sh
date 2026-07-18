#!/usr/bin/env bash

set -Eeuo pipefail
: "${RELEASE_SHA:?RELEASE_SHA is required}"
: "${DEPLOY_BUCKET:?DEPLOY_BUCKET is required}"
: "${EXPECTED_BUCKET_OWNER:?EXPECTED_BUCKET_OWNER is required}"
[[ "${RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]]

archive="/tmp/teameet-alpha-${RELEASE_SHA}.tar.gz"
object_key="releases/${RELEASE_SHA}.tar.gz"
git archive --format=tar "${RELEASE_SHA}" \
  .changeset .dockerignore package.json pnpm-lock.yaml pnpm-workspace.yaml \
  apps/v1_api apps/v1_web deploy scripts/release | gzip -n > "${archive}"
source_sha256="$(sha256sum "${archive}" | awk '{print $1}')"

if source_version_id="$(aws s3api head-object --bucket "${DEPLOY_BUCKET}" \
  --key "${object_key}" --expected-bucket-owner "${EXPECTED_BUCKET_OWNER}" \
  --query VersionId --output text 2>/dev/null)"; then
  aws s3api get-object --bucket "${DEPLOY_BUCKET}" --key "${object_key}" \
    --version-id "${source_version_id}" --expected-bucket-owner "${EXPECTED_BUCKET_OWNER}" \
    /tmp/existing-source.tar.gz >/dev/null
  [[ "$(sha256sum /tmp/existing-source.tar.gz | awk '{print $1}')" == "${source_sha256}" ]] || {
    echo "Existing source object differs for immutable SHA ${RELEASE_SHA}" >&2
    exit 1
  }
else
  source_version_id="$(aws s3api put-object --bucket "${DEPLOY_BUCKET}" \
    --key "${object_key}" --body "${archive}" --expected-bucket-owner "${EXPECTED_BUCKET_OWNER}" \
    --if-none-match '*' \
    --query VersionId --output text)"
fi
[[ "${source_version_id}" =~ ^[A-Za-z0-9._+=/-]{1,1024}$ ]]
echo "sourceVersionId=${source_version_id}" >> "${GITHUB_OUTPUT}"
echo "sourceSha256=${source_sha256}" >> "${GITHUB_OUTPUT}"

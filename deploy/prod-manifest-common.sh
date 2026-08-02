#!/usr/bin/env bash

# 불변(immutable) prod 릴리스 manifest 검증 + 환경변수 로딩 헬퍼.
# deploy/alpha-manifest-common.sh 를 prod 용으로 일반화한 것 — S3 개념(bucket/versionId)이
# 없다는 점만 다르다(D2: 소스는 ssh-rsync 로 직접 전송, S3 중계를 쓰지 않는다).

validate_prod_release_manifest() {
  local manifest_file="$1"
  local expected_sha="$2"
  local expected_version="$3"
  local expected_manifest_sha256="$4"
  local expected_registry="$5"
  local actual_manifest_sha256

  actual_manifest_sha256="$(sha256sum "${manifest_file}" | awk '{print $1}')"
  if [[ "${actual_manifest_sha256}" != "${expected_manifest_sha256}" ]]; then
    echo "[prod-release] Manifest checksum mismatch" >&2
    return 1
  fi

  jq -e \
    --arg sha "${expected_sha}" \
    --arg version "${expected_version}" \
    --arg registry "${expected_registry}" \
    '
      .schemaVersion == 1 and
      .environment == "production" and
      .release.sha == $sha and
      .release.version == $version and
      (.release.createdAt | type == "string" and length > 0) and
      .source.transfer == "ssh-rsync" and
      (.source.sha256 | test("^[0-9a-f]{64}$")) and
      .database.migrationPolicy == "expand-contract" and
      .database.rollbackMode == "application-images-only" and
      .database.compatibilityCheck == "expand-contract-sql-v1" and
      ((.database.migrationValidatedFrom == null) or (.database.migrationValidatedFrom | test("^[0-9a-f]{40}$"))) and
      ((.database.rollbackCompatibleWith == null) or (.database.rollbackCompatibleWith | test("^[0-9a-f]{40}$"))) and
      .images.api.repository == ($registry + "/teameet-prod-v1-api") and
      .images.web.repository == ($registry + "/teameet-prod-v1-web") and
      (.images.api.digest | test("^sha256:[0-9a-f]{64}$")) and
      (.images.web.digest | test("^sha256:[0-9a-f]{64}$")) and
      .images.api.uri == (.images.api.repository + "@" + .images.api.digest) and
      .images.web.uri == (.images.web.repository + "@" + .images.web.digest)
    ' "${manifest_file}" >/dev/null
}

validate_stored_prod_manifest() {
  local manifest_file="$1"
  local expected_registry="$2"
  local expected_checksum="$3"
  local stored_sha
  local stored_version

  stored_sha="$(jq -er '.release.sha' "${manifest_file}")"
  stored_version="$(jq -er '.release.version' "${manifest_file}")"
  validate_prod_release_manifest \
    "${manifest_file}" \
    "${stored_sha}" \
    "${stored_version}" \
    "${expected_checksum}" \
    "${expected_registry}"
}

load_prod_release_manifest() {
  local manifest_file="$1"

  export PROD_RELEASE_VERSION
  export PROD_RELEASE_SHA
  export V1_API_IMAGE
  export V1_WEB_IMAGE
  PROD_RELEASE_VERSION="$(jq -er '.release.version' "${manifest_file}")"
  PROD_RELEASE_SHA="$(jq -er '.release.sha' "${manifest_file}")"
  V1_API_IMAGE="$(jq -er '.images.api.uri' "${manifest_file}")"
  V1_WEB_IMAGE="$(jq -er '.images.web.uri' "${manifest_file}")"
}

#!/usr/bin/env bash

# Immutable alpha manifest validation and environment loading helpers.

validate_alpha_release_manifest() {
  local manifest_file="$1"
  local expected_sha="$2"
  local expected_version="$3"
  local expected_manifest_sha256="$4"
  local expected_registry="$5"
  local actual_manifest_sha256

  actual_manifest_sha256="$(sha256sum "${manifest_file}" | awk '{print $1}')"
  if [[ "${actual_manifest_sha256}" != "${expected_manifest_sha256}" ]]; then
    echo "[alpha-release] Manifest checksum mismatch" >&2
    return 1
  fi

  jq -e \
    --arg sha "${expected_sha}" \
    --arg version "${expected_version}" \
    --arg registry "${expected_registry}" \
    '
      .schemaVersion == 1 and
      .environment == "alpha" and
      .release.sha == $sha and
      .release.version == $version and
      (.release.createdAt | type == "string" and length > 0) and
      .source.key == ("releases/" + $sha + ".tar.gz") and
      (.source.bucket | type == "string" and length > 0) and
      (.source.versionId | type == "string" and length > 0) and
      (.source.sha256 | test("^[0-9a-f]{64}$")) and
      .database.migrationPolicy == "expand-contract" and
      .database.rollbackMode == "application-images-only" and
      .database.compatibilityCheck == "expand-contract-sql-v1" and
      ((.database.migrationValidatedFrom == null) or (.database.migrationValidatedFrom | test("^[0-9a-f]{40}$"))) and
      ((.database.rollbackCompatibleWith == null) or (.database.rollbackCompatibleWith | test("^[0-9a-f]{40}$"))) and
      .images.api.repository == ($registry + "/teameet-alpha-v1-api") and
      .images.web.repository == ($registry + "/teameet-alpha-v1-web") and
      (.images.api.digest | test("^sha256:[0-9a-f]{64}$")) and
      (.images.web.digest | test("^sha256:[0-9a-f]{64}$")) and
      .images.api.uri == (.images.api.repository + "@" + .images.api.digest) and
      .images.web.uri == (.images.web.repository + "@" + .images.web.digest)
    ' "${manifest_file}" >/dev/null
}

validate_stored_alpha_manifest() {
  local manifest_file="$1"
  local expected_registry="$2"
  local expected_checksum="$3"
  local stored_sha
  local stored_version

  stored_sha="$(jq -er '.release.sha' "${manifest_file}")"
  stored_version="$(jq -er '.release.version' "${manifest_file}")"
  validate_alpha_release_manifest \
    "${manifest_file}" \
    "${stored_sha}" \
    "${stored_version}" \
    "${expected_checksum}" \
    "${expected_registry}"
}

validate_alpha_release_source_binding() {
  local manifest_file="$1"

  : "${ALPHA_SOURCE_BUCKET:?ALPHA_SOURCE_BUCKET is required}"
  : "${ALPHA_SOURCE_VERSION_ID:?ALPHA_SOURCE_VERSION_ID is required}"
  : "${ALPHA_SOURCE_SHA256:?ALPHA_SOURCE_SHA256 is required}"
  jq -e \
    --arg bucket "${ALPHA_SOURCE_BUCKET}" \
    --arg versionId "${ALPHA_SOURCE_VERSION_ID}" \
    --arg sha256 "${ALPHA_SOURCE_SHA256}" \
    '.source.bucket == $bucket and .source.versionId == $versionId and .source.sha256 == $sha256' \
    "${manifest_file}" >/dev/null
}

load_alpha_release_manifest() {
  local manifest_file="$1"

  export ALPHA_RELEASE_VERSION
  export ALPHA_RELEASE_SHA
  export ALPHA_API_IMAGE
  export ALPHA_WEB_IMAGE
  ALPHA_RELEASE_VERSION="$(jq -er '.release.version' "${manifest_file}")"
  ALPHA_RELEASE_SHA="$(jq -er '.release.sha' "${manifest_file}")"
  ALPHA_API_IMAGE="$(jq -er '.images.api.uri' "${manifest_file}")"
  ALPHA_WEB_IMAGE="$(jq -er '.images.web.uri' "${manifest_file}")"
}

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
      .database.migrationPolicy == "task168-stageAIntermediate" and
      .database.rollbackMode == "canonical-intermediate-only" and
      .database.compatibilityCheck == "expand-contract-sql-v1" and
      ((.database.migrationValidatedFrom == null) or (.database.migrationValidatedFrom | test("^[0-9a-f]{40}$"))) and
      ((.database.rollbackCompatibleWith == null) or (.database.rollbackCompatibleWith | test("^[0-9a-f]{40}$"))) and
      .database.task168.stage == "stageAIntermediate" and
      .database.task168.schemaSha256 == "91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f" and
      .database.task168.runtimeClientSchemaSha256 == .database.task168.schemaSha256 and
      .database.task168.cutoverArchiveSha256 == "694a17ba8ed3d062b68908d4fd4ca3085be28afbe2c9661dd7a1cfae2c6e799b" and
      .database.task168.cutoverManifestSha256 == "aa1753551026795af1af70352e54bfed31759fda826fe7a0244f43603ac8bb26" and
      (.database.task168.migrations | length == 10) and
      ([.database.task168.migrations[] | (.name | test("^[0-9]{14}_v1_")) and (.sha256 | test("^[0-9a-f]{64}$"))] | all) and
      .images.api.repository == ($registry + "/teameet-alpha-v1-api") and
      .images.web.repository == ($registry + "/teameet-alpha-v1-web") and
      (.images.api.digest | test("^sha256:[0-9a-f]{64}$")) and
      (.images.web.digest | test("^sha256:[0-9a-f]{64}$")) and
      .images.api.uri == (.images.api.repository + "@" + .images.api.digest) and
      .images.web.uri == (.images.web.repository + "@" + .images.web.digest)
      and .images.cutoverTool.repository == ($registry + "/teameet-alpha-v1-api") and
      (.images.cutoverTool.digest | test("^sha256:[0-9a-f]{64}$")) and
      .images.cutoverTool.uri == (.images.cutoverTool.repository + "@" + .images.cutoverTool.digest)
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
  export ALPHA_TASK168_STAGE
  # 줄마다 `|| return 1` 이 필요하다 — 함수 반환값은 **마지막 대입**의 것이라, 앞의 셋이
  # 실패해도 마지막 하나만 성공하면 0 이 나갔다. 그러면 `ALPHA_API_IMAGE` 가 빈 문자열인
  # 채로 `pull_release_images` 가 `docker pull ""` 를 시도한다.
  ALPHA_RELEASE_VERSION="$(jq -er '.release.version' "${manifest_file}")" || return 1
  ALPHA_RELEASE_SHA="$(jq -er '.release.sha' "${manifest_file}")" || return 1
  ALPHA_API_IMAGE="$(jq -er '.images.api.uri' "${manifest_file}")" || return 1
  ALPHA_WEB_IMAGE="$(jq -er '.images.web.uri' "${manifest_file}")" || return 1
  ALPHA_TASK168_STAGE="$(jq -er '.database.task168.stage' "${manifest_file}")" || return 1
}

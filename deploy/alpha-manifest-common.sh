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
      .database.task168.cutoverArchiveSha256 == "829cbb214afc26c417947c864fd477647498003e06915ca20b4d2f8b44b80c4b" and
      .database.task168.cutoverManifestSha256 == "b270be3c365ad780a2988ccf16f4850c15807ebc3eb9eb763f2bcdd0418f2f74" and
      (.database.task168.migrations | length == 10) and
      ((.database.task168.recoveryFrom == null) or (.database.task168.recoveryFrom | type == "object" and (.releaseSha | test("^[0-9a-f]{40}$")) and (.cutoverReport | type == "string" and length > 0) and (.quiesceReceipt | type == "string" and length > 0) and (.backupReceipt | type == "string" and length > 0) and (.backupPath | type == "string" and length > 0) and (.cutoverReportSha256 | test("^[0-9a-f]{64}$")) and (.quiesceReceiptSha256 | test("^[0-9a-f]{64}$")) and (.backupReceiptSha256 | test("^[0-9a-f]{64}$")) and (.backupSha256 | test("^[0-9a-f]{64}$")))) and
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

# StageB-only. Unlike validate_alpha_release_manifest, the runner
# (deploy/task168-stage-b-migrate.sh) never calls this — its own jq
# validation (frozen, CLI contract §3) is already sufficient and
# exists precisely so this function is not a second, divergent validation
# path for the same manifest. This function is for the two places that
# create or re-verify a StageB manifest from the outside: the manifest
# builder (create-alpha-release-manifest.sh) and validate_stored_alpha_manifest
# below (used by restore/rollback once a StageB manifest can be active).
validate_alpha_stage_b_final_manifest() {
  local manifest_file="$1"
  local expected_sha="$2"
  local expected_version="$3"
  local expected_manifest_sha256="$4"
  local expected_registry="$5"
  local expected_schema_sha="$6"
  local expected_migrations_json="$7"
  local expected_predecessor_json="$8"
  local expected_preflight_json="$9"
  local expected_full_history_json="${10}"
  local actual_manifest_sha256

  actual_manifest_sha256="$(sha256sum "${manifest_file}" | awk '{print $1}')"
  if [[ "${actual_manifest_sha256}" != "${expected_manifest_sha256}" ]]; then
    echo "[alpha-release] StageB manifest checksum mismatch" >&2
    return 1
  fi

  jq -e \
    --arg sha "${expected_sha}" \
    --arg version "${expected_version}" \
    --arg registry "${expected_registry}" \
    --arg schema "${expected_schema_sha}" \
    --argjson migrations "${expected_migrations_json}" \
    --argjson predecessor "${expected_predecessor_json}" \
    --argjson preflight "${expected_preflight_json}" \
    --argjson fullHistory "${expected_full_history_json}" \
    '
      .schemaVersion == 1 and
      .environment == "alpha" and
      .release.sha == $sha and
      .release.version == $version and
      (.release.createdAt | type == "string" and length > 0) and
      (.source.key | test("\\.tar\\.gz$")) and
      (.source.bucket | type == "string" and length > 0) and
      (.source.versionId | type == "string" and length > 0) and
      (.source.sha256 | test("^[0-9a-f]{64}$")) and
      .database.migrationPolicy == "task168-stageBFinal" and
      .database.rollbackMode == "backup-only" and
      .database.compatibilityCheck == "expand-contract-sql-v1" and
      .database.migrationValidatedFrom == null and
      .database.rollbackCompatibleWith == null and
      .database.task168.stage == "stageBFinal" and
      .database.task168.schemaSha256 == $schema and
      .database.task168.runtimeClientSchemaSha256 == $schema and
      .database.task168.recoveryFrom == null and
      .database.task168.rollbackTarget == null and
      .database.task168.migrations == $migrations and
      (.database.task168.fullMigrationHistory | length > 11) and
      .database.task168.fullMigrationHistory == $fullHistory and
      (.database.task168.resolvedMigrationAttemptsSha256 | test("^[0-9a-f]{64}$")) and
      .database.task168.predecessor == $predecessor and
      .database.task168.finalImagePreflight == $preflight and
      .images.api.repository == ($registry + "/teameet-alpha-v1-api") and
      .images.web.repository == ($registry + "/teameet-alpha-v1-web") and
      (.images.api.digest | test("^sha256:[0-9a-f]{64}$")) and
      (.images.web.digest | test("^sha256:[0-9a-f]{64}$")) and
      .images.api.uri == (.images.api.repository + "@" + .images.api.digest) and
      .images.web.uri == (.images.web.repository + "@" + .images.web.digest) and
      .images.cutoverTool.repository == ($registry + "/teameet-alpha-v1-api") and
      (.images.cutoverTool.digest | test("^sha256:[0-9a-f]{64}$")) and
      .images.cutoverTool.uri == (.images.cutoverTool.repository + "@" + .images.cutoverTool.digest)
    ' "${manifest_file}" >/dev/null
}

# D-4. Branches on the manifest's own
# `.database.task168.stage` and dispatches to the matching validator. The
# StageB branch derives the six extra validate_alpha_stage_b_final_manifest
# arguments FROM THE SAME MANIFEST it is validating — this proves internal
# structural consistency (every field is well-formed and mutually
# consistent) but NOT agreement with an external authority (it cannot detect
# a manifest that is internally consistent but simply wrong, e.g. a stale
# predecessor.databaseIdentity nobody re-checked). Callers that hold an
# independently-sourced expectation (the manifest builder, at creation time)
# should call validate_alpha_stage_b_final_manifest directly instead.
validate_stored_alpha_manifest() {
  local manifest_file="$1"
  local expected_registry="$2"
  local expected_checksum="$3"
  local stored_sha
  local stored_version
  local stage

  stored_sha="$(jq -er '.release.sha' "${manifest_file}")"
  stored_version="$(jq -er '.release.version' "${manifest_file}")"
  stage="$(jq -r '.database.task168.stage // empty' "${manifest_file}")"

  case "${stage}" in
    stageBFinal)
      validate_alpha_stage_b_final_manifest \
        "${manifest_file}" \
        "${stored_sha}" \
        "${stored_version}" \
        "${expected_checksum}" \
        "${expected_registry}" \
        "$(jq -er '.database.task168.schemaSha256' "${manifest_file}")" \
        "$(jq -c '.database.task168.migrations' "${manifest_file}")" \
        "$(jq -c '.database.task168.predecessor' "${manifest_file}")" \
        "$(jq -c '.database.task168.finalImagePreflight' "${manifest_file}")" \
        "$(jq -c '.database.task168.fullMigrationHistory' "${manifest_file}")"
      ;;
    *)
      validate_alpha_release_manifest \
        "${manifest_file}" \
        "${stored_sha}" \
        "${stored_version}" \
        "${expected_checksum}" \
        "${expected_registry}"
      ;;
  esac
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

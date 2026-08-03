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

  # docker-compose.prod.yml 은 이미지를 ${V1_API_IMAGE}/${V1_WEB_IMAGE} 로 참조하는데
  # 값이 비면 compose 가 **빈 문자열로 조용히 치환**해 배포가 이상하게 깨진다.
  #
  # compose 파일 쪽에 `:?` 가드를 걸면 안 된다 — alpha 가 이 파일을 베이스로 깔고
  # docker-compose.alpha.yml 로 이미지를 덮어쓰는데, compose 는 **override 병합 전에**
  # 모든 파일의 변수를 보간하므로 오버레이가 값을 덮어써도 베이스의 `:?` 가 먼저 터진다.
  # (2026-08-02 에 실제로 alpha 배포를 깼다: "error while interpolating
  #  services.v1_uploads_init.image: required variable V1_API_IMAGE is missing a value")
  #
  # 그래서 가드는 prod 경로에서만 도는 여기에 둔다. 형식까지 확인해 잘못된 값이
  # 흘러가는 것도 막는다.
  local name value
  for name in V1_API_IMAGE V1_WEB_IMAGE; do
    value="${!name}"
    if [[ ! "${value}" =~ ^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$ ]]; then
      echo "[prod-release] ${name} 이 ECR digest URI 가 아닙니다 (실제: '${value}')" >&2
      echo "[prod-release] 매니페스트: ${manifest_file}" >&2
      return 1
    fi
  done
}

#!/usr/bin/env bash

# 불변(immutable) prod 릴리스 manifest 검증 + 환경변수 로딩 헬퍼.
# deploy/alpha-manifest-common.sh 를 prod 용으로 일반화한 것 — S3 개념(bucket/versionId)이
# 없다는 점만 다르다(D2: 소스는 ssh-rsync 로 직접 전송, S3 중계를 쓰지 않는다).

# Task 175 Ruling R2's pinned schema: the exact 11 names, ascending, that
# `database.task168.migrations[]` must carry when that key is present. Single
# source of truth for both the jq set/order check below and the optional
# source-tree checksum comparison -- deploy/prod-task168.sh independently
# re-verifies the same pins at runtime (defense in depth, not reuse, per
# Ruling R5's note that these runners are deliberately not cross-wired).
readonly PROD_TASK168_MIGRATION_NAMES=(
  20260908130000_v1_team_match_tournament_expand
  20260908150000_v1_operation_audit_team_match_expand
  20260908160000_v1_official_fact_team_match_scope
  20260908170000_v1_lineup_invalidation
  20260908180000_v1_staff_scope_team_match
  20260909000000_v1_tournament_result_lineage
  20260909110000_v1_operation_audit_canonical_binding
  20260910010000_v1_official_fact_source_history
  20260910020000_v1_canonical_game_db_guards
  20260910160000_v1_outbox_cutover_claim_gate
  20260911090000_retire_tournament_fixture_tables
)

# $6 (optional): a source tree to check database.task168.migrations[].sha256
# against the actual migration.sql files it ships (name+content match).
# Left empty, that comparison is skipped -- the caller may not have (or may
# not have the RIGHT) source tree for this exact manifest available: a fresh
# deploy-prod.sh candidate always does (PROD_SOURCE_DIR IS this release's
# staged source), but validate_stored_prod_manifest's re-validation of an
# already-promoted active/previous manifest resolves its own immutable
# source dir instead of trusting whatever the current process happens to
# have lying around under PROD_SOURCE_DIR (which, inside deploy-prod.sh's
# ERR trap, belongs to a DIFFERENT, failed candidate release).
validate_prod_release_manifest() {
  local manifest_file="$1"
  local expected_sha="$2"
  local expected_version="$3"
  local expected_manifest_sha256="$4"
  local expected_registry="$5"
  local source_dir="${6:-}"
  local actual_manifest_sha256
  local task168_names_json

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
    ' "${manifest_file}" >/dev/null || {
    echo "[prod-release] Manifest schema invalid" >&2
    return 1
  }

  # Own jq -e call (not folded into the check above) so a task168 schema
  # violation gets its own diagnosable message instead of the same silent
  # "Manifest schema invalid" the unrelated release/source/images fields
  # share.
  task168_names_json="$(printf '%s\n' "${PROD_TASK168_MIGRATION_NAMES[@]}" | jq -R . | jq -sc .)" || return 1
  jq -e \
    --arg registry "${expected_registry}" \
    --argjson task168Names "${task168_names_json}" \
    '
      (.database.task168 == null) or
      (
        (.database.task168.stage == "stageA" or .database.task168.stage == "stageB") and
        (.database.task168.migrations | type == "array") and
        ((.database.task168.migrations | map(.name)) == $task168Names) and
        (.database.task168.migrations | all(.sha256 | test("^[0-9a-f]{64}$"))) and
        (.database.task168.rehearsal.evidence | type == "string" and length > 0) and
        (
          if .database.task168.stage == "stageA" then
            .images.cutoverTool.repository == ($registry + "/teameet-prod-v1-api") and
            (.images.cutoverTool.digest | test("^sha256:[0-9a-f]{64}$")) and
            .images.cutoverTool.uri == (.images.cutoverTool.repository + "@" + .images.cutoverTool.digest)
          else true end
        )
      )
    ' "${manifest_file}" >/dev/null || {
    echo "[prod-release] database.task168 schema invalid" >&2
    return 1
  }

  if [[ -n "${source_dir}" ]] && jq -e '.database.task168 != null' "${manifest_file}" >/dev/null 2>&1; then
    local name manifest_sha actual_sha migration_path
    for name in "${PROD_TASK168_MIGRATION_NAMES[@]}"; do
      manifest_sha="$(jq -er --arg n "${name}" '.database.task168.migrations[] | select(.name==$n) | .sha256' "${manifest_file}")" || {
        echo "[prod-release] database.task168.migrations is missing an entry for ${name}" >&2
        return 1
      }
      migration_path="${source_dir}/apps/v1_api/prisma/migrations/${name}/migration.sql"
      [[ -f "${migration_path}" ]] || {
        echo "[prod-release] Task168 migration source is missing: ${migration_path}" >&2
        return 1
      }
      actual_sha="$(sha256sum "${migration_path}" | awk '{print $1}')" || return 1
      [[ "${actual_sha}" == "${manifest_sha}" ]] || {
        echo "[prod-release] database.task168.migrations checksum for ${name} does not match the source tree" >&2
        return 1
      }
    done
  fi
}

validate_stored_prod_manifest() {
  local manifest_file="$1"
  local expected_registry="$2"
  local expected_checksum="$3"
  local stored_sha
  local stored_version
  local stored_source_dir=''

  stored_sha="$(jq -er '.release.sha' "${manifest_file}")"
  stored_version="$(jq -er '.release.version' "${manifest_file}")"
  # A previously-promoted manifest's own immutable source tree (kept on disk
  # by prune_stale_prod_release_sources as long as it is active/previous) --
  # not PROD_SOURCE_DIR, which at re-validation time (deploy-prod.sh's ERR
  # trap, or rollback-prod.sh, which never sets it at all) belongs to a
  # different release or is unset.
  [[ -d "${PROD_SOURCE_RELEASES_DIR}/${stored_sha}" ]] &&
    stored_source_dir="${PROD_SOURCE_RELEASES_DIR}/${stored_sha}"
  validate_prod_release_manifest \
    "${manifest_file}" \
    "${stored_sha}" \
    "${stored_version}" \
    "${expected_checksum}" \
    "${expected_registry}" \
    "${stored_source_dir}"
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

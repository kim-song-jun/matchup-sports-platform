#!/usr/bin/env bash

set -Eeuo pipefail

# scripts/release/create-alpha-release-manifest.sh 를 prod 용으로 일반화한 것.
# D2: S3 에 manifest 를 영속 저장하지 않으므로(소스는 ssh-rsync 로 직접 전송) "이미 존재하는
# manifest 재사용" 케이스 자체가 없다 — validate_existing_manifest() 는 이식하지 않는다.
# 매 실행이 항상 신규 생성이다.

# Fix round 1, Minor 3: resolved from this script's own location, not cwd --
# the CI step invokes this from the repo root so it worked there by
# coincidence, but a caller running it from any other directory (or a test)
# would silently hash the wrong (or a nonexistent) migration.sql.
readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

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

# Task 175 T5: emits `database.task168` (+ `images.cutoverTool` for stageA)
# only when a stage transition was actually requested via TASK168_STAGE.
# Own pinned migration-name list -- deliberately NOT sourced from
# deploy/prod-manifest-common.sh's identical array. Every Task168 component
# in this repo keeps its own pinned copy on purpose (defense in depth:
# deploy/prod-task168.sh does the same against prod-manifest-common.sh, see
# its header) so one file drifting doesn't silently take every consumer
# with it.
readonly TASK168_MIGRATION_NAMES=(
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

task168_stage="${TASK168_STAGE:-none}"
database_task168_json='null'
images_cutover_tool_json='null'

if [[ "${task168_stage}" != none ]]; then
  case "${task168_stage}" in
    stageA|stageB) ;;
    *)
      echo "Unknown TASK168_STAGE: ${task168_stage}" >&2
      exit 1
      ;;
  esac
  : "${TASK168_REHEARSAL_EVIDENCE:?TASK168_REHEARSAL_EVIDENCE is required when TASK168_STAGE=${task168_stage}}"

  migrations_json="$(
    for name in "${TASK168_MIGRATION_NAMES[@]}"; do
      migration_path="${ROOT_DIR}/apps/v1_api/prisma/migrations/${name}/migration.sql"
      [[ -f "${migration_path}" ]] || {
        echo "Task168 migration source is missing: ${migration_path}" >&2
        exit 1
      }
      sha="$(sha256sum "${migration_path}" | awk '{print $1}')"
      jq -n --arg name "${name}" --arg sha "${sha}" '{name:$name,sha256:$sha}'
    done | jq -sc .
  )"

  database_task168_json="$(jq -n \
    --arg stage "${task168_stage}" \
    --argjson migrations "${migrations_json}" \
    --arg evidence "${TASK168_REHEARSAL_EVIDENCE}" \
    '{stage:$stage,migrations:$migrations,rehearsal:{evidence:$evidence}}')"

  if [[ "${task168_stage}" == stageA ]]; then
    : "${TASK168_CUTOVER_DIGEST:?TASK168_CUTOVER_DIGEST is required when TASK168_STAGE=stageA}"
    images_cutover_tool_json="$(jq -n \
      --arg repository "${REGISTRY}/teameet-prod-v1-api" \
      --arg digest "${TASK168_CUTOVER_DIGEST}" \
      '{repository:$repository,digest:$digest,uri:($repository+"@"+$digest)}')"
  fi
fi

jq -Sn \
  --arg sha "${RELEASE_SHA}" --arg version "${RELEASE_VERSION}" --arg createdAt "${created_at}" \
  --arg sourceSha256 "${SOURCE_SHA256}" \
  --arg apiRepository "${REGISTRY}/teameet-prod-v1-api" --arg apiDigest "${api_digest}" \
  --arg webRepository "${REGISTRY}/teameet-prod-v1-web" --arg webDigest "${web_digest}" \
  --arg previous "${PREVIOUS_SHA}" --arg migrationBase "${MIGRATION_BASE_SHA}" \
  --argjson task168 "${database_task168_json}" \
  --argjson cutoverTool "${images_cutover_tool_json}" \
  '{
    schemaVersion:1,
    environment:"production",
    release:{sha:$sha,version:$version,createdAt:$createdAt},
    source:{transfer:"ssh-rsync",sha256:$sourceSha256},
    database:(
      {
        migrationPolicy:"expand-contract",
        rollbackMode:"application-images-only",
        compatibilityCheck:"expand-contract-sql-v1",
        migrationValidatedFrom:(if $migrationBase == "none" then null else $migrationBase end),
        rollbackCompatibleWith:(if $previous == "none" then null else $previous end)
      } + (if $task168 == null then {} else {task168:$task168} end)
    ),
    images:(
      {
        api:{repository:$apiRepository,digest:$apiDigest,uri:($apiRepository+"@"+$apiDigest)},
        web:{repository:$webRepository,digest:$webDigest,uri:($webRepository+"@"+$webDigest)}
      } + (if $cutoverTool == null then {} else {cutoverTool:$cutoverTool} end)
    )
  }' \
  > "${manifest}"

echo "manifestSha256=$(sha256sum "${manifest}" | awk '{print $1}')" >> "${GITHUB_OUTPUT}"
echo "apiDigest=${api_digest}" >> "${GITHUB_OUTPUT}"
echo "webDigest=${web_digest}" >> "${GITHUB_OUTPUT}"
echo "manifestPath=${manifest}" >> "${GITHUB_OUTPUT}"

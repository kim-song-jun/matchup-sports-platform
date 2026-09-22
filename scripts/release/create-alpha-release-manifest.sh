#!/usr/bin/env bash
set -Eeuo pipefail

# Task 168 M11 converged: this creator now emits the "final" release policy
# manifest (schema.prisma is the post-retirement schema; M11 lives in
# apps/v1_api/prisma/migrations like any other migration). There is no more
# cutover tool image or frozen M1-M10 checksum list in this manifest — the
# steady check-only script (deploy/task168-final-steady-migrate.sh) reads the
# candidate source tree directly against the live DB ledger at deploy time.
#
# rollbackCompatibleWith is final<->final only (item 8): it is set only when
# the caller attests the previous active release was ALSO the final policy
# (PREVIOUS_STAGE=final). A previous StageA release, or no previous release,
# leaves it null so rollback-alpha.sh cannot be pointed at a StageA release.

# Sourced only for validate_alpha_stage_b_final_manifest (StageB path below) —
# the final path's validate_existing_manifest keeps its own inline schema.
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../deploy" && pwd)/alpha-manifest-common.sh"

# Task 168 name list, order fixed (identical to
# deploy/task168-stage-b-migrate.sh's ALL_MIGRATIONS[0:10] + M11).
readonly TASK168_M1_M10=(
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
)
readonly TASK168_M11=20260911090000_retire_tournament_fixture_tables
readonly TASK168_M11_PATH="deploy/task168-final-drop/migrations/${TASK168_M11}/migration.sql"
readonly TASK168_FINAL_SCHEMA_SHA256=e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46

build_stage_b_migrations_json() {
  local name path
  local result='[]'
  for name in "${TASK168_M1_M10[@]}" "${TASK168_M11}"; do
    if [[ "${name}" == "${TASK168_M11}" ]]; then
      path="${TASK168_M11_PATH}"
    else
      path="apps/v1_api/prisma/migrations/${name}/migration.sql"
    fi
    [[ -f "${path}" ]] || { echo "Task168 migration file missing: ${path}" >&2; return 1; }
    result="$(jq -c --arg name "${name}" --arg sha "$(sha256sum "${path}" | awk '{print $1}')" \
      '. + [{name:$name,sha256:$sha}]' <<< "${result}")"
  done
  printf '%s\n' "${result}"
}

# The runner's full-ledger check (deploy/task168-stage-b-migrate.sh
# canonical_history_from_root) walks EVERY migration under
# apps/v1_api/prisma/migrations in sorted order and appends M11 last — this
# mirrors that walk exactly so the manifest binds to the same list the
# runner will independently recompute from the source tree at execution
# time. Their disagreement is exactly what the runner's own comparison
# against FULL_MIGRATION_HISTORY is designed to catch; this function
# existing does not weaken that check, since the two are computed
# independently from the same source tree by different code.
build_stage_b_full_history_json() {
  local dir result='[]' name sha
  while IFS= read -r -d '' dir; do
    name="$(basename "${dir}")"
    [[ -f "${dir}/migration.sql" ]] || { echo "migration history entry has no migration.sql: ${name}" >&2; return 1; }
    sha="$(sha256sum "${dir}/migration.sql" | awk '{print $1}')"
    result="$(jq -c --arg name "${name}" --arg sha "${sha}" '. + [{name:$name,sha256:$sha}]' <<< "${result}")"
  done < <(find apps/v1_api/prisma/migrations -mindepth 1 -maxdepth 1 -type d -print0 | LC_ALL=C sort -z)
  result="$(jq -c --arg name "${TASK168_M11}" --arg sha "$(sha256sum "${TASK168_M11_PATH}" | awk '{print $1}')" \
    '. + [{name:$name,sha256:$sha}]' <<< "${result}")"
  printf '%s\n' "${result}"
}

validate_existing_manifest() {
  local manifest_file="$1"
  jq -e \
    --arg sha "$RELEASE_SHA" --arg version "$RELEASE_VERSION" \
    --arg bucket "$DEPLOY_BUCKET" --arg sourceVersionId "$SOURCE_VERSION_ID" --arg sourceSha256 "$SOURCE_SHA256" \
    --arg apiRepository "$REGISTRY/teameet-alpha-v1-api" --arg apiDigest "$api_digest" \
    --arg webRepository "$REGISTRY/teameet-alpha-v1-web" --arg webDigest "$web_digest" \
    --arg previous "$PREVIOUS_SHA" --arg migrationBase "$MIGRATION_BASE_SHA" \
    --arg schema "$TASK168_SCHEMA_SHA256" --arg m11 "$TASK168_M11_SHA256" \
    --arg rollbackCompatible "$rollback_compatible_with" \
    '.schemaVersion == 1 and .environment == "alpha" and
     .release.sha == $sha and .release.version == $version and
     .source.bucket == $bucket and .source.key == ("releases/" + $sha + ".tar.gz") and
     .source.versionId == $sourceVersionId and .source.sha256 == $sourceSha256 and
     .images.api.repository == $apiRepository and .images.api.digest == $apiDigest and .images.api.uri == ($apiRepository + "@" + $apiDigest) and
     .images.web.repository == $webRepository and .images.web.digest == $webDigest and .images.web.uri == ($webRepository + "@" + $webDigest) and
     .database.migrationPolicy == "task168-final" and .database.rollbackMode == "final-only" and
     .database.compatibilityCheck == "expand-contract-sql-v1" and
     ((.database.migrationValidatedFrom == null) or (.database.migrationValidatedFrom | test("^[0-9a-f]{40}$"))) and
     (($migrationBase == $sha) or .database.migrationValidatedFrom == (if $migrationBase == "none" then null else $migrationBase end)) and
     .database.rollbackCompatibleWith == (if $rollbackCompatible == "" then null else $rollbackCompatible end) and
     .database.task168.stage == "final" and .database.task168.schemaSha256 == $schema and
     .database.task168.runtimeClientSchemaSha256 == $schema and
     .database.task168.m11Sha256 == $m11' \
    "$manifest_file" >/dev/null
}

if [[ "${1:-}" == '--self-test' ]]; then
  RELEASE_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  RELEASE_VERSION=0.1.0-alpha.20260719.gbbbbbbbbbbbb
  DEPLOY_BUCKET=alpha-bucket
  SOURCE_VERSION_ID=version-1
  SOURCE_SHA256=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
  REGISTRY=111111111111.dkr.ecr.ap-northeast-2.amazonaws.com
  PREVIOUS_SHA="$RELEASE_SHA"
  PREVIOUS_STAGE=final
  MIGRATION_BASE_SHA="$RELEASE_SHA"
  TASK168_SCHEMA_SHA256=8f732248e1e0bf1882184dd35cec3d5a48a65ce5556c250de486c7e5955ebade
  TASK168_M11_SHA256=08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323
  api_digest=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  web_digest=sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
  fixture="$(mktemp)"
  trap 'rm -f "${fixture}"' EXIT

  rollback_compatible_with="$PREVIOUS_SHA"
  jq -n \
    --arg sha "$RELEASE_SHA" --arg version "$RELEASE_VERSION" --arg bucket "$DEPLOY_BUCKET" --arg sourceVersion "$SOURCE_VERSION_ID" --arg sourceSha "$SOURCE_SHA256" --arg registry "$REGISTRY" \
    --arg apiDigest "$api_digest" --arg webDigest "$web_digest" --arg schema "$TASK168_SCHEMA_SHA256" --arg m11 "$TASK168_M11_SHA256" --arg rollbackCompatible "$rollback_compatible_with" \
    '{schemaVersion:1,environment:"alpha",release:{sha:$sha,version:$version},source:{bucket:$bucket,key:("releases/"+$sha+".tar.gz"),versionId:$sourceVersion,sha256:$sourceSha},database:{migrationPolicy:"task168-final",rollbackMode:"final-only",compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",rollbackCompatibleWith:$rollbackCompatible,task168:{stage:"final",schemaSha256:$schema,runtimeClientSchemaSha256:$schema,m11Sha256:$m11}},images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:$apiDigest,uri:($registry+"/teameet-alpha-v1-api@"+$apiDigest)},web:{repository:($registry+"/teameet-alpha-v1-web"),digest:$webDigest,uri:($registry+"/teameet-alpha-v1-web@"+$webDigest)}}}' > "$fixture"
  validate_existing_manifest "$fixture"

  # Positive: previous release was StageA (or absent) -> rollbackCompatibleWith
  # must be null, never bound to a StageA sha.
  PREVIOUS_STAGE=stageAIntermediate
  rollback_compatible_with=""
  jq -n \
    --arg sha "$RELEASE_SHA" --arg version "$RELEASE_VERSION" --arg bucket "$DEPLOY_BUCKET" --arg sourceVersion "$SOURCE_VERSION_ID" --arg sourceSha "$SOURCE_SHA256" --arg registry "$REGISTRY" \
    --arg apiDigest "$api_digest" --arg webDigest "$web_digest" --arg schema "$TASK168_SCHEMA_SHA256" --arg m11 "$TASK168_M11_SHA256" \
    '{schemaVersion:1,environment:"alpha",release:{sha:$sha,version:$version},source:{bucket:$bucket,key:("releases/"+$sha+".tar.gz"),versionId:$sourceVersion,sha256:$sourceSha},database:{migrationPolicy:"task168-final",rollbackMode:"final-only",compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",rollbackCompatibleWith:null,task168:{stage:"final",schemaSha256:$schema,runtimeClientSchemaSha256:$schema,m11Sha256:$m11}},images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:$apiDigest,uri:($registry+"/teameet-alpha-v1-api@"+$apiDigest)},web:{repository:($registry+"/teameet-alpha-v1-web"),digest:$webDigest,uri:($registry+"/teameet-alpha-v1-web@"+$webDigest)}}}' > "$fixture"
  validate_existing_manifest "$fixture"

  # Negative: a manifest that binds rollbackCompatibleWith to a StageA
  # predecessor must be rejected once this script's own gating (below,
  # PREVIOUS_STAGE != final -> rollback_compatible_with empty) disagrees
  # with what is in the file.
  PREVIOUS_STAGE=stageAIntermediate
  rollback_compatible_with=""
  jq -n \
    --arg sha "$RELEASE_SHA" --arg version "$RELEASE_VERSION" --arg bucket "$DEPLOY_BUCKET" --arg sourceVersion "$SOURCE_VERSION_ID" --arg sourceSha "$SOURCE_SHA256" --arg registry "$REGISTRY" \
    --arg apiDigest "$api_digest" --arg webDigest "$web_digest" --arg schema "$TASK168_SCHEMA_SHA256" --arg m11 "$TASK168_M11_SHA256" --arg previous "$PREVIOUS_SHA" \
    '{schemaVersion:1,environment:"alpha",release:{sha:$sha,version:$version},source:{bucket:$bucket,key:("releases/"+$sha+".tar.gz"),versionId:$sourceVersion,sha256:$sourceSha},database:{migrationPolicy:"task168-final",rollbackMode:"final-only",compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",rollbackCompatibleWith:$previous,task168:{stage:"final",schemaSha256:$schema,runtimeClientSchemaSha256:$schema,m11Sha256:$m11}},images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:$apiDigest,uri:($registry+"/teameet-alpha-v1-api@"+$apiDigest)},web:{repository:($registry+"/teameet-alpha-v1-web"),digest:$webDigest,uri:($registry+"/teameet-alpha-v1-web@"+$webDigest)}}}' > "$fixture"
  if validate_existing_manifest "$fixture"; then
    echo 'A StageA predecessor was accepted as rollback-compatible with a final release' >&2
    exit 1
  fi

  MIGRATION_BASE_SHA=cccccccccccccccccccccccccccccccccccccccc
  PREVIOUS_STAGE=final
  rollback_compatible_with="$PREVIOUS_SHA"
  jq -n \
    --arg sha "$RELEASE_SHA" --arg version "$RELEASE_VERSION" --arg bucket "$DEPLOY_BUCKET" --arg sourceVersion "$SOURCE_VERSION_ID" --arg sourceSha "$SOURCE_SHA256" --arg registry "$REGISTRY" \
    --arg apiDigest "$api_digest" --arg webDigest "$web_digest" --arg schema "$TASK168_SCHEMA_SHA256" --arg m11 "$TASK168_M11_SHA256" --arg rollbackCompatible "$rollback_compatible_with" \
    '{schemaVersion:1,environment:"alpha",release:{sha:$sha,version:$version},source:{bucket:$bucket,key:("releases/"+$sha+".tar.gz"),versionId:$sourceVersion,sha256:$sourceSha},database:{migrationPolicy:"task168-final",rollbackMode:"final-only",compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",rollbackCompatibleWith:$rollbackCompatible,task168:{stage:"final",schemaSha256:$schema,runtimeClientSchemaSha256:$schema,m11Sha256:$m11}},images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:$apiDigest,uri:($registry+"/teameet-alpha-v1-api@"+$apiDigest)},web:{repository:($registry+"/teameet-alpha-v1-web"),digest:$webDigest,uri:($registry+"/teameet-alpha-v1-web@"+$webDigest)}}}' > "$fixture"
  if validate_existing_manifest "$fixture"; then
    echo 'Mismatched non-idempotent migration provenance was accepted' >&2
    exit 1
  fi
  echo '[alpha-release-manifest] Task168 final-policy provenance passed'
  exit 0
fi

# D-2 (S3 namespacing) — StageB branch. Falls through to the final-policy
# body below when TASK168_STAGE is unset or final, which is what the push
# path's "Create or reuse immutable release manifest" step sends.
if [[ "${TASK168_STAGE:-final}" != final ]]; then
  [[ "${TASK168_STAGE}" == stageBFinal ]] || { echo "unsupported TASK168_STAGE for manifest creation: ${TASK168_STAGE}" >&2; exit 1; }
  manifest_namespace="task168-stage-b"
  for name in RELEASE_SHA RELEASE_VERSION REGISTRY DEPLOY_BUCKET EXPECTED_BUCKET_OWNER \
    SOURCE_VERSION_ID SOURCE_SHA256 IMAGE_TAG WEB_IMAGE_TAG TOOL_IMAGE_TAG \
    TASK168_PREDECESSOR_RELEASE_SHA TASK168_PREDECESSOR_TRANSITION_PATH TASK168_PREDECESSOR_TRANSITION_SHA256 \
    TASK168_PREDECESSOR_API_IMAGE TASK168_PREDECESSOR_DATABASE_IDENTITY TASK168_RESOLVED_MIGRATION_ATTEMPTS_SHA256 \
    TASK168_EXPECTED_RUNNING_API_IMAGE_TAG \
    TASK168_REHEARSAL_MODE TASK168_REHEARSAL_REASON TASK168_REHEARSAL_DECIDED_AT; do
    [[ -n "${!name:-}" ]] || { echo "$name is required for TASK168_STAGE=stageBFinal" >&2; exit 1; }
  done
  [[ "${RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]] || { echo 'RELEASE_SHA must be a full commit SHA' >&2; exit 1; }
  [[ "${TASK168_PREDECESSOR_RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]] || { echo 'TASK168_PREDECESSOR_RELEASE_SHA must be a full commit SHA' >&2; exit 1; }
  # The runner cannot check this: the Alpha host has no git history. A release
  # that does not descend from the Stage A commit would be missing the
  # intermediate code the predecessor receipt authenticates, so refuse to mint
  # a manifest pairing them. A commit is its own ancestor, which is the
  # ordinary case (StageB dispatched against the SHA StageA deployed).
  # rc 1 and rc 128 are different operator problems (a wrong-but-real commit vs
  # one this checkout cannot see), and reporting both as "not an ancestor"
  # sends the reader to the wrong question.
  ancestry_rc=0
  git merge-base --is-ancestor "${TASK168_PREDECESSOR_RELEASE_SHA}" "${RELEASE_SHA}" || ancestry_rc=$?
  case "${ancestry_rc}" in
    0) ;;
    1) echo "StageA predecessor ${TASK168_PREDECESSOR_RELEASE_SHA} is not an ancestor of release ${RELEASE_SHA}" >&2; exit 1 ;;
    *) echo "could not decide whether ${TASK168_PREDECESSOR_RELEASE_SHA} is an ancestor of ${RELEASE_SHA} (git exited ${ancestry_rc}: unknown commit or unusable history)" >&2; exit 1 ;;
  esac
  # The only supported rehearsal mode right now is an explicit, user-directed
  # waiver (2026-09-14: Alpha is a dev environment, so M11 runs without an
  # isolated T5 rehearsal) -- no automated producer of a real
  # task168FinalImagePreflight receipt is wired into this pipeline. Reject
  # anything else before touching AWS rather than silently accepting it.
  [[ "${TASK168_REHEARSAL_MODE}" == waived ]] || { echo "unsupported TASK168_REHEARSAL_MODE: ${TASK168_REHEARSAL_MODE} (only 'waived' is wired)" >&2; exit 1; }

  api_digest="$(aws ecr describe-images --repository-name teameet-alpha-v1-api --image-ids "imageTag=${IMAGE_TAG}" --query 'imageDetails[0].imageDigest' --output text)"
  web_digest="$(aws ecr describe-images --repository-name teameet-alpha-v1-web --image-ids "imageTag=${WEB_IMAGE_TAG}" --query 'imageDetails[0].imageDigest' --output text)"
  tool_digest="$(aws ecr describe-images --repository-name teameet-alpha-v1-api --image-ids "imageTag=${TOOL_IMAGE_TAG}" --query 'imageDetails[0].imageDigest' --output text)"
  # What must already be serving this database when StageB starts: the StageA
  # build of this same release (sha-<release>), which the push deploy that
  # preceded this dispatch installed. Bound here, from ECR, so the runner
  # compares the live writers against an authenticated value instead of the
  # Stage A predecessor's image -- see deploy/task168-stage-b-migrate.sh's
  # pre-quiesce writer check.
  expected_running_digest="$(aws ecr describe-images --repository-name teameet-alpha-v1-api --image-ids "imageTag=${TASK168_EXPECTED_RUNNING_API_IMAGE_TAG}" --query 'imageDetails[0].imageDigest' --output text)"
  [[ "${expected_running_digest}" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "could not resolve a digest for ${TASK168_EXPECTED_RUNNING_API_IMAGE_TAG}" >&2; exit 1; }
  expected_running_api_image="${REGISTRY}/teameet-alpha-v1-api@${expected_running_digest}"

  migrations_json="$(build_stage_b_migrations_json)" || exit 1
  full_history_json="$(build_stage_b_full_history_json)" || exit 1
  # Bound in the manifest (not merely re-derived on the host, deploy/
  # task168-stage-b-migrate.sh's MIGRATION_LOCK_SHA) so a tampered
  # migration_lock.toml in the staged release source is caught against a
  # value fixed at manifest-creation time from this exact commit's own
  # migrations directory -- immutable for a given RELEASE_SHA, so unlike
  # resolvedMigrationAttemptsSha256 (live-DB derived) it needs no reuse-path
  # staleness re-check.
  migration_lock_sha256="$(sha256sum apps/v1_api/prisma/migrations/migration_lock.toml | awk '{print $1}')"
  predecessor_json="$(jq -nc \
    --arg releaseSha "${TASK168_PREDECESSOR_RELEASE_SHA}" \
    --arg transition "${TASK168_PREDECESSOR_TRANSITION_PATH}" \
    --arg transitionSha256 "${TASK168_PREDECESSOR_TRANSITION_SHA256}" \
    --arg apiImage "${TASK168_PREDECESSOR_API_IMAGE}" \
    --arg databaseIdentity "${TASK168_PREDECESSOR_DATABASE_IDENTITY}" \
    '{releaseSha:$releaseSha,transition:$transition,transitionSha256:$transitionSha256,apiImage:$apiImage,databaseIdentity:$databaseIdentity,schemaSha256:"91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f"}')"
  rehearsal_json="$(jq -nc \
    --arg mode "${TASK168_REHEARSAL_MODE}" \
    --arg reason "${TASK168_REHEARSAL_REASON}" \
    --arg decidedAt "${TASK168_REHEARSAL_DECIDED_AT}" \
    '{mode:$mode,reason:$reason,decidedAt:$decidedAt}')"

  resolved_migration_attempts_sha256="${TASK168_RESOLVED_MIGRATION_ATTEMPTS_SHA256}"

  manifest="/tmp/teameet-alpha-${manifest_namespace}-${RELEASE_SHA}.json"
  manifest_key="manifests/${manifest_namespace}/${RELEASE_SHA}.json"
  if manifest_version_id="$(aws s3api head-object --bucket "$DEPLOY_BUCKET" --key "$manifest_key" --expected-bucket-owner "$EXPECTED_BUCKET_OWNER" --query VersionId --output text 2>/dev/null)"; then
    aws s3api get-object --bucket "$DEPLOY_BUCKET" --key "$manifest_key" --version-id "$manifest_version_id" --expected-bucket-owner "$EXPECTED_BUCKET_OWNER" "$manifest" >/dev/null
    validate_alpha_stage_b_final_manifest "$manifest" "$RELEASE_SHA" "$RELEASE_VERSION" \
      "$(sha256sum "$manifest" | awk '{print $1}')" "$REGISTRY" "${TASK168_FINAL_SCHEMA_SHA256}" \
      "$migrations_json" "$predecessor_json" "$rehearsal_json" "$full_history_json"
    # validate_alpha_stage_b_final_manifest only proves the stored value is a
    # well-formed sha256 (self-consistency); it never compares it against
    # this run's freshly-read predecessor/live-DB snapshot. A stale reused
    # manifest would otherwise pass here and only fail once the runner
    # re-derives and compares it on the host.
    jq -e --arg expected "$resolved_migration_attempts_sha256" \
      '.database.task168.resolvedMigrationAttemptsSha256 == $expected' "$manifest" >/dev/null ||
      { echo "Reused StageB manifest's resolvedMigrationAttemptsSha256 does not match the freshly resolved snapshot" >&2; exit 1; }
    # Same reason: the stored value is only self-consistent. A rebuilt
    # sha-<release> tag would leave the reused manifest pinning a digest that
    # is no longer what the host runs, and the runner would refuse on the
    # host with far less context than this.
    jq -e --arg expected "$expected_running_api_image" \
      '.database.task168.expectedRunningApiImage == $expected' "$manifest" >/dev/null ||
      { echo "Reused StageB manifest's expectedRunningApiImage does not match the current sha-${RELEASE_SHA} image" >&2; exit 1; }
  else
    created_at="$(git show -s --format=%cI "$RELEASE_SHA")"
    jq -n --arg sha "$RELEASE_SHA" --arg version "$RELEASE_VERSION" --arg createdAt "$created_at" \
      --arg bucket "$DEPLOY_BUCKET" --arg sourceVersionId "$SOURCE_VERSION_ID" --arg sourceSha256 "$SOURCE_SHA256" \
      --arg registry "$REGISTRY" --arg apiDigest "$api_digest" --arg webDigest "$web_digest" --arg toolDigest "$tool_digest" \
      --arg schema "${TASK168_FINAL_SCHEMA_SHA256}" --argjson migrations "$migrations_json" \
      --argjson fullHistory "$full_history_json" --arg resolvedSha "$resolved_migration_attempts_sha256" \
      --arg migrationLockSha "$migration_lock_sha256" \
      --arg expectedRunningApiImage "$expected_running_api_image" \
      --argjson predecessor "$predecessor_json" --argjson rehearsal "$rehearsal_json" \
      '{schemaVersion:1,environment:"alpha",release:{sha:$sha,version:$version,createdAt:$createdAt},
        source:{bucket:$bucket,key:("releases/task168-stage-b/"+$sha+".tar.gz"),versionId:$sourceVersionId,sha256:$sourceSha256},
        database:{migrationPolicy:"task168-stageBFinal",rollbackMode:"backup-only",compatibilityCheck:"expand-contract-sql-v1",
          migrationValidatedFrom:null,rollbackCompatibleWith:null,
          task168:{stage:"stageBFinal",schemaSha256:$schema,runtimeClientSchemaSha256:$schema,migrations:$migrations,fullMigrationHistory:$fullHistory,
            resolvedMigrationAttemptsSha256:$resolvedSha,migrationLockSha256:$migrationLockSha,predecessor:$predecessor,
            expectedRunningApiImage:$expectedRunningApiImage,rehearsal:$rehearsal,
            recoveryFrom:null,rollbackTarget:null}},
        images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:$apiDigest,uri:($registry+"/teameet-alpha-v1-api@"+$apiDigest)},
          web:{repository:($registry+"/teameet-alpha-v1-web"),digest:$webDigest,uri:($registry+"/teameet-alpha-v1-web@"+$webDigest)},
          cutoverTool:{repository:($registry+"/teameet-alpha-v1-api"),digest:$toolDigest,uri:($registry+"/teameet-alpha-v1-api@"+$toolDigest)}}}' \
      > "$manifest"
    validate_alpha_stage_b_final_manifest "$manifest" "$RELEASE_SHA" "$RELEASE_VERSION" \
      "$(sha256sum "$manifest" | awk '{print $1}')" "$REGISTRY" "${TASK168_FINAL_SCHEMA_SHA256}" \
      "$migrations_json" "$predecessor_json" "$rehearsal_json" "$full_history_json"
    manifest_version_id="$(aws s3api put-object --bucket "$DEPLOY_BUCKET" --key "$manifest_key" --body "$manifest" --content-type application/json --if-none-match '*' --expected-bucket-owner "$EXPECTED_BUCKET_OWNER" --query VersionId --output text)"
  fi
  [[ "$manifest_version_id" =~ ^[A-Za-z0-9._+=/-]{1,255}$ ]]
  echo "manifestSha256=$(sha256sum "$manifest" | awk '{print $1}')" >> "$GITHUB_OUTPUT"
  echo "manifestVersionId=$manifest_version_id" >> "$GITHUB_OUTPUT"
  exit 0
fi

for name in RELEASE_SHA RELEASE_VERSION REGISTRY DEPLOY_BUCKET EXPECTED_BUCKET_OWNER SOURCE_VERSION_ID SOURCE_SHA256 IMAGE_TAG PREVIOUS_SHA PREVIOUS_STAGE MIGRATION_BASE_SHA TASK168_SCHEMA_SHA256 TASK168_M11_SHA256; do
  [[ -n "${!name:-}" ]] || { echo "$name is required" >&2; exit 1; }
done
[[ "$TASK168_SCHEMA_SHA256" == 8f732248e1e0bf1882184dd35cec3d5a48a65ce5556c250de486c7e5955ebade && "$TASK168_M11_SHA256" == 08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323 ]] || { echo 'Task168 final-policy binding mismatch' >&2; exit 1; }

if [[ "$PREVIOUS_STAGE" == final && "$PREVIOUS_SHA" != none ]]; then
  rollback_compatible_with="$PREVIOUS_SHA"
else
  rollback_compatible_with=""
fi

api_digest="$(aws ecr describe-images --repository-name teameet-alpha-v1-api --image-ids "imageTag=${IMAGE_TAG}" --query 'imageDetails[0].imageDigest' --output text)"
web_digest="$(aws ecr describe-images --repository-name teameet-alpha-v1-web --image-ids "imageTag=${IMAGE_TAG}" --query 'imageDetails[0].imageDigest' --output text)"
manifest="/tmp/teameet-alpha-${RELEASE_SHA}.json"; manifest_key="manifests/${RELEASE_SHA}.json"
if manifest_version_id="$(aws s3api head-object --bucket "$DEPLOY_BUCKET" --key "$manifest_key" --expected-bucket-owner "$EXPECTED_BUCKET_OWNER" --query VersionId --output text 2>/dev/null)"; then
  aws s3api get-object --bucket "$DEPLOY_BUCKET" --key "$manifest_key" --version-id "$manifest_version_id" --expected-bucket-owner "$EXPECTED_BUCKET_OWNER" "$manifest" >/dev/null
  validate_existing_manifest "$manifest"
else
  created_at="$(git show -s --format=%cI "$RELEASE_SHA")"
  jq -n --arg sha "$RELEASE_SHA" --arg version "$RELEASE_VERSION" --arg createdAt "$created_at" --arg bucket "$DEPLOY_BUCKET" --arg sourceVersionId "$SOURCE_VERSION_ID" --arg sourceSha256 "$SOURCE_SHA256" --arg migrationBase "$MIGRATION_BASE_SHA" --arg rollbackCompatible "$rollback_compatible_with" --arg registry "$REGISTRY" --arg apiDigest "$api_digest" --arg webDigest "$web_digest" --arg schema "$TASK168_SCHEMA_SHA256" --arg m11 "$TASK168_M11_SHA256" '{schemaVersion:1,environment:"alpha",release:{sha:$sha,version:$version,createdAt:$createdAt},source:{bucket:$bucket,key:("releases/"+$sha+".tar.gz"),versionId:$sourceVersionId,sha256:$sourceSha256},database:{migrationPolicy:"task168-final",rollbackMode:"final-only",compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:(if $migrationBase=="none" then null else $migrationBase end),rollbackCompatibleWith:(if $rollbackCompatible=="" then null else $rollbackCompatible end),task168:{stage:"final",schemaSha256:$schema,runtimeClientSchemaSha256:$schema,m11Sha256:$m11}},images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:$apiDigest,uri:($registry+"/teameet-alpha-v1-api@"+$apiDigest)},web:{repository:($registry+"/teameet-alpha-v1-web"),digest:$webDigest,uri:($registry+"/teameet-alpha-v1-web@"+$webDigest)}}}' > "$manifest"
  manifest_version_id="$(aws s3api put-object --bucket "$DEPLOY_BUCKET" --key "$manifest_key" --body "$manifest" --content-type application/json --if-none-match '*' --expected-bucket-owner "$EXPECTED_BUCKET_OWNER" --query VersionId --output text)"
fi
[[ "$manifest_version_id" =~ ^[A-Za-z0-9._+=/-]{1,1024}$ ]]
echo "manifestSha256=$(sha256sum "$manifest" | awk '{print $1}')" >> "$GITHUB_OUTPUT"
echo "manifestVersionId=$manifest_version_id" >> "$GITHUB_OUTPUT"
echo "apiDigest=$api_digest" >> "$GITHUB_OUTPUT"
echo "webDigest=$web_digest" >> "$GITHUB_OUTPUT"

#!/usr/bin/env bash

# Task 168 StageB wrapper (m11-stageb-spec.md §6.2; .task168-stageb-a2-contract.md
# §7/§8). Owns everything the frozen runner CLI (deploy/task168-stage-b-migrate.sh,
# §3) deliberately does not: locking, manifest validation, source staging,
# image pull/attestation, and — for stageBFinal only — invoking the runner and
# judging its result strictly by migration-stage.json, never by exit code alone.
#
# stageBFinal deliberately STOPS once the runner reports MIGRATION_COMMITTED.
# Whether to continue automatically (activate the final runtime, run T7, and
# promote) is U2 — undecided — so no such branch exists here yet ("post-commit
# start pending U2"). Re-dispatching stageBFinal for an already-committed
# release is refused by the runner itself (§3, "final retirement receipt
# already exists"); continuing from MIGRATION_COMMITTED is out of scope for
# this PR and will be a separate `stageBResume` entry point once U2 is decided.
#
# stageBPreflight invokes the isolated, non-destructive rehearsal
# (scripts/release/task168-final-image-preflight.sh, T5/T2 — a different
# track's deliverable whose CLI contract m11-stageb-spec.md's T2 item marks as
# still changing, `--backup` -> `--fresh-pre-m11-backup`). This wrapper calls
# it with the CURRENT candidate CLI and fails closed with a clear diagnostic
# if that script or its T2 fresh-backup input is not yet present, rather than
# guessing at an interface known to be mid-revision.

set -Eeuo pipefail

: "${TASK168_STAGE:?TASK168_STAGE is required}"

case "${TASK168_STAGE}" in
  stageBPreflight|stageBFinal|stageBRecover) ;;
  *)
    echo "[deploy-alpha-stage-b] Unknown TASK168_STAGE: '${TASK168_STAGE}'" >&2
    exit 1
    ;;
esac

ALPHA_HOME_DIR="${ALPHA_HOME_DIR:-/home/ec2-user}"
ALPHA_LIVE_DIR="${ALPHA_LIVE_DIR:-${ALPHA_HOME_DIR}/teameet}"
STATE_ROOT="${ALPHA_RELEASE_STATE_DIR:-${ALPHA_HOME_DIR}/.teameet-alpha-releases}/task168"
readonly TASK168_STAGE_LABEL_PREFIX="com.teameet.task168.stage-b"
readonly TASK168_FINAL_SCHEMA_SHA256=e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46
readonly TASK168_M11=20260911090000_retire_tournament_fixture_tables
readonly TASK168_M11_SHA256=08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323

fail() { echo "[deploy-alpha-stage-b] $*" >&2; exit 1; }

# ─── stageBRecover (§6.2-8) ──────────────────────────────────────────────────
# Entirely read-only judgment plus, at most, restoring the exact pre-quiesce
# writer (R-B) or writing a status-accurate receipt (R-A). Never re-runs the
# migrate script, never activates a source, never composes up the final
# runtime.
if [[ "${TASK168_STAGE}" == stageBRecover ]]; then
  : "${ALPHA_SHA:?ALPHA_SHA is required}"
  [[ "${ALPHA_SHA}" =~ ^[0-9a-f]{40}$ ]] || fail "ALPHA_SHA must be a full commit SHA"

  state_dir="${STATE_ROOT}/${ALPHA_SHA}"
  lock_path="${state_dir}/stage-b.lock"
  quiesce="${state_dir}/quiesce.json"
  migration_receipt="${state_dir}/migration-stage.json"

  compose_prod="${ALPHA_LIVE_DIR}/deploy/docker-compose.prod.yml"
  compose_alpha="${ALPHA_LIVE_DIR}/deploy/docker-compose.alpha.yml"
  env_file="${ALPHA_LIVE_DIR}/deploy/.env"
  [[ -f "${env_file}" ]] || fail "protected runtime environment file is missing"
  set -a
  # shellcheck disable=SC1090 -- protected operator-managed runtime configuration.
  source "${env_file}"
  set +a
  compose=(docker compose --project-name deploy -f "${compose_prod}" -f "${compose_alpha}" --env-file "${env_file}")
  dbq() { "${compose[@]}" exec -T v1_postgres psql -X -v ON_ERROR_STOP=1 -At \
    -U "${V1_DB_USER:-teameet_v1}" -d "${V1_DB_NAME:-teameet_v1}" -c "$1"; }

  # ① Entry preconditions — every check here is read-only. Any one failing
  # means "may still be in progress" and this function changes nothing.
  install -d -m 700 "${state_dir}"
  exec 8>"${lock_path}"
  flock -n 8 || fail "flock is held for ${ALPHA_SHA} — StageB may still be in progress; not touching anything"
  # The flock fd (8) now holds OUR OWN lock for the rest of this run, proving
  # no concurrent stage-b-migrate.sh or another recover holds it.
  labeled_containers="$(docker ps -q --filter "label=${TASK168_STAGE_LABEL_PREFIX}=${ALPHA_SHA}" | wc -l | tr -d ' ')"
  [[ "${labeled_containers}" == 0 ]] || fail "a runner container is still labeled for ${ALPHA_SHA} — not touching anything"
  advisory_locks="$(dbq "SELECT count(*) FROM pg_locks WHERE locktype='advisory'")"
  [[ "${advisory_locks}" == 0 ]] || fail "an advisory lock is held in the database — a migrate process may still be running; not touching anything"

  # ② State judgment
  m11_row="$(dbq "SELECT COALESCE(checksum,'') || '|' || CASE WHEN finished_at IS NOT NULL AND rolled_back_at IS NULL THEN 'applied' WHEN finished_at IS NULL AND rolled_back_at IS NULL THEN 'unresolved' ELSE 'other' END FROM \"_prisma_migrations\" WHERE migration_name = '${TASK168_M11}'")"

  if [[ -z "${m11_row}" ]]; then
    # R-B: M11 never applied. Restore the pre-quiesce writer if quiesce.json
    # says it was ever stopped by this release's run. Depends on the runner
    # track adding preApiContainerId/preWorkerContainerId/restartPolicyBefore
    # to quiesce.json (contract §4.1 NEW fields, D-6) — until that lands, a
    # real quiesce.json from the current candidate runner will fail the
    # jq -er lookups below and this exits with a clear diagnosis instead of
    # a wrong restore.
    [[ -f "${quiesce}" ]] || fail "no M11 row and no quiesce.json for ${ALPHA_SHA} — RECOVERY_DIAGNOSIS_REQUIRED (nothing to restore from and nothing was applied)"
    pre_api_id="$(jq -er '.preApiContainerId' "${quiesce}")" || fail "quiesce.json is missing preApiContainerId (m11-stageb-spec.md §4.1 NEW field) — cannot identify the writer to restore"
    pre_worker_id="$(jq -er '.preWorkerContainerId' "${quiesce}")" || fail "quiesce.json is missing preWorkerContainerId"
    restart_before_api="$(jq -er '.restartPolicyBefore.api' "${quiesce}")" || fail "quiesce.json is missing restartPolicyBefore.api"
    restart_before_worker="$(jq -er '.restartPolicyBefore.worker' "${quiesce}")" || fail "quiesce.json is missing restartPolicyBefore.worker"
    docker update --restart="${restart_before_api}" "${pre_api_id}" >/dev/null || fail "could not restore API restart policy"
    docker update --restart="${restart_before_worker}" "${pre_worker_id}" >/dev/null || fail "could not restore worker restart policy"
    "${compose[@]}" start v1_api v1_game_operations_worker >/dev/null || fail "could not restart the pre-quiesce writers"
    running_api="$(docker inspect --format '{{.State.Running}}' "${pre_api_id}")"
    running_worker="$(docker inspect --format '{{.State.Running}}' "${pre_worker_id}")"
    [[ "${running_api}" == true && "${running_worker}" == true ]] || fail "restored writers did not come up running"
    echo "[deploy-alpha-stage-b] R-B: pre-quiesce writers restored and running for ${ALPHA_SHA}"
    exit 0
  fi

  case "${m11_row##*|}" in
    unresolved)
      # R-C: P3009. Not auto-recoverable — a diagnosis-only receipt plus a
      # pointer to the manual `migrate resolve --rolled-back` procedure.
      jq -n --arg sha "${ALPHA_SHA}" --arg m11 "${TASK168_M11}" \
        '{schemaVersion:1,kind:"task168StageBMigration",status:"MIGRATION_DIAGNOSIS_REQUIRED",stage:"stageBFinal",releaseSha:$sha,m11:$m11,failureReason:"unresolved migration attempt (P3009 condition)",note:"manual `prisma migrate resolve --rolled-back` required; do not re-run stageBFinal until resolved",diagnosedAt:(now|todate)}' \
        > "${migration_receipt}.recover-diagnosis.json"
      echo "[deploy-alpha-stage-b] R-C: M11 has an unresolved migration attempt for ${ALPHA_SHA} — manual 'prisma migrate resolve --rolled-back' required, see ${migration_receipt}.recover-diagnosis.json" >&2
      exit 1
      ;;
    applied)
      # R-A candidate: M11 committed but the receipt never got written (kill
      # between the runner's migrate step and its own receipt write).
      [[ -f "${migration_receipt}" ]] && fail "migration-stage.json already exists for ${ALPHA_SHA} — nothing to recover"
      [[ -f "${quiesce}" ]] || fail "M11 is applied but quiesce.json is missing for ${ALPHA_SHA} — RECOVERY_DIAGNOSIS_REQUIRED"
      backup_path="$(jq -er '.backupPath' "${quiesce}")" || fail "quiesce.json is missing backupPath"
      backup_sha_expected="$(jq -er '.backupSha256' "${quiesce}")" || fail "quiesce.json is missing backupSha256"
      [[ -f "${backup_path}" ]] || fail "pre-M11 backup file is missing at ${backup_path}"
      backup_sha_actual="$(sha256sum "${backup_path}" | awk '{print $1}')"
      [[ "${backup_sha_actual}" == "${backup_sha_expected}" ]] || fail "pre-M11 backup no longer matches its quiesce receipt hash"
      # Same catalog checks the runner itself performs after M11 (§0
      # r1-6/spec §5 T4) — a subset here is enough to prove M11's DDL
      # actually landed, not merely that the ledger row exists.
      legacy_tables="$(dbq "SELECT count(*) FROM (VALUES ('v1_tournament_fixtures'),('v1_tournament_fixture_results'),('v1_tournament_fixture_goals'),('v1_tournament_fixture_videos'),('v1_tournament_fixture_advancement_edges')) x(name) WHERE to_regclass(x.name) IS NOT NULL")"
      [[ "${legacy_tables}" == 0 ]] || fail "M11 ledger row exists but legacy tables are still present — RECOVERY_DIAGNOSIS_REQUIRED (schema/ledger mismatch, do not write a recovered receipt)"
      quiesce_sha="$(sha256sum "${quiesce}" | awk '{print $1}')"
      jq -n \
        --arg sha "${ALPHA_SHA}" --arg m11 "${TASK168_M11}" --arg m11sha "${TASK168_M11_SHA256}" \
        --arg quiesceSha "${quiesce_sha}" --arg backupSha "${backup_sha_actual}" \
        '{schemaVersion:1,kind:"task168StageBMigration",status:"MIGRATION_COMMITTED_RECOVERED",stage:"stageBFinal",
          releaseSha:$sha,m11:$m11,m11Sha256:$m11sha,
          recoveredFrom:{quiesceReceiptSha256:$quiesceSha,ledgerM11Row:"applied",catalogResult:{legacyTables:0}},
          preM11BackupSha256:$backupSha,completedAt:(now|todate)}' \
        > "${migration_receipt}"
      chmod 600 "${migration_receipt}"
      echo "[deploy-alpha-stage-b] R-A: reconstructed MIGRATION_COMMITTED_RECOVERED receipt for ${ALPHA_SHA}; writer remains stopped"
      exit 0
      ;;
    *)
      fail "M11 ledger row for ${ALPHA_SHA} is neither cleanly applied nor unresolved — RECOVERY_DIAGNOSIS_REQUIRED"
      ;;
  esac
fi

# ─── stageBPreflight / stageBFinal common prefix ────────────────────────────
: "${ALPHA_SOURCE_DIR:?ALPHA_SOURCE_DIR is required}"
: "${ALPHA_MANIFEST_FILE:?ALPHA_MANIFEST_FILE is required}"
: "${ALPHA_MANIFEST_SHA256:?ALPHA_MANIFEST_SHA256 is required}"
: "${ALPHA_SHA:?ALPHA_SHA is required}"
: "${ALPHA_RELEASE_VERSION:?ALPHA_RELEASE_VERSION is required}"
: "${ALPHA_ECR_REGISTRY:?ALPHA_ECR_REGISTRY is required}"
: "${ALPHA_AWS_REGION:?ALPHA_AWS_REGION is required}"
: "${ALPHA_SOURCE_BUCKET:?ALPHA_SOURCE_BUCKET is required}"
: "${ALPHA_SOURCE_VERSION_ID:?ALPHA_SOURCE_VERSION_ID is required}"
: "${ALPHA_SOURCE_SHA256:?ALPHA_SOURCE_SHA256 is required}"
[[ "${ALPHA_SHA}" =~ ^[0-9a-f]{40}$ ]] || fail "ALPHA_SHA must be a full lowercase commit SHA"

state_dir="${STATE_ROOT}/${ALPHA_SHA}"
install -d -m 700 "${state_dir}"
lock_path="${state_dir}/stage-b.lock"
exec 8>"${lock_path}"
if ! flock -n 8; then
  fail "StageB already in progress for ${ALPHA_SHA}"
fi

for required_path in \
  "${ALPHA_SOURCE_DIR}/deploy/alpha-release-common.sh" \
  "${ALPHA_SOURCE_DIR}/deploy/alpha-manifest-common.sh" \
  "${ALPHA_SOURCE_DIR}/deploy/alpha-source-common.sh" \
  "${ALPHA_SOURCE_DIR}/deploy/task168-stage-b-migrate.sh" \
  "${ALPHA_MANIFEST_FILE}"; do
  [[ -f "${required_path}" ]] || fail "Incomplete StageB release artifact: ${required_path}"
done

# shellcheck disable=SC1091
source "${ALPHA_SOURCE_DIR}/deploy/alpha-release-common.sh"

# §6.2 step 1: manifest validation (stage-branch validator; see
# alpha-manifest-common.sh's validate_stored_alpha_manifest doc comment for
# what this does and does not prove) + source binding.
validate_stored_alpha_manifest "${ALPHA_MANIFEST_FILE}" "${ALPHA_ECR_REGISTRY}" "${ALPHA_MANIFEST_SHA256}" ||
  fail "StageB manifest failed validation"
[[ "$(jq -er '.database.task168.stage' "${ALPHA_MANIFEST_FILE}")" == stageBFinal ]] ||
  fail "manifest is not a StageB manifest (see .task168-stageb-a2-contract.md §2: dispatch-only stages still read the stageBFinal manifest)"
validate_alpha_release_source_binding "${ALPHA_MANIFEST_FILE}" || fail "source binding does not match this manifest"
load_alpha_release_manifest "${ALPHA_MANIFEST_FILE}"

# §6.2 step 1 (cont'd): stage the source WITHOUT activating it. Reuses the
# same target directory convention as StageA (ALPHA_SOURCE_RELEASES_DIR/<sha>)
# so the eventual activation step (once U2 wires it) needs no new mechanism.
prepare_alpha_release_source "${ALPHA_SOURCE_DIR}" "${ALPHA_SHA}" "${ALPHA_SOURCE_SHA256}" ||
  fail "could not stage the StageB source"
target_source_dir="${ALPHA_SOURCE_RELEASES_DIR}/${ALPHA_SHA}"

# §6.2 step 2: pull the final image and confirm its attestation before doing
# anything irreversible with it.
aws ecr get-login-password --region "${ALPHA_AWS_REGION}" |
  docker login --username AWS --password-stdin "${ALPHA_ECR_REGISTRY}" >/dev/null
docker pull "${ALPHA_API_IMAGE}" >/dev/null || fail "could not pull the final API image"
attestation="$(docker run --rm --entrypoint cat "${ALPHA_API_IMAGE}" /app/apps/v1_api/.task168-runtime-client-attestation.json)" ||
  fail "final API image has no Task168 attestation"
jq -e --arg schema "${TASK168_FINAL_SCHEMA_SHA256}" \
  '.stage == "stageBFinal" and .schemaSha256 == $schema and .generatedClient == true' \
  <<< "${attestation}" >/dev/null || fail "final API image attestation is not stageBFinal/${TASK168_FINAL_SCHEMA_SHA256}"

case "${TASK168_STAGE}" in
  stageBFinal)
    compose_prod="${ALPHA_LIVE_DIR}/deploy/docker-compose.prod.yml"
    compose_alpha="${ALPHA_LIVE_DIR}/deploy/docker-compose.alpha.yml"
    env_file="${ALPHA_LIVE_DIR}/deploy/.env"
    [[ -f "${env_file}" ]] || fail "protected runtime environment file is missing"

    # §6.2 step 3: the frozen runner CLI (§3). Success is judged ONLY by
    # migration-stage.json's status, never by this exit code alone — a
    # runner that exits 0 without writing MIGRATION_COMMITTED is still a
    # failure here.
    bash "${target_source_dir}/deploy/task168-stage-b-migrate.sh" \
      --source-dir "${target_source_dir}" --manifest "${ALPHA_MANIFEST_FILE}" \
      --compose-prod "${compose_prod}" --compose-alpha "${compose_alpha}" --env-file "${env_file}"
    migration_receipt="${state_dir}/migration-stage.json"
    [[ -f "${migration_receipt}" ]] || fail "runner exited 0 but wrote no migration-stage.json"
    jq -e '.status == "MIGRATION_COMMITTED"' "${migration_receipt}" >/dev/null ||
      fail "runner did not report MIGRATION_COMMITTED — see ${migration_receipt}"

    # Deliberately stops here — see file header. No activation, no compose
    # up, no T7, no promote in this PR (post-commit start pending U2).
    echo "[deploy-alpha-stage-b] MIGRATION_COMMITTED for ${ALPHA_SHA}; writer remains stopped. Continuing to the final runtime is not wired in this release (U2 pending) — see ${migration_receipt}"
    ;;

  stageBPreflight)
    # T5/T2 integration point — see file header. Fails closed rather than
    # guessing at the currently-changing task168-final-image-preflight.sh CLI.
    preflight_script="${target_source_dir}/scripts/release/task168-final-image-preflight.sh"
    fresh_backup_script="${target_source_dir}/scripts/release/task168-stage-b-fresh-backup.sh"
    [[ -x "${fresh_backup_script}" || -f "${fresh_backup_script}" ]] ||
      fail "T2 dependency missing: scripts/release/task168-stage-b-fresh-backup.sh is not in this release's source — stageBPreflight cannot produce the fresh pre-M11 backup this rehearsal requires"
    [[ -x "${preflight_script}" || -f "${preflight_script}" ]] ||
      fail "T5 dependency missing: scripts/release/task168-final-image-preflight.sh is not in this release's source"
    fail "stageBPreflight orchestration is not wired yet: task168-final-image-preflight.sh's CLI is still changing (m11-stageb-spec.md T2 item, --backup -> --fresh-pre-m11-backup) — update this branch once that lands"
    ;;
esac

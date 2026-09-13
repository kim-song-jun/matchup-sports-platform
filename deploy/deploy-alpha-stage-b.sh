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

# Same no-clobber, self-checked write as the runner's write_json
# (deploy/task168-stage-b-migrate.sh) — a stageBRecover receipt is exactly as
# irreversible-in-effect (it is what T7/promote/a future stageBResume trust)
# and must not be left half-written by a signal landing mid-`jq -n | >`.
write_json_atomic() {
  local path="$1" validate_filter="$2" tmp
  install -d -m 700 "$(dirname "${path}")"
  tmp="$(mktemp "$(dirname "${path}")/.task168-recover.XXXXXX")" || fail "cannot create receipt temp file for ${path}"
  cat > "${tmp}"
  chmod 600 "${tmp}"
  jq -e "${validate_filter}" "${tmp}" >/dev/null || { rm -f "${tmp}"; fail "receipt failed its own schema check: ${path}"; }
  mv -n "${tmp}" "${path}"
  if [[ -e "${tmp}" ]]; then rm -f "${tmp}"; fail "receipt already exists, refusing to overwrite: ${path}"; fi
}

# Shared deploy lock (m11-stageb-spec.md §0 item "동시 실행 lock 없음";
# .task168-stageb-a2-contract.md §7). deploy-alpha.sh and rollback-alpha.sh
# both take this exact lock file. Without also taking it here, a StageA push
# deploy queued behind a still-running StageB host command (an
# UNKNOWN_HOST_MAY_BE_RUNNING GitHub Actions cancel/timeout, deploy-alpha-via-ssm.sh)
# can pass D-5 before M11 commits, activate StageA source, and compose-up
# recreates api/worker with restart:always — reviving the writers mid-backup.
# Every StageB entry point (stageBFinal, stageBRecover, and any future
# stageBResume) takes it too, so all four scripts serialize on one file.
exec 9>"${ALPHA_HOME_DIR}/.teameet-alpha-deploy.lock"
flock -n 9 || fail "another alpha deployment (StageA deploy, rollback, or another StageB run) holds the deploy lock — not touching anything"

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
  quiesce_intent="${state_dir}/quiesce-intent.json"
  migration_receipt="${state_dir}/migration-stage.json"
  m11_marker="${state_dir}/m11-entry-marker.json"

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
    # R-B: M11 never applied. Restore the pre-quiesce writer identified by
    # whichever receipt exists. quiesce.json (written after the backup
    # completes) is preferred; quiesce-intent.json (blocking finding #1/#2,
    # deploy/task168-stage-b-migrate.sh — written atomically BEFORE any
    # writer is stopped) is the fallback for a kill during the backup
    # window, when quiesce.json was never reached. Both carry the same
    # preApiContainerId/preWorkerContainerId/preApiImage/preWorkerImage/
    # restartPolicyBefore/databaseIdentity fields (contract §4.1).
    if [[ -f "${quiesce}" ]]; then
      receipt="${quiesce}"
    elif [[ -f "${quiesce_intent}" ]]; then
      receipt="${quiesce_intent}"
    else
      fail "no M11 row, no quiesce.json and no quiesce-intent.json for ${ALPHA_SHA} — RECOVERY_DIAGNOSIS_REQUIRED (nothing to restore from and nothing was applied)"
    fi
    pre_api_id="$(jq -er '.preApiContainerId' "${receipt}")" || fail "$(basename "${receipt}") is missing preApiContainerId — cannot identify the writer to restore"
    pre_worker_id="$(jq -er '.preWorkerContainerId' "${receipt}")" || fail "$(basename "${receipt}") is missing preWorkerContainerId"
    pre_api_image="$(jq -er '.preApiImage' "${receipt}")" || fail "$(basename "${receipt}") is missing preApiImage"
    pre_worker_image="$(jq -er '.preWorkerImage' "${receipt}")" || fail "$(basename "${receipt}") is missing preWorkerImage"
    restart_before_api="$(jq -er '.restartPolicyBefore.api' "${receipt}")" || fail "$(basename "${receipt}") is missing restartPolicyBefore.api"
    restart_before_worker="$(jq -er '.restartPolicyBefore.worker' "${receipt}")" || fail "$(basename "${receipt}") is missing restartPolicyBefore.worker"
    db_identity_expected="$(jq -er '.databaseIdentity' "${receipt}")" || fail "$(basename "${receipt}") is missing databaseIdentity"

    # Verify identity BEFORE mutating anything: the containers still exist
    # and still carry the exact image the receipt recorded (guards against a
    # recycled/reused container id), and the database this recover run is
    # pointed at is the one the quiesce was taken against.
    docker inspect "${pre_api_id}" >/dev/null 2>&1 || fail "the quiesced API container (${pre_api_id}) no longer exists — RECOVERY_DIAGNOSIS_REQUIRED"
    docker inspect "${pre_worker_id}" >/dev/null 2>&1 || fail "the quiesced worker container (${pre_worker_id}) no longer exists — RECOVERY_DIAGNOSIS_REQUIRED"
    [[ "$(docker inspect --format '{{.Config.Image}}' "${pre_api_id}")" == "${pre_api_image}" ]] || fail "the API container's image no longer matches the ${receipt##*/} receipt — refusing to restore a possibly-reused container id"
    [[ "$(docker inspect --format '{{.Config.Image}}' "${pre_worker_id}")" == "${pre_worker_image}" ]] || fail "the worker container's image no longer matches the ${receipt##*/} receipt — refusing to restore a possibly-reused container id"
    db_identity_actual="$(dbq "SELECT current_database() || '|' || current_user || '|' || COALESCE(inet_server_addr()::text,'local') || '|' || COALESCE(inet_server_port()::text,'local')")"
    [[ "${db_identity_actual}" == "${db_identity_expected}" ]] || fail "current database identity does not match the ${receipt##*/} receipt — refusing to restore against a possibly-different database"

    docker update --restart="${restart_before_api}" "${pre_api_id}" >/dev/null || fail "could not restore API restart policy"
    docker update --restart="${restart_before_worker}" "${pre_worker_id}" >/dev/null || fail "could not restore worker restart policy"
    # Read the policy back rather than trusting `docker update`'s exit code,
    # the same way the runner's own restore_pre_quiesce_writers does.
    [[ "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "${pre_api_id}")" == "${restart_before_api}" ]] || fail "restored API restart policy does not match the ${receipt##*/} receipt"
    [[ "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "${pre_worker_id}")" == "${restart_before_worker}" ]] || fail "restored worker restart policy does not match the ${receipt##*/} receipt"
    "${compose[@]}" start v1_api v1_game_operations_worker >/dev/null || fail "could not restart the pre-quiesce writers"
    running_api="$(docker inspect --format '{{.State.Running}}' "${pre_api_id}")"
    running_worker="$(docker inspect --format '{{.State.Running}}' "${pre_worker_id}")"
    [[ "${running_api}" == true && "${running_worker}" == true ]] || fail "restored writers did not come up running"
    echo "[deploy-alpha-stage-b] R-B: pre-quiesce writers restored and running for ${ALPHA_SHA} (from $(basename "${receipt}"))"
    exit 0
  fi

  case "${m11_row##*|}" in
    unresolved)
      # R-C: P3009. Not auto-recoverable — a diagnosis-only receipt plus a
      # pointer to the manual `migrate resolve --rolled-back` procedure.
      jq -n --arg sha "${ALPHA_SHA}" --arg m11 "${TASK168_M11}" \
        '{schemaVersion:1,kind:"task168StageBMigration",status:"MIGRATION_DIAGNOSIS_REQUIRED",stage:"stageBFinal",releaseSha:$sha,m11:$m11,failureReason:"unresolved migration attempt (P3009 condition)",note:"manual `prisma migrate resolve --rolled-back` required; do not re-run stageBFinal until resolved",diagnosedAt:(now|todate)}' \
      | write_json_atomic "${migration_receipt}.recover-diagnosis.json" \
          '.status=="MIGRATION_DIAGNOSIS_REQUIRED" and .kind=="task168StageBMigration" and (.releaseSha|strings|test("^[0-9a-f]{40}$")) and (.failureReason|strings|length>0)'
      echo "[deploy-alpha-stage-b] R-C: M11 has an unresolved migration attempt for ${ALPHA_SHA} — manual 'prisma migrate resolve --rolled-back' required, see ${migration_receipt}.recover-diagnosis.json" >&2
      exit 1
      ;;
    applied)
      # R-A candidate: M11 committed. The receipt may be entirely missing
      # (kill between the runner's migrate step and its own receipt write),
      # or it may already exist as a stale MIGRATION_DIAGNOSIS_REQUIRED
      # diagnosis: a SIGTERM landing after M11's foreground `migrate deploy`
      # finishes is deferred by bash until that child exits, so the runner's
      # own EXIT trap still sees phase=after_m11 and writes a diagnosis
      # receipt despite M11 having actually committed
      # (deploy/task168-stage-b-migrate.sh). Only a receipt that already
      # reports a committed status is truly nothing to recover; any other
      # existing receipt is a candidate to supersede once every check below
      # independently confirms the commit.
      existing_receipt_status=""
      if [[ -f "${migration_receipt}" ]]; then
        existing_receipt_status="$(jq -r '.status // empty' "${migration_receipt}" 2>/dev/null || true)"
        case "${existing_receipt_status}" in
          MIGRATION_COMMITTED|MIGRATION_COMMITTED_RECOVERED)
            fail "migration-stage.json already reports ${existing_receipt_status} for ${ALPHA_SHA} — nothing to recover" ;;
        esac
      fi
      [[ -f "${quiesce}" ]] || fail "M11 is applied but quiesce.json is missing for ${ALPHA_SHA} — RECOVERY_DIAGNOSIS_REQUIRED"
      [[ -f "${m11_marker}" ]] || fail "M11 is applied but the M11 entry marker is missing for ${ALPHA_SHA} — RECOVERY_DIAGNOSIS_REQUIRED"

      m11_checksum="${m11_row%%|*}"
      [[ "${m11_checksum}" == "${TASK168_M11_SHA256}" ]] || fail "M11 ledger row checksum does not match the expected M11 migration — RECOVERY_DIAGNOSIS_REQUIRED (schema/ledger mismatch, do not write a recovered receipt)"
      m11_row_count="$(dbq "SELECT count(*) FROM \"_prisma_migrations\" WHERE migration_name = '${TASK168_M11}'")"
      [[ "${m11_row_count}" == 1 ]] || fail "expected exactly one M11 ledger row, found ${m11_row_count} — RECOVERY_DIAGNOSIS_REQUIRED"

      # Binding to THIS run: neither the ledger checksum above nor the
      # marker cross-check further
      # down proves the M11 commit in the DB came from the SAME run this
      # ALPHA_SHA's marker describes — the M11 migration's bytes/checksum are
      # identical across every release, and the marker/quiesce/backup
      # cross-check is self-referential to this release's own directory. A
      # separate release could have applied M11 into this same database
      # after this release's run failed before_m11 and its writer was
      # restored. finished_at is a hard lower bound: it cannot predate the
      # entry marker written immediately before THIS run's `migrate deploy`.
      entered_at="$(jq -er '.enteredAt' "${m11_marker}")" || fail "M11 entry marker is missing enteredAt — RECOVERY_DIAGNOSIS_REQUIRED"
      m11_finished_after_entry="$(dbq "SELECT (finished_at >= '${entered_at}'::timestamptz)::text FROM \"_prisma_migrations\" WHERE migration_name = '${TASK168_M11}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL")"
      [[ "${m11_finished_after_entry}" == t ]] || fail "M11's finished_at predates this release's M11 entry marker — RECOVERY_DIAGNOSIS_REQUIRED (the applied M11 row may belong to a different release's run)"

      backup_path="$(jq -er '.backupPath' "${quiesce}")" || fail "quiesce.json is missing backupPath"
      backup_sha_expected="$(jq -er '.backupSha256' "${quiesce}")" || fail "quiesce.json is missing backupSha256"
      manifest_sha="$(jq -er '.manifestSha256' "${quiesce}")" || fail "quiesce.json is missing manifestSha256"
      db_identity_expected="$(jq -er '.databaseIdentity' "${quiesce}")" || fail "quiesce.json is missing databaseIdentity"
      api_image="$(jq -er '.apiImage' "${quiesce}")" || fail "quiesce.json is missing apiImage"
      [[ -f "${backup_path}" ]] || fail "pre-M11 backup file is missing at ${backup_path}"
      backup_sha_actual="$(sha256sum "${backup_path}" | awk '{print $1}')"
      [[ "${backup_sha_actual}" == "${backup_sha_expected}" ]] || fail "pre-M11 backup no longer matches its quiesce receipt hash"

      db_identity_actual="$(dbq "SELECT current_database() || '|' || current_user || '|' || COALESCE(inet_server_addr()::text,'local') || '|' || COALESCE(inet_server_port()::text,'local')")"
      [[ "${db_identity_actual}" == "${db_identity_expected}" ]] || fail "current database identity does not match the quiesce receipt — RECOVERY_DIAGNOSIS_REQUIRED"

      # Cross-check the M11 entry marker (deploy/task168-stage-b-migrate.sh,
      # written right before M11 runs) against what is actually on disk now
      # — proves this quiesce.json/backup are the SAME ones the migrate run
      # that entered M11 actually used, not a stale or swapped-in pair.
      quiesce_sha="$(sha256sum "${quiesce}" | awk '{print $1}')"
      marker_quiesce_sha="$(jq -er '.quiesceReceiptSha256' "${m11_marker}")" || fail "M11 entry marker is missing quiesceReceiptSha256"
      marker_backup_sha="$(jq -er '.preM11BackupSha256' "${m11_marker}")" || fail "M11 entry marker is missing preM11BackupSha256"
      [[ "${marker_quiesce_sha}" == "${quiesce_sha}" ]] || fail "M11 entry marker's quiesce receipt hash does not match the current quiesce.json — RECOVERY_DIAGNOSIS_REQUIRED"
      [[ "${marker_backup_sha}" == "${backup_sha_actual}" ]] || fail "M11 entry marker's backup hash does not match the current pre-M11 backup — RECOVERY_DIAGNOSIS_REQUIRED"

      # Same post-M11 catalog checks the runner itself performs
      # (deploy/task168-stage-b-migrate.sh, r1-6 fix) — enough to prove M11's
      # DDL and its guards actually landed, not merely that the ledger row
      # exists.
      legacy_tables="$(dbq "SELECT count(*) FROM (VALUES ('v1_tournament_fixtures'),('v1_tournament_fixture_results'),('v1_tournament_fixture_goals'),('v1_tournament_fixture_videos'),('v1_tournament_fixture_advancement_edges')) x(name) WHERE to_regclass(x.name) IS NOT NULL")"
      [[ "${legacy_tables}" == 0 ]] || fail "M11 ledger row exists but legacy tables are still present — RECOVERY_DIAGNOSIS_REQUIRED (schema/ledger mismatch, do not write a recovered receipt)"
      legacy_link_columns="$(dbq "SELECT count(*) FROM (VALUES ('tournament_fixture_id'),('fixture_id')) x(name) WHERE EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.column_name=x.name AND c.table_name IN ('v1_games','v1_tournament_staff_fixture_scopes','v1_operation_audits'))")"
      [[ "${legacy_link_columns}" == 0 ]] || fail "M11 ledger row exists but legacy link columns are still present — RECOVERY_DIAGNOSIS_REQUIRED"
      retirement_functions="$(dbq "SELECT count(*) FROM pg_proc WHERE proname IN ('v1_reject_retired_tournament_fixture_write','v1_reject_retired_tournament_fixture_link')")"
      [[ "${retirement_functions}" == 0 ]] || fail "M11 ledger row exists but retirement functions are still present — RECOVERY_DIAGNOSIS_REQUIRED"
      retirement_triggers="$(dbq "SELECT count(*) FROM pg_trigger WHERE tgname IN ('v1_tournament_fixture_retired_write','v1_tournament_fixture_retired_row_write','v1_000_tournament_fixture_retired_link')")"
      [[ "${retirement_triggers}" == 0 ]] || fail "M11 ledger row exists but retirement triggers are still present — RECOVERY_DIAGNOSIS_REQUIRED"

      # Additional post-M11 checks the runner performs
      # (deploy/task168-stage-b-migrate.sh) that the four checks above did
      # not cover — the lineage-reparent guard trigger, the two CHECK constraints M11
      # re-adds, the audit constraint it drops outright, the three guard
      # functions it CREATE OR REPLACEs (signature, not just name), the
      # retired enum types, and the outbox PROCESSING invariant. Re-running
      # these closes the gap where R-A previously certified a genuinely
      # broken post-M11 catalog as recovered.
      lineage_trigger="$(dbq "SELECT count(*) FROM pg_trigger t WHERE t.tgname='v1_block_tournament_result_lineage_game_reparent' AND t.tgfoid=to_regprocedure('v1_block_tournament_result_lineage_game_reparent()') AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal AND t.tgrelid='v1_games'::regclass")"
      [[ "${lineage_trigger}" == 1 ]] || fail "M11 ledger row exists but the canonical lineage trigger is missing — RECOVERY_DIAGNOSIS_REQUIRED"
      games_guard_ck="$(dbq "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='v1_games_canonical_source_guard_ck'")"
      [[ "${games_guard_ck}" == "CHECK ((((source_type)::text = 'TEAM_MATCH'::text) AND (team_match_id IS NOT NULL)))" ]] || fail "M11 ledger row exists but the games canonical source guard constraint is missing or changed — RECOVERY_DIAGNOSIS_REQUIRED"
      staff_scope_guard_ck="$(dbq "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='v1_staff_scope_canonical_source_guard_ck'")"
      [[ "${staff_scope_guard_ck}" == "CHECK (((team_match_id IS NOT NULL) AND (tournament_id IS NOT NULL)))" ]] || fail "M11 ledger row exists but the staff scope canonical source guard constraint is missing or changed — RECOVERY_DIAGNOSIS_REQUIRED"
      dropped_audit_ck="$(dbq "SELECT count(*) FROM pg_constraint WHERE conname='v1_operation_audits_canonical_source_guard_ck'")"
      [[ "${dropped_audit_ck}" == 0 ]] || fail "M11 ledger row exists but the legacy audit canonical-source guard constraint remains — RECOVERY_DIAGNOSIS_REQUIRED"
      guard_fn_resolve="$(dbq "SELECT count(*) FROM pg_proc p WHERE p.proname='v1_resolve_canonical_guard_game' AND pg_get_function_result(p.oid)='TABLE(team_match_id text, semantic_tournament_id text, home_team_id text, away_team_id text)'")"
      [[ "${guard_fn_resolve}" == 1 ]] || fail "M11 ledger row exists but v1_resolve_canonical_guard_game is missing or its signature changed — RECOVERY_DIAGNOSIS_REQUIRED"
      guard_fn_staff="$(dbq "SELECT count(*) FROM pg_proc p WHERE p.proname='v1_guard_staff_fixture_scope' AND pg_get_function_result(p.oid)='trigger'")"
      [[ "${guard_fn_staff}" == 1 ]] || fail "M11 ledger row exists but v1_guard_staff_fixture_scope is missing or its signature changed — RECOVERY_DIAGNOSIS_REQUIRED"
      guard_fn_lineage="$(dbq "SELECT count(*) FROM pg_proc p WHERE p.proname='v1_guard_tournament_result_lineage_insert' AND pg_get_function_result(p.oid)='trigger'")"
      [[ "${guard_fn_lineage}" == 1 ]] || fail "M11 ledger row exists but v1_guard_tournament_result_lineage_insert is missing or its signature changed — RECOVERY_DIAGNOSIS_REQUIRED"
      retired_enums="$(dbq "SELECT count(*) FROM pg_type WHERE typname IN ('V1TournamentGoalTeam','V1TournamentFixtureStatus')")"
      [[ "${retired_enums}" == 0 ]] || fail "M11 ledger row exists but retired enum types remain — RECOVERY_DIAGNOSIS_REQUIRED"
      processing_outbox="$(dbq "SELECT count(*) FROM v1_outbox_events WHERE status::text='PROCESSING'")"
      [[ "${processing_outbox}" == 0 ]] || fail "M11 ledger row exists but processing outbox rows remain — RECOVERY_DIAGNOSIS_REQUIRED"

      # Preserve a stale diagnosis under a distinct path before writing the
      # recovered receipt to the canonical one — alpha-release-common.sh and
      # task168-stage-b-post-live-verify.sh both read migration-stage.json,
      # so the corrected status must land there, never be silently dropped.
      # `mv -n` + an existence check, not a plain `mv`, so a second recovery
      # attempt cannot silently clobber an earlier .superseded.json.
      if [[ -n "${existing_receipt_status}" ]]; then
        mv -n "${migration_receipt}" "${migration_receipt}.superseded.json"
        [[ -e "${migration_receipt}" ]] && fail "a .superseded.json for ${ALPHA_SHA} already exists — refusing to overwrite an earlier superseded receipt"
      fi

      # `select(length>0)` inside a jq object-construction value is a
      # generator: when $supersededStatus is empty (the ordinary R-A case
      # with no stale diagnosis to supersede), it produces ZERO outputs, and
      # jq's object construction with a zero-output value filter produces
      # ZERO objects for the whole `jq -n` call — not `null`, no error, exit
      # 0, and an EMPTY receipt file (confirmed by running the exact filter
      # standalone). Every ordinary R-A recovery
      # was silently writing a 0-byte migration-stage.json. Fixed with an
      # if/then/else that always produces exactly one value, and by routing
      # through write_json_atomic so a mistake like this fails the receipt's
      # own schema check instead of writing an empty file.
      jq -n \
        --arg sha "${ALPHA_SHA}" --arg apiImage "${api_image}" --arg dbId "${db_identity_actual}" \
        --arg schemaSha "${TASK168_FINAL_SCHEMA_SHA256}" --arg manifestSha "${manifest_sha}" \
        --arg m11 "${TASK168_M11}" --arg m11sha "${TASK168_M11_SHA256}" \
        --arg quiesceSha "${quiesce_sha}" --arg backupSha "${backup_sha_actual}" \
        --arg supersededStatus "${existing_receipt_status}" \
        --argjson legacyTables "${legacy_tables}" --argjson legacyLinkColumns "${legacy_link_columns}" \
        --argjson retirementTriggers "${retirement_triggers}" --argjson retirementFunctions "${retirement_functions}" \
        --argjson lineageTrigger "${lineage_trigger}" --argjson retiredEnums "${retired_enums}" \
        --argjson processingOutbox "${processing_outbox}" \
        '{schemaVersion:1,kind:"task168StageBMigration",status:"MIGRATION_COMMITTED_RECOVERED",stage:"stageBFinal",
          releaseSha:$sha,apiImage:$apiImage,databaseIdentity:$dbId,schemaSha256:$schemaSha,manifestSha256:$manifestSha,
          m11:$m11,m11Sha256:$m11sha,
          postVerification:{legacyTables:$legacyTables,legacyLinkColumns:$legacyLinkColumns,retirementTriggers:$retirementTriggers,retirementFunctions:$retirementFunctions,lineageTrigger:$lineageTrigger,retiredEnums:$retiredEnums,processingOutbox:$processingOutbox},
          recoveredFrom:{quiesceReceiptSha256:$quiesceSha,ledgerM11Row:"applied",catalogResult:{legacyTables:$legacyTables,legacyLinkColumns:$legacyLinkColumns,retirementTriggers:$retirementTriggers,retirementFunctions:$retirementFunctions},supersededDiagnosisStatus:(if ($supersededStatus|length)>0 then $supersededStatus else null end)},
          preM11BackupSha256:$backupSha,completedAt:(now|todate)}' \
      | write_json_atomic "${migration_receipt}" \
          '.status=="MIGRATION_COMMITTED_RECOVERED" and .kind=="task168StageBMigration" and .stage=="stageBFinal" and (.releaseSha|strings|test("^[0-9a-f]{40}$")) and .m11Sha256=="'"${TASK168_M11_SHA256}"'" and (.preM11BackupSha256|strings|test("^[0-9a-f]{64}$")) and .postVerification.legacyTables==0 and .postVerification.retiredEnums==0 and .postVerification.processingOutbox==0'
      if [[ -n "${existing_receipt_status}" ]]; then
        echo "[deploy-alpha-stage-b] R-A: superseded a stale ${existing_receipt_status} receipt (see ${migration_receipt}.superseded.json) and reconstructed MIGRATION_COMMITTED_RECOVERED for ${ALPHA_SHA}; writer remains stopped"
      else
        echo "[deploy-alpha-stage-b] R-A: reconstructed MIGRATION_COMMITTED_RECOVERED receipt for ${ALPHA_SHA}; writer remains stopped"
      fi
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

#!/usr/bin/env bash

# Task 168 StageB wrapper (docs/ops/task168-stage-b-runbook.md). Owns
# everything the frozen runner CLI (deploy/task168-stage-b-migrate.sh)
# deliberately does not: locking, manifest validation, source staging,
# image pull/attestation, and — for stageBFinal only — invoking the runner and
# judging its result strictly by migration-stage.json, never by exit code alone.
#
# stageBFinal continues automatically once the runner reports
# MIGRATION_COMMITTED (U2 = continue automatically): it activates the final
# release source, brings up the final runtime, restores each writer's
# restart policy from quiesce.json (never hardcoded), and runs T7
# (scripts/release/task168-stage-b-post-live-verify.sh) before promoting.
# A failure anywhere in that sequence NEVER restores predecessor images —
# M11 already committed, so the database is irreversibly post-M11 — it
# writes an activation-stage.json diagnosis receipt naming the failed step
# and leaves the runtime exactly as the failure left it. Re-dispatching
# stageBFinal for an already-committed release is refused by the runner
# itself (§3, "final retirement receipt already exists"); retrying a failed
# activation is a documented manual procedure
# (docs/ops/task168-stage-b-runbook.md), not an automated entry point —
# stageBRecover's R-A/R-B judgments are unchanged and still refuse to touch
# a release once migration-stage.json exists.
#
# No isolated T5/T2 rehearsal is wired into this pipeline (2026-09-14:
# user-directed Alpha run without one — see manifest database.task168.rehearsal
# and the runner's own waiver gate, deploy/task168-stage-b-migrate.sh). Only
# stageBFinal and stageBRecover are dispatchable entry points.

set -Eeuo pipefail

: "${TASK168_STAGE:?TASK168_STAGE is required}"

case "${TASK168_STAGE}" in
  stageBFinal|stageBRecover) ;;
  *)
    echo "[deploy-alpha-stage-b] Unknown TASK168_STAGE: '${TASK168_STAGE}'" >&2
    exit 1
    ;;
esac

ALPHA_HOME_DIR="${ALPHA_HOME_DIR:-/home/ec2-user}"
ALPHA_LIVE_DIR="${ALPHA_LIVE_DIR:-${ALPHA_HOME_DIR}/teameet}"
STATE_ROOT="${ALPHA_RELEASE_STATE_DIR:-${ALPHA_HOME_DIR}/.teameet-alpha-releases}/task168"
readonly TASK168_STAGE_LABEL_PREFIX="com.teameet.task168.stage-b"

fail() { echo "[deploy-alpha-stage-b] $*" >&2; exit 1; }

# Provides TASK168_M11/TASK168_M11_SHA256/TASK168_FINAL_SCHEMA_SHA256 plus the
# ledger/catalog verification functions (post_m11_catalog_violation,
# assert_resolved_attempts, assert_full_ledger, ledger_rows,
# ledger_assert_exact, assert_prisma_migrate_status_clean) that R-A below
# shares with the runner (deploy/task168-stage-b-migrate.sh) — see that file
# for why: a post-M11 check the runner would refuse on must never be
# independently re-implemented (and drift) here.
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/task168-migration-contract.sh"

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

# Shared deploy lock. deploy-alpha.sh and rollback-alpha.sh
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
    # completes) is preferred; quiesce-intent.json (deploy/task168-stage-b-migrate.sh
    # — written atomically BEFORE any writer is stopped) is the fallback for
    # a kill during the backup window, when quiesce.json was never reached.
    # Both carry the same
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

    # The absence of an M11 ledger row is not by itself proof the database is
    # still pre-M11 -- it only proves Prisma's own bookkeeping has no record
    # of M11. Confirm the physical schema M11 would have dropped is still
    # there (legacy_tables_present_count, shared with the runner's own
    # pre-M11 preflight) before reviving a predecessor-image writer against
    # it; a writer built for the pre-M11 schema run against anything else
    # would fail unpredictably instead of cleanly.
    [[ "$(legacy_tables_present_count)" == 5 ]] || fail "M11's retired tables are not fully present even though no M11 ledger row exists — the database may not actually be pre-M11 — RECOVERY_DIAGNOSIS_REQUIRED (not restoring a writer against an uncertain schema state)"

    # An untrappable SIGKILL landing after the runner writes the M11 entry
    # marker (task168-stage-b-migrate.sh) but before M11 actually commits
    # bypasses the runner's own EXIT trap entirely, so the marker is never
    # retired to *.aborted the way a caught signal in that same window would
    # be. Left ENTERED, it would let THIS release's own stageBRecover run
    # falsely "recover" a later, unrelated release's M11 commit on the same
    # database (borrowing this release's self-consistent quiesce/backup as
    # if they were that commit's). Retire it before mutating any container,
    # and refuse rather than proceed if that cannot be done durably.
    if [[ -f "${m11_marker}" ]]; then
      mv -n "${m11_marker}" "${m11_marker}.aborted" || fail "could not retire the M11 entry marker for ${ALPHA_SHA} before restoring pre-quiesce writers — not touching anything"
      [[ ! -e "${m11_marker}" ]] || fail "M11 entry marker still exists after the retirement rename for ${ALPHA_SHA} — refusing to restore pre-quiesce writers with a live marker in place"
    fi

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
      # R-A candidate: M11 committed. The receipt may be entirely missing —
      # the runner's EXIT trap (task168-stage-b-migrate.sh cleanup_pre_quiesce)
      # writes NO receipt for exactly one case: a deferred TERM/INT/HUP that
      # lands while blocked inside the M11 migrate/status exec, with M11
      # already committed. Every other after-M11 exit — every genuine
      # post-commit check failure included — gets a real
      # MIGRATION_DIAGNOSIS_REQUIRED with a populated failureReason from that
      # same trap. So an existing receipt is never a stale placeholder to
      # reconstruct over; superseding it would convert a real failure into a
      # false _RECOVERED.
      if [[ -f "${migration_receipt}" ]]; then
        existing_receipt_status="$(jq -r '.status // "unknown"' "${migration_receipt}" 2>/dev/null || echo unknown)"
        fail "migration-stage.json already reports ${existing_receipt_status} for ${ALPHA_SHA} — refusing to touch it; if it is MIGRATION_DIAGNOSIS_REQUIRED, see its failureReason and resolve manually before re-attempting"
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
      # No `::text` cast: psql -At renders an uncast boolean via bool_out
      # ('t'/'f'), but explicitly casting a boolean expression to text invokes
      # a different function that spells out 'true'/'false' — confirmed
      # against a real postgres:16-alpine (`SELECT (now()>=now())::text` ->
      # "true", `SELECT (now()>=now())` -> "t"). The `::text` form here made
      # this comparison to the literal `t` always fail, so R-A could never
      # succeed against a real database; only the fake-docker unit test
      # (which stubs this query directly) hid it.
      m11_finished_after_entry="$(dbq "SELECT finished_at >= '${entered_at}'::timestamptz FROM \"_prisma_migrations\" WHERE migration_name = '${TASK168_M11}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL")"
      [[ "${m11_finished_after_entry}" == t ]] || fail "M11's finished_at predates this release's M11 entry marker — RECOVERY_DIAGNOSIS_REQUIRED (the applied M11 row may belong to a different release's run)"

      # The bound above is only a lower bound, and by itself does not
      # distinguish THIS release's own (never-executed) M11 attempt from a
      # DIFFERENT release's real one: if this release was killed in the
      # marker-write window (marker left ENTERED, M11 never actually run
      # under it), its writers were later revived by hand, and a later
      # release then committed M11 on the same database, that later
      # release's finished_at is -- trivially -- after this release's own
      # enteredAt too. Every other check above is self-referential to this
      # release's own state directory and cannot catch that. Refuse instead
      # of guessing whenever a sibling release's own M11 entry marker was
      # written at or after this one: that sibling, not this release, is the
      # more plausible origin of the ledger row.
      for sibling_marker in "${STATE_ROOT}"/*/m11-entry-marker.json; do
        [[ -f "${sibling_marker}" ]] || continue
        sibling_sha="$(basename "$(dirname "${sibling_marker}")")"
        [[ "${sibling_sha}" != "${ALPHA_SHA}" ]] || continue
        sibling_entered="$(jq -r '.enteredAt // empty' "${sibling_marker}" 2>/dev/null || true)"
        [[ -n "${sibling_entered}" ]] || continue
        [[ "${sibling_entered}" < "${entered_at}" ]] || fail "a sibling release (${sibling_sha}) has its own M11 entry marker at ${sibling_entered}, at or after this release's own (${entered_at}) — cannot attribute the current M11 ledger row to ${ALPHA_SHA} — RECOVERY_DIAGNOSIS_REQUIRED"
      done

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
      # The quiesce/backup hash cross-check above is self-referential to this
      # release's own state directory; it does not by itself prove the
      # marker was written by a run FOR this ALPHA_SHA against THIS manifest
      # (a copy-pasted or hand-edited marker would still pass it). Bind both
      # directly.
      marker_release_sha="$(jq -er '.releaseSha' "${m11_marker}")" || fail "M11 entry marker is missing releaseSha"
      [[ "${marker_release_sha}" == "${ALPHA_SHA}" ]] || fail "M11 entry marker's releaseSha does not match ${ALPHA_SHA} — RECOVERY_DIAGNOSIS_REQUIRED"
      marker_manifest_sha="$(jq -er '.manifestSha256' "${m11_marker}")" || fail "M11 entry marker is missing manifestSha256"
      [[ "${marker_manifest_sha}" == "${manifest_sha}" ]] || fail "M11 entry marker's manifestSha256 does not match quiesce.json's manifestSha256 — RECOVERY_DIAGNOSIS_REQUIRED"

      # The quiesced writers must still be exactly as the runner left them.
      # If either has been restarted (a compose up outside the deploy lock,
      # or a daemon/host restart before the runner's own D-6 `restart=no`
      # took effect) it may already have written to the post-M11 database —
      # something none of the ledger/catalog checks here would catch, since
      # they only prove M11's own DDL landed, not that nothing wrote through
      # a revived writer afterward.
      pre_api_id="$(jq -er '.preApiContainerId' "${quiesce}")" || fail "quiesce.json is missing preApiContainerId"
      pre_worker_id="$(jq -er '.preWorkerContainerId' "${quiesce}")" || fail "quiesce.json is missing preWorkerContainerId"
      docker inspect "${pre_api_id}" >/dev/null 2>&1 || fail "the quiesced API container (${pre_api_id}) no longer exists — RECOVERY_DIAGNOSIS_REQUIRED"
      docker inspect "${pre_worker_id}" >/dev/null 2>&1 || fail "the quiesced worker container (${pre_worker_id}) no longer exists — RECOVERY_DIAGNOSIS_REQUIRED"
      [[ "$(docker inspect --format '{{.State.Running}}' "${pre_api_id}")" == false ]] || fail "the quiesced API container is running — RECOVERY_DIAGNOSIS_REQUIRED (it may have written to the post-M11 database)"
      [[ "$(docker inspect --format '{{.State.Running}}' "${pre_worker_id}")" == false ]] || fail "the quiesced worker container is running — RECOVERY_DIAGNOSIS_REQUIRED (it may have written to the post-M11 database)"
      [[ "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "${pre_api_id}")" == no ]] || fail "the quiesced API container's restart policy is not 'no' — RECOVERY_DIAGNOSIS_REQUIRED"
      [[ "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "${pre_worker_id}")" == no ]] || fail "the quiesced worker container's restart policy is not 'no' — RECOVERY_DIAGNOSIS_REQUIRED"

      # Same post-M11 catalog checks the runner itself performs — enough to
      # prove M11's DDL and its guards actually landed, not merely that the
      # ledger row exists. Preserves this branch's own message wording (kept
      # distinct from the runner's terser messages so existing operators and
      # tests are not retargeted) via the violation code the shared check
      # returns.
      catalog_violation="$(post_m11_catalog_violation)" || case "${catalog_violation}" in
        legacy_tables) fail "M11 ledger row exists but legacy tables are still present — RECOVERY_DIAGNOSIS_REQUIRED (schema/ledger mismatch, do not write a recovered receipt)" ;;
        legacy_link_columns) fail "M11 ledger row exists but legacy link columns are still present — RECOVERY_DIAGNOSIS_REQUIRED" ;;
        retirement_functions) fail "M11 ledger row exists but retirement functions are still present — RECOVERY_DIAGNOSIS_REQUIRED" ;;
        retirement_triggers) fail "M11 ledger row exists but retirement triggers are still present — RECOVERY_DIAGNOSIS_REQUIRED" ;;
        lineage_trigger) fail "M11 ledger row exists but the canonical lineage trigger is missing — RECOVERY_DIAGNOSIS_REQUIRED" ;;
        games_guard_ck) fail "M11 ledger row exists but the games canonical source guard constraint is missing or changed — RECOVERY_DIAGNOSIS_REQUIRED" ;;
        staff_guard_ck) fail "M11 ledger row exists but the staff scope canonical source guard constraint is missing or changed — RECOVERY_DIAGNOSIS_REQUIRED" ;;
        audit_guard_ck) fail "M11 ledger row exists but the legacy audit canonical-source guard constraint remains — RECOVERY_DIAGNOSIS_REQUIRED" ;;
        guard_fn_resolve) fail "M11 ledger row exists but v1_resolve_canonical_guard_game is missing or its signature changed — RECOVERY_DIAGNOSIS_REQUIRED" ;;
        guard_fn_staff) fail "M11 ledger row exists but v1_guard_staff_fixture_scope is missing or its signature changed — RECOVERY_DIAGNOSIS_REQUIRED" ;;
        guard_fn_lineage) fail "M11 ledger row exists but v1_guard_tournament_result_lineage_insert is missing or its signature changed — RECOVERY_DIAGNOSIS_REQUIRED" ;;
        retired_enums) fail "M11 ledger row exists but retired enum types remain — RECOVERY_DIAGNOSIS_REQUIRED" ;;
        processing_outbox) fail "M11 ledger row exists but processing outbox rows remain — RECOVERY_DIAGNOSIS_REQUIRED" ;;
        *) fail "M11 ledger row exists but an unknown post-M11 catalog violation was found (${catalog_violation}) — RECOVERY_DIAGNOSIS_REQUIRED" ;;
      esac

      # The runner's own post-M11 ledger and `prisma migrate status` checks
      # (task168-migration-contract.sh, sourced above — the SAME functions
      # the runner calls, not a second copy that can drift) must all still
      # pass: the ledger holds exactly M1-M11 with the manifest's checksums,
      # no unresolved/unclassified migration attempt exists, and migrate
      # status reports no drift against the pinned final image. A kill can
      # leave M11 committed but a genuine ledger or schema problem uncaught
      # by the catalog check above and the narrower marker/backup bindings
      # earlier -- those only prove specific invariants and this run's own
      # artifacts are self-consistent, not that the full migration history
      # landed cleanly.
      manifest_copy="${state_dir}/manifest.json"
      [[ -f "${manifest_copy}" ]] || fail "M11 is applied but the manifest copy is missing for ${ALPHA_SHA} — RECOVERY_DIAGNOSIS_REQUIRED"
      [[ "$(sha256sum "${manifest_copy}" | awk '{print $1}')" == "${manifest_sha}" ]] || fail "manifest copy no longer matches the quiesce receipt's manifestSha256 — RECOVERY_DIAGNOSIS_REQUIRED"
      MANIFEST="${manifest_copy}"
      RESOLVED_ATTEMPTS_SHA="$(jq -er '.database.task168.resolvedMigrationAttemptsSha256' "${MANIFEST}")" || fail "manifest copy is missing resolvedMigrationAttemptsSha256 — RECOVERY_DIAGNOSIS_REQUIRED"
      FULL_MIGRATION_HISTORY="$(jq -cer '.database.task168.fullMigrationHistory' "${MANIFEST}")" || fail "manifest copy is missing fullMigrationHistory — RECOVERY_DIAGNOSIS_REQUIRED"
      assert_resolved_attempts
      assert_full_ledger true
      ledger_after="$(ledger_rows)"
      ledger_assert_exact 11 "${ledger_after}" "${M1[@]}" "${M8}" "${M9}" "${M10}" "${M11}"

      frozen_source_dir="${state_dir}/frozen-source"
      [[ -d "${frozen_source_dir}" && -f "${frozen_source_dir}/schema.prisma" && -f "${frozen_source_dir}/migrations/migration_lock.toml" ]] \
        || fail "M11 is applied but the frozen migration source is missing for ${ALPHA_SHA} — RECOVERY_DIAGNOSIS_REQUIRED (cannot verify prisma migrate status without it)"
      [[ "${api_image}" =~ @sha256:[0-9a-f]{64}$ ]] || fail "quiesce.json's apiImage is not an immutable digest reference — RECOVERY_DIAGNOSIS_REQUIRED"
      jq -e --arg api "${api_image}" '.services.v1_api.image == $api' <<<"$("${compose[@]}" config --format json)" >/dev/null \
        || fail "the running compose config's v1_api image does not match the pinned final image — RECOVERY_DIAGNOSIS_REQUIRED (activate the correct release before retrying recovery)"
      assert_prisma_migrate_status_clean "${frozen_source_dir}"

      # No existing-receipt case reaches here (fails closed above), and every
      # postVerification/catalogResult field is hardcoded 0 because
      # post_m11_catalog_violation above already proved each one is 0 --
      # re-threading the individual counts through would only reintroduce the
      # duplicated-query surface this consolidation removes.
      jq -n \
        --arg sha "${ALPHA_SHA}" --arg apiImage "${api_image}" --arg dbId "${db_identity_actual}" \
        --arg schemaSha "${TASK168_FINAL_SCHEMA_SHA256}" --arg manifestSha "${manifest_sha}" \
        --arg m11 "${TASK168_M11}" --arg m11sha "${TASK168_M11_SHA256}" \
        --arg quiesceSha "${quiesce_sha}" --arg backupSha "${backup_sha_actual}" \
        '{schemaVersion:1,kind:"task168StageBMigration",status:"MIGRATION_COMMITTED_RECOVERED",stage:"stageBFinal",
          releaseSha:$sha,apiImage:$apiImage,databaseIdentity:$dbId,schemaSha256:$schemaSha,manifestSha256:$manifestSha,
          m11:$m11,m11Sha256:$m11sha,
          postVerification:{legacyTables:0,legacyLinkColumns:0,retirementTriggers:0,retirementFunctions:0,lineageTrigger:1,retiredEnums:0,processingOutbox:0},
          recoveredFrom:{quiesceReceiptSha256:$quiesceSha,ledgerM11Row:"applied",catalogResult:{legacyTables:0,legacyLinkColumns:0,retirementTriggers:0,retirementFunctions:0}},
          preM11BackupSha256:$backupSha,completedAt:(now|todate)}' \
      | write_json_atomic "${migration_receipt}" \
          '.status=="MIGRATION_COMMITTED_RECOVERED" and .kind=="task168StageBMigration" and .stage=="stageBFinal" and (.releaseSha|strings|test("^[0-9a-f]{40}$")) and .m11Sha256=="'"${TASK168_M11_SHA256}"'" and (.preM11BackupSha256|strings|test("^[0-9a-f]{64}$")) and .postVerification.legacyTables==0 and .postVerification.retiredEnums==0 and .postVerification.processingOutbox==0'
      echo "[deploy-alpha-stage-b] R-A: reconstructed MIGRATION_COMMITTED_RECOVERED receipt for ${ALPHA_SHA}; writer remains stopped"
      exit 0
      ;;
    *)
      fail "M11 ledger row for ${ALPHA_SHA} is neither cleanly applied nor unresolved — RECOVERY_DIAGNOSIS_REQUIRED"
      ;;
  esac
fi

# ─── stageBFinal ─────────────────────────────────────────────────────────────
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
  fail "manifest is not a StageB manifest"
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

# Only stageBFinal reaches here — stageBRecover already exited above, and
# the case statement near the top of this file refuses every other value.
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
    echo "[deploy-alpha-stage-b] MIGRATION_COMMITTED for ${ALPHA_SHA}; continuing to final runtime activation"

    # §6.2 step 4 (U2 = continue automatically): activate the final release
    # and bring up the final runtime. The database is irreversibly post-M11
    # from this point on, so ANY failure below writes a diagnosis receipt
    # naming the failed step and exits non-zero WITHOUT ever restoring
    # predecessor images — there is no rollback path once M11 has committed.
    write_activation_diagnosis() {
      local step="$1" reason="$2" payload
      # Computed into a variable (not piped) so write_json_atomic's stdin is
      # fully buffered before it runs -- a pipe here risks jq getting
      # SIGPIPE if the ERR-trap context tears down the reader early.
      payload="$(jq -n --arg sha "${ALPHA_SHA}" --arg step "${step}" --arg reason "${reason}" \
        '{schemaVersion:1,kind:"task168StageBActivation",status:"ACTIVATION_DIAGNOSIS_REQUIRED",releaseSha:$sha,failedStep:$step,failureReason:$reason,diagnosedAt:(now|todate)}')"
      write_json_atomic "${state_dir}/activation-stage.json" \
        '.status=="ACTIVATION_DIAGNOSIS_REQUIRED" and .kind=="task168StageBActivation" and (.releaseSha|strings|test("^[0-9a-f]{40}$")) and (.failedStep|strings|length>0) and (.failureReason|strings|length>0)' \
        <<< "${payload}"
    }
    activation_fail() {
      trap - ERR
      write_activation_diagnosis "${activation_step}" "$1"
      echo "[deploy-alpha-stage-b] MIGRATION_COMMITTED for ${ALPHA_SHA} but activation failed at '${activation_step}': $1 -- writers left exactly as the failure left them; predecessor images are NOT restored (database is post-M11). See ${state_dir}/activation-stage.json (docs/ops/task168-stage-b-runbook.md has the manual retry procedure)." >&2
      exit 1
    }
    activation_step="unexpected"
    trap 'activation_fail "unexpected failure running: ${BASH_COMMAND} (rc=$?)"' ERR

    activation_step="load-manifest"
    load_alpha_release_manifest "${ALPHA_MANIFEST_FILE}"

    activation_step="source-runtime-env"
    set -a
    # shellcheck disable=SC1090 -- protected operator-managed runtime configuration.
    source "${env_file}"
    set +a
    compose=(docker compose --project-name deploy -f "${compose_prod}" -f "${compose_alpha}" --env-file "${env_file}")

    activation_step="activate-source"
    activate_alpha_release_source "${ALPHA_SHA}"

    activation_step="pull-images"
    pull_release_images

    activation_step="write-metadata"
    write_release_metadata "${ALPHA_MANIFEST_FILE}"

    activation_step="compose-up"
    "${compose[@]}" up -d --force-recreate --no-deps v1_api v1_web v1_game_operations_worker
    "${compose[@]}" up -d --force-recreate --no-deps nginx

    # Restore each writer's restart policy from quiesce.json's recorded
    # pre-quiesce value -- compose's own static `restart: always` would
    # otherwise silently override whatever policy was actually in effect
    # before the runner quiesced these two containers (v1_web was never
    # quiesced, so it has no recorded value and keeps compose's default).
    activation_step="restore-restart-policy"
    quiesce_receipt="${state_dir}/quiesce.json"
    [[ -f "${quiesce_receipt}" ]] || activation_fail "quiesce.json is missing for ${ALPHA_SHA}; cannot restore writer restart policy"
    # Bind to the hash MIGRATION_COMMITTED already recorded (quiesceReceiptSha256)
    # before trusting restartPolicyBefore from the file on disk -- otherwise a
    # quiesce.json replaced or edited after M11 committed would be read as-is.
    quiesce_receipt_sha_expected="$(jq -er '.quiesceReceiptSha256' "${migration_receipt}")" || activation_fail "migration-stage.json is missing quiesceReceiptSha256"
    quiesce_receipt_sha_actual="$(sha256sum "${quiesce_receipt}" | awk '{print $1}')"
    [[ "${quiesce_receipt_sha_actual}" == "${quiesce_receipt_sha_expected}" ]] || activation_fail "quiesce.json no longer matches the hash migration-stage.json committed to (quiesceReceiptSha256 mismatch) -- refusing to trust its restartPolicyBefore"
    restart_api="$(jq -er '.restartPolicyBefore.api' "${quiesce_receipt}")" || activation_fail "quiesce.json is missing restartPolicyBefore.api"
    restart_worker="$(jq -er '.restartPolicyBefore.worker' "${quiesce_receipt}")" || activation_fail "quiesce.json is missing restartPolicyBefore.worker"
    api_container="$("${compose[@]}" ps -q v1_api)"
    worker_container="$("${compose[@]}" ps -q v1_game_operations_worker)"
    [[ -n "${api_container}" && -n "${worker_container}" ]] || activation_fail "final v1_api or v1_game_operations_worker container did not come up"
    docker update --restart="${restart_api}" "${api_container}" >/dev/null
    docker update --restart="${restart_worker}" "${worker_container}" >/dev/null
    [[ "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "${api_container}")" == "${restart_api}" ]] ||
      activation_fail "restored API restart policy does not match quiesce.json"
    [[ "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "${worker_container}")" == "${restart_worker}" ]] ||
      activation_fail "restored worker restart policy does not match quiesce.json"

    # post-live-verify.sh reads worker health with a single, non-retrying
    # `docker inspect` -- wait for the healthcheck to actually settle first,
    # the same bound alpha-release-common.sh's own forward-deploy path uses.
    activation_step="wait-worker-healthy"
    wait_for_alpha_worker_healthy

    activation_step="post-live-verify"
    bash "${target_source_dir}/scripts/release/task168-stage-b-post-live-verify.sh" \
      --release-sha "${ALPHA_SHA}" --manifest "${ALPHA_MANIFEST_FILE}" \
      --compose-prod "${compose_prod}" --compose-alpha "${compose_alpha}" --env-file "${env_file}" \
      --public-base-url "https://alpha.teameet.co.kr"
    runtime_receipt="${state_dir}/runtime-verification.json"
    [[ -f "${runtime_receipt}" ]] || activation_fail "post-live-verify exited 0 but wrote no runtime-verification.json"

    # §6.2 step 5: promote. assert_stage_b_promotion_receipt (already gated
    # by the T7 receipt written above) is the only path that flips this
    # release to active in state.json.
    activation_step="promote"
    write_candidate_manifest "${ALPHA_MANIFEST_FILE}"
    promote_candidate_manifest || activation_fail "promotion refused despite a written runtime-verification.json"

trap - ERR
echo "[deploy-alpha-stage-b] StageB final runtime activated, verified, and promoted for ${ALPHA_SHA}"

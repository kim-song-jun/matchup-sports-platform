#!/usr/bin/env bash

# Contract test for deploy/deploy-alpha-stage-b.sh, including stageBRecover
# (docs/ops/task168-stage-b-runbook.md). Runs the real script against fake
# docker/aws, never a reimplementation.

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${ROOT}/deploy/deploy-alpha-stage-b.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

PASS=0
FAIL=0
SKIP=0
pass() { PASS=$((PASS + 1)); echo "  ok: $*"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $*" >&2; }
skip() { SKIP=$((SKIP + 1)); echo "  skip: $*"; }

readonly SHA=1111111111111111111111111111111111111111

# The 11 Task168 migration names R-A's ledger checks (post_m11_catalog_violation
# aside, these come from task168-migration-contract.sh) require to see as the
# complete post-M11 ledger. M11's checksum is the real one (already fixed
# elsewhere in this suite via the "08eac734...|applied" m11 row argument);
# M1-M10 use a per-name placeholder since nothing else here pins their real
# bytes -- manifest.json and the fake DB's ledger rows below both derive from
# this one array so they can never disagree with each other.
TASK168_LEDGER_NAMES=(
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
task168_ledger_sha() {
  local name="$1"
  if [[ "${name}" == 20260911090000_retire_tournament_fixture_tables ]]; then
    echo 08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323
  else
    printf '%s' "task168-fixture-${name}" | sha256sum | awk '{print $1}'
  fi
}
task168_ledger_migrations_json() {
  local out='[]' name
  for name in "${TASK168_LEDGER_NAMES[@]}"; do
    out="$(jq -c --arg n "${name}" --arg s "$(task168_ledger_sha "${name}")" '. + [{name:$n, sha256:$s}]' <<<"${out}")"
  done
  printf '%s' "${out}"
}
task168_ledger_lines() {
  local name
  for name in "${TASK168_LEDGER_NAMES[@]}"; do
    printf '%s|%s|applied\n' "${name}" "$(task168_ledger_sha "${name}")"
  done
}

# Builds a fake $HOME with a state dir for $SHA and a fake compose/docker on
# PATH. Sets ALPHA_HOME_DIR/ALPHA_LIVE_DIR so the script's defaults resolve
# into the fixture instead of a real host path.
setup_recover_fixture() {
  local root="$1"
  home="${root}/home"
  live="${home}/teameet"
  state_dir="${home}/.teameet-alpha-releases/task168/${SHA}"
  bin="${root}/bin"
  log="${root}/calls.log"
  mkdir -p "${live}/deploy" "${state_dir}" "${bin}"
  : > "${log}"
  printf 'V1_DB_USER=teameet_v1\nV1_DB_NAME=teameet_v1\n' > "${live}/deploy/.env"
  touch "${live}/deploy/docker-compose.prod.yml" "${live}/deploy/docker-compose.alpha.yml"
  printf '#!/usr/bin/env bash\nexit 0\n' > "${bin}/flock" # macOS has no flock(1)
  chmod +x "${bin}/flock"
}

# Writes manifest.json + a frozen-source stub + quiesce.json + the M11 entry
# marker for an R-A(-negative) scenario, so all four share one contract
# instead of drifting independently. databaseIdentity is "" to match the fake
# docker/psql default case (no case arm matches that query, so it falls
# through to `exit 0` with empty stdout). apiImage must be a real-looking
# immutable digest reference (R-A now rejects anything else before it will
# even attempt a status check). manifestSha256 must be manifest.json's real
# hash, not a placeholder, because R-A now re-reads that file and compares
# its bytes against this value. preApiContainerId/preWorkerContainerId + the
# marker's releaseSha/manifestSha256 match ${SHA}/quiesce.json's
# manifestSha256 by construction, matching R-A's release-binding checks.
make_r_a_fixture() {
  local state_dir="$1" backup_path="$2" backup_sha="$3"
  local resolved_empty_sha; resolved_empty_sha="$(printf '' | sha256sum | awk '{print $1}')"
  local migrations_json; migrations_json="$(task168_ledger_migrations_json)"
  jq -n --argjson migrations "${migrations_json}" --arg resolvedSha "${resolved_empty_sha}" \
    '{database:{task168:{resolvedMigrationAttemptsSha256:$resolvedSha,fullMigrationHistory:$migrations,migrations:$migrations}}}' \
    > "${state_dir}/manifest.json"
  local manifest_sha; manifest_sha="$(sha256sum "${state_dir}/manifest.json" | awk '{print $1}')"
  install -d "${state_dir}/frozen-source/migrations"
  : > "${state_dir}/frozen-source/schema.prisma"
  : > "${state_dir}/frozen-source/migrations/migration_lock.toml"

  jq -n --arg path "${backup_path}" --arg sha "${backup_sha}" --arg manifestSha "${manifest_sha}" \
    '{schemaVersion:1,kind:"quiesce",status:"COMPLETED",backupPath:$path,backupSha256:$sha,
      manifestSha256:$manifestSha,databaseIdentity:"",apiImage:("img@sha256:"+("a"*64)),
      preApiContainerId:"raApi1",preWorkerContainerId:"raWorker1"}' \
    > "${state_dir}/quiesce.json"
  local quiesce_sha; quiesce_sha="$(sha256sum "${state_dir}/quiesce.json" | awk '{print $1}')"
  # enteredAt is in the past so the fake DB's "finished_at >= enteredAt"
  # binding check (a real Postgres comparison in production; here answered
  # by a fixed 't'/'f' case arm, see make_fake_docker_for_recover) is
  # exercised with a plausible value, not used to derive the fake answer.
  jq -n --arg sha "${SHA}" --arg quiesceSha "${quiesce_sha}" --arg backupSha "${backup_sha}" --arg manifestSha "${manifest_sha}" \
    '{schemaVersion:1,kind:"task168StageBM11EntryMarker",releaseSha:$sha,manifestSha256:$manifestSha,quiesceReceiptSha256:$quiesceSha,preM11BackupSha256:$backupSha,runnerContainerId:"runner123",enteredAt:"2026-09-14T00:00:00Z"}' \
    > "${state_dir}/m11-entry-marker.json"
}

# $2 = m11 row the fake DB reports ("" = absent, "sha|applied", "sha|unresolved")
# $3 = advisory lock count, $4 = labeled container count, $5 = legacy table
# count, $6 = "t"/"f" for the finished_at>=enteredAt binding check (default t),
# $7 = quiesced-writer .State.Running for raApi1/raWorker1 (default false —
# R-A's own scenarios; R-B's positive/mismatch scenarios use api123/worker123
# and need true, handled by their own arms below regardless of this default),
# $8 = quiesced-writer .HostConfig.RestartPolicy.Name for raApi1/raWorker1
# (default no), $9 = exit code for R-A's own throwaway `prisma migrate
# status` check (task168-migration-contract.sh assert_prisma_migrate_status_clean,
# default 0 = clean), $10 = one post_m11_catalog_violation code to answer
# with its FAILING value instead of its passing one (empty = every catalog
# check passes; legacy_tables/lineage_trigger are covered by $5/a dedicated
# scenario instead, so not accepted here), $11 = the v1_api image the fake
# `compose config` reports (default matches the fixture's apiImage — pass a
# different image to exercise R-A's compose-image re-check)
make_fake_docker_for_recover() {
  local bin="$1" m11="$2" advisory="${3:-0}" labeled="${4:-0}" legacy="${5:-0}" binding="${6:-t}" \
    ra_running="${7:-false}" ra_restart="${8:-no}" status_rc="${9:-0}" break="${10:-}" \
    compose_image="${11:-img@sha256:$(printf 'a%.0s' $(seq 1 64))}"
  # R-A's ledger checks (task168-migration-contract.sh) query
  # _prisma_migrations three more ways than the single-row m11 lookup below:
  # the full ledger (every migration, any name), the Task168-only subset, and
  # the unresolved/resolved-attempt rows. Only the R-A positive scenario
  # reaches these (every negative scenario refuses earlier), so one fixed
  # "11 rows, all applied, no unresolved attempts" answer -- matching
  # manifest.json's ledger fixture -- covers it.
  local ledger_lines_file="$(dirname "${bin}")/task168-ledger-lines.txt"
  task168_ledger_lines > "${ledger_lines_file}"
  # Every catalog-check answer defaults to its PASSING value; $break, if set,
  # flips exactly one of them to its failing value so that check (and only
  # that check) is what refuses the run -- the same one-check-at-a-time shape
  # as the dedicated legacy-table/lineage-trigger scenarios already use.
  local games_guard_val="CHECK ((((source_type)::text = 'TEAM_MATCH'::text) AND (team_match_id IS NOT NULL)))"
  local staff_guard_val="CHECK (((team_match_id IS NOT NULL) AND (tournament_id IS NOT NULL)))"
  local audit_guard_val=0 guard_fn_resolve_val=1 guard_fn_staff_val=1 guard_fn_lineage_val=1 \
    retired_enums_val=0 retirement_functions_val=0 retirement_triggers_val=0 \
    legacy_link_columns_val=0 processing_outbox_val=0
  case "${break}" in
    games_guard_ck) games_guard_val="CHECK (broken)" ;;
    staff_guard_ck) staff_guard_val="CHECK (broken)" ;;
    audit_guard_ck) audit_guard_val=1 ;;
    guard_fn_resolve) guard_fn_resolve_val=0 ;;
    guard_fn_staff) guard_fn_staff_val=0 ;;
    guard_fn_lineage) guard_fn_lineage_val=0 ;;
    retired_enums) retired_enums_val=1 ;;
    retirement_functions) retirement_functions_val=1 ;;
    retirement_triggers) retirement_triggers_val=1 ;;
    legacy_link_columns) legacy_link_columns_val=1 ;;
    processing_outbox) processing_outbox_val=1 ;;
    "") ;;
    *) echo "make_fake_docker_for_recover: unsupported break code: ${break}" >&2; exit 1 ;;
  esac
  cat > "${bin}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "docker \$*" >> "${log}"
case "\$*" in
  *"label=com.teameet.task168.stage-b"*)
    for ((i=0; i<${labeled}; i++)); do echo "container\$i"; done
    exit 0 ;;
  *"pg_locks"*) echo "${advisory}"; exit 0 ;;
  *"finished_at >="*) echo "${binding}"; exit 0 ;;
  *"finished_at IS NULL AND rolled_back_at IS NOT NULL"*) exit 0 ;;
  *"(finished_at IS NULL AND rolled_back_at IS NULL) OR (finished_at IS NOT NULL AND rolled_back_at IS NOT NULL)"*) echo 0; exit 0 ;;
  *"migration_name IN ("*|*"ORDER BY migration_name,id"*) cat "${ledger_lines_file}"; exit 0 ;;
  # R-A's compose-v1_api-image re-check ahead of the migrate-status
  # throwaway container -- matches the fixture's apiImage (make_r_a_fixture)
  # unless \$11 overrides it.
  *"config --format json"*) echo '{"services":{"v1_api":{"image":"${compose_image}"}}}'; exit 0 ;;
  *"count(*)"*"_prisma_migrations"*)
    # The row-count query and the row-value query both mention
    # _prisma_migrations, so this arm (matched first) must intercept the
    # count(*) form before the generic one below swallows it too.
    if [[ -n "${m11}" ]]; then echo 1; else echo 0; fi
    exit 0 ;;
  *"_prisma_migrations"*) echo "${m11}"; exit 0 ;;
  *"to_regclass"*) echo "${legacy}"; exit 0 ;;
  *"information_schema.columns"*) echo "${legacy_link_columns_val}"; exit 0 ;;
  # Specific pg_proc/pg_trigger predicates (the three re-created guard
  # functions, the lineage-reparent trigger) must be matched before the
  # generic retirement-function/-trigger arms below, which answer a
  # different query over the same two catalog tables.
  *"v1_resolve_canonical_guard_game"*) echo "${guard_fn_resolve_val}"; exit 0 ;;
  *"v1_guard_staff_fixture_scope"*) echo "${guard_fn_staff_val}"; exit 0 ;;
  *"v1_guard_tournament_result_lineage_insert"*) echo "${guard_fn_lineage_val}"; exit 0 ;;
  *"lineage_game_reparent"*) echo 1; exit 0 ;;
  *"v1_games_canonical_source_guard_ck"*) echo "${games_guard_val}"; exit 0 ;;
  *"v1_staff_scope_canonical_source_guard_ck"*) echo "${staff_guard_val}"; exit 0 ;;
  *"v1_operation_audits_canonical_source_guard_ck"*) echo "${audit_guard_val}"; exit 0 ;;
  *"v1_outbox_events"*) echo "${processing_outbox_val}"; exit 0 ;;
  *"pg_proc"*) echo "${retirement_functions_val}"; exit 0 ;;
  *"pg_trigger"*) echo "${retirement_triggers_val}"; exit 0 ;;
  *"pg_type"*) echo "${retired_enums_val}"; exit 0 ;;
  # R-A's own quiesced-writer re-check (raApi1/raWorker1, make_r_a_fixture)
  # must be matched before the R-B generic arms below.
  *"inspect --format {{.State.Running}} raApi1"*|*"inspect --format {{.State.Running}} raWorker1"*) echo "${ra_running}"; exit 0 ;;
  *"inspect --format {{.HostConfig.RestartPolicy.Name}} raApi1"*|*"inspect --format {{.HostConfig.RestartPolicy.Name}} raWorker1"*) echo "${ra_restart}"; exit 0 ;;
  *"inspect"*"State.Running"*) echo true; exit 0 ;;
  *"update --restart"*) exit 0 ;;
  # R-B re-reads the policy after the update call rather than trusting its
  # exit code; the R-B fixture's restartPolicyBefore is always "always".
  *"HostConfig.RestartPolicy.Name"*) echo always; exit 0 ;;
  *"start v1_api v1_game_operations_worker"*) exit 0 ;;
  # R-A's own throwaway status-check container (task168-migration-contract.sh
  # assert_prisma_migrate_status_clean) -- gets a distinct id so its cleanup
  # ("docker rm -f statuscheckcid") is separately verifiable in \${log}.
  *"run --pull never -d --no-deps --entrypoint sh v1_api"*) echo statuscheckcid; exit 0 ;;
  *"exec -u app statuscheckcid"*"migrate status"*) exit ${status_rc} ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "${bin}/docker"
}

run_recover() {
  local root="$1"
  local rc=0
  ALPHA_HOME_DIR="${home}" ALPHA_LIVE_DIR="${live}" TASK168_STAGE=stageBRecover ALPHA_SHA="${SHA}" \
    PATH="${bin}:${PATH}" bash "${SCRIPT}" >"${root}/stdout" 2>"${root}/stderr" || rc=$?
  echo "${rc}"
}

echo "== test-task168-stage-b-wrapper =="

# ── Precondition: lock already held -> refuse, touch nothing ───────────────
# setup_recover_fixture's fake `flock` (needed elsewhere so this suite runs
# on macOS, which has no flock(1) at all) always exits 0 unconditionally.
# Since run_recover puts
# ${bin} at the FRONT of PATH, the wrapper always found that fake ahead of
# any real flock(1) and could never actually contend for the lock — a
# deleted `flock -n 8 || fail ...` check in the script would still pass this
# case. Fixed by resolving the REAL flock(1) from the pre-existing PATH
# (before ${bin} is prepended) and, only when one exists, running the
# wrapper with a PATH that has ${bin} for docker/aws but the real flock
# ahead of it — so this specific case is the one place in this file that
# does NOT use the fake flock.
real_flock="$(command -v flock 2>/dev/null || true)"
if [[ -z "${real_flock}" ]]; then
  skip "lock precondition (no real flock(1) on this machine — covered by CI on ubuntu)"
else
  root="${WORK}/lock-held"; mkdir -p "${root}"
  setup_recover_fixture "${root}"
  make_fake_docker_for_recover "${bin}" ""
  real_flock_dir="$(dirname "${real_flock}")"
  # Hold the lock ourselves in a background subshell for the duration of the call.
  (
    exec 9>"${state_dir}/stage-b.lock"
    "${real_flock}" 9 2>/dev/null || true
    sleep 5
  ) &
  holder_pid=$!
  sleep 0.3
  rc=0
  ALPHA_HOME_DIR="${home}" ALPHA_LIVE_DIR="${live}" TASK168_STAGE=stageBRecover ALPHA_SHA="${SHA}" \
    PATH="${real_flock_dir}:${bin}:${PATH}" bash "${SCRIPT}" >"${root}/stdout" 2>"${root}/stderr" || rc=$?
  kill "${holder_pid}" 2>/dev/null || true
  wait "${holder_pid}" 2>/dev/null || true
  if [[ "${rc}" -ne 0 ]] && grep -q "flock is held" "${root}/stderr" \
    && [[ ! -s "${log}" ]]; then
    pass "held lock refuses recovery (real flock contention, no docker/compose call made)"
  else
    fail "held lock did not refuse recovery: rc=${rc} stderr=$(cat "${root}/stderr" 2>/dev/null) calls=$(cat "${log}" 2>/dev/null)"
  fi
fi

# ── Precondition: a labeled runner container exists -> refuse ──────────────
root="${WORK}/labeled-container"; mkdir -p "${root}"
setup_recover_fixture "${root}"
make_fake_docker_for_recover "${bin}" "" 0 1
rc="$(run_recover "${root}")"
[[ "${rc}" -ne 0 ]] && grep -q "still labeled" "${root}/stderr" \
  && pass "a labeled runner container refuses recovery" \
  || fail "labeled container did not refuse recovery: $(cat "${root}/stderr")"

# ── Precondition: an advisory lock is held -> refuse ────────────────────────
root="${WORK}/advisory-lock"; mkdir -p "${root}"
setup_recover_fixture "${root}"
make_fake_docker_for_recover "${bin}" "" 1 0
rc="$(run_recover "${root}")"
[[ "${rc}" -ne 0 ]] && grep -q "advisory lock" "${root}/stderr" \
  && pass "a held advisory lock refuses recovery" \
  || fail "advisory lock did not refuse recovery: $(cat "${root}/stderr")"

# ── R-B: no M11 row, quiesce.json present with new D-6 fields -> restore ───
root="${WORK}/r-b"; mkdir -p "${root}"
setup_recover_fixture "${root}"
make_fake_docker_for_recover "${bin}" "" 0 0 5
# preApiImage/preWorkerImage/databaseIdentity are "" to match the fake
# docker/psql default case (no case arm matches a plain
# `docker inspect --format '{{.Config.Image}}'` or the identity SELECT, so
# both fall through to `exit 0` with no stdout).
jq -n '{schemaVersion:1,kind:"quiesce",status:"COMPLETED",stage:"stageBFinal",
  preApiContainerId:"api123",preWorkerContainerId:"worker123",
  preApiImage:"",preWorkerImage:"",databaseIdentity:"",
  restartPolicyBefore:{api:"always",worker:"always"}}' > "${state_dir}/quiesce.json"
rc="$(run_recover "${root}")"
[[ "${rc}" -eq 0 ]] && grep -q "R-B" "${root}/stdout" \
  && grep -q "update --restart=always api123" "${log}" \
  && grep -q "start v1_api v1_game_operations_worker" "${log}" \
  && pass "R-B restores the pre-quiesce writer with its original restart policy" \
  || fail "R-B did not restore correctly: rc=${rc} stdout=$(cat "${root}/stdout") stderr=$(cat "${root}/stderr")"

# ── R-B negative: `docker update` "succeeds" but the policy read back
# afterward does not match — must refuse rather than trust the exit code.
root="${WORK}/r-b-restart-policy-mismatch"; mkdir -p "${root}"
setup_recover_fixture "${root}"
make_fake_docker_for_recover "${bin}" ""
jq -n '{schemaVersion:1,kind:"quiesce",status:"COMPLETED",stage:"stageBFinal",
  preApiContainerId:"api123",preWorkerContainerId:"worker123",
  preApiImage:"",preWorkerImage:"",databaseIdentity:"",
  restartPolicyBefore:{api:"always",worker:"always"}}' > "${state_dir}/quiesce.json"
cat > "${bin}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "docker \$*" >> "${log}"
case "\$*" in
  *"label=com.teameet.task168.stage-b"*) exit 0 ;;
  *"pg_locks"*) echo 0; exit 0 ;;
  *"_prisma_migrations"*) exit 0 ;;
  *"to_regclass"*) echo 5; exit 0 ;;
  *"HostConfig.RestartPolicy.Name"*) echo no; exit 0 ;;   # update "succeeded" but read-back disagrees
  *"inspect"*"State.Running"*) echo true; exit 0 ;;
  *) exit 0 ;;
esac
EOF
chmod +x "${bin}/docker"
rc="$(run_recover "${root}")"
[[ "${rc}" -ne 0 ]] && grep -q "restored API restart policy does not match" "${root}/stderr" \
  && pass "R-B refuses when the restored restart policy does not match the receipt" \
  || fail "R-B did not re-verify the restored restart policy: rc=${rc} $(cat "${root}/stderr")"

# ── R-A: M11 applied, no migration-stage.json, quiesce.json + backup match,
# no legacy tables left -> reconstruct MIGRATION_COMMITTED_RECOVERED ───────
root="${WORK}/r-a"; mkdir -p "${root}"
setup_recover_fixture "${root}"
printf 'fake backup bytes' > "${state_dir}/pre-m11-backup.sql"
backup_sha="$(sha256sum "${state_dir}/pre-m11-backup.sql" | awk '{print $1}')"
make_r_a_fixture "${state_dir}" "${state_dir}/pre-m11-backup.sql" "${backup_sha}"
make_fake_docker_for_recover "${bin}" "08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323|applied"
rc="$(run_recover "${root}")"
[[ "${rc}" -eq 0 ]] && [[ -f "${state_dir}/migration-stage.json" ]] \
  && [[ "$(jq -r .status "${state_dir}/migration-stage.json")" == MIGRATION_COMMITTED_RECOVERED ]] \
  && pass "R-A reconstructs a MIGRATION_COMMITTED_RECOVERED receipt, distinct from the original status" \
  || fail "R-A did not reconstruct correctly: rc=${rc} $(cat "${root}/stdout") $(cat "${root}/stderr")"

# ── R-A negative: its own throwaway `prisma migrate status` check reports
# drift (task168-migration-contract.sh assert_prisma_migrate_status_clean,
# called under this script's `set -Eeuo pipefail`). A plain
# `docker exec ...; rc=$?` there let errexit terminate the function
# right at the failing exec, before `rc=$?`, `docker rm -f`, or `fail` could
# run: the throwaway container leaked and the drift message never printed.
# Assert all three: refusal, the diagnostic message, and cleanup.
root="${WORK}/r-a-migrate-status-drift"; mkdir -p "${root}"
setup_recover_fixture "${root}"
printf 'fake backup bytes' > "${state_dir}/pre-m11-backup.sql"
backup_sha="$(sha256sum "${state_dir}/pre-m11-backup.sql" | awk '{print $1}')"
make_r_a_fixture "${state_dir}" "${state_dir}/pre-m11-backup.sql" "${backup_sha}"
make_fake_docker_for_recover "${bin}" "08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323|applied" 0 0 0 t false no 1
rc="$(run_recover "${root}")"
if [[ "${rc}" -ne 0 ]] && [[ ! -f "${state_dir}/migration-stage.json" ]] \
  && grep -q "prisma migrate status reports drift" "${root}/stderr" \
  && grep -q "^docker rm -f statuscheckcid" "${log}"; then
  pass "R-A refuses and cleans up its throwaway container when its own migrate-status check reports drift"
else
  fail "R-A did not handle migrate-status drift correctly: rc=${rc} stderr=$(cat "${root}/stderr") calls=$(grep statuscheckcid "${log}" || true)"
fi

# ── R-A negative: a MIGRATION_DIAGNOSIS_REQUIRED receipt already exists ────
# The runner (task168-stage-b-migrate.sh cleanup_pre_quiesce) writes a real
# diagnosis receipt for every after-M11 failure except a genuine deferred
# signal on an already-committed M11 (which gets no receipt at all -- the
# scenario the positive R-A test above covers). So an existing receipt here
# is never a stale placeholder; superseding it would silently convert a real
# verification failure into a false MIGRATION_COMMITTED_RECOVERED.
root="${WORK}/r-a-existing-diagnosis"; mkdir -p "${root}"
setup_recover_fixture "${root}"
printf 'fake backup bytes' > "${state_dir}/pre-m11-backup.sql"
backup_sha="$(sha256sum "${state_dir}/pre-m11-backup.sql" | awk '{print $1}')"
make_r_a_fixture "${state_dir}" "${state_dir}/pre-m11-backup.sql" "${backup_sha}"
jq -n '{schemaVersion:1,kind:"task168StageBMigration",status:"MIGRATION_DIAGNOSIS_REQUIRED",failureReason:"post-M11 Prisma migration status has drift"}' \
  > "${state_dir}/migration-stage.json"
make_fake_docker_for_recover "${bin}" "08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323|applied"
rc="$(run_recover "${root}")"
[[ "${rc}" -ne 0 ]] && grep -q "already reports MIGRATION_DIAGNOSIS_REQUIRED" "${root}/stderr" \
  && [[ "$(jq -r .status "${state_dir}/migration-stage.json")" == MIGRATION_DIAGNOSIS_REQUIRED ]] \
  && [[ ! -f "${state_dir}/migration-stage.json.superseded.json" ]] \
  && pass "R-A refuses to supersede an existing MIGRATION_DIAGNOSIS_REQUIRED receipt" \
  || fail "R-A superseded an existing diagnosis receipt: rc=${rc} $(cat "${root}/stderr")"

# ── R-A negative: the M11 entry marker's releaseSha belongs to a different
# release than ALPHA_SHA -- refuse rather than certify someone else's run ──
root="${WORK}/r-a-marker-release-mismatch"; mkdir -p "${root}"
setup_recover_fixture "${root}"
printf 'fake backup bytes' > "${state_dir}/pre-m11-backup.sql"
backup_sha="$(sha256sum "${state_dir}/pre-m11-backup.sql" | awk '{print $1}')"
make_r_a_fixture "${state_dir}" "${state_dir}/pre-m11-backup.sql" "${backup_sha}"
jq '.releaseSha = "2222222222222222222222222222222222222222"' \
  "${state_dir}/m11-entry-marker.json" > "${state_dir}/m11-entry-marker.json.tmp" \
  && mv "${state_dir}/m11-entry-marker.json.tmp" "${state_dir}/m11-entry-marker.json"
make_fake_docker_for_recover "${bin}" "08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323|applied"
rc="$(run_recover "${root}")"
[[ "${rc}" -ne 0 ]] && [[ ! -f "${state_dir}/migration-stage.json" ]] \
  && grep -q "releaseSha does not match" "${root}/stderr" \
  && pass "R-A refuses when the M11 entry marker's releaseSha does not match ALPHA_SHA" \
  || fail "R-A did not enforce the marker releaseSha binding: rc=${rc} $(cat "${root}/stderr")"

# ── R-A negative: the quiesced API writer is running again (revived by a
# compose up or daemon restart) -- it may have already written to the
# post-M11 database, so refuse rather than certify recovery blind to that ──
root="${WORK}/r-a-writer-revived"; mkdir -p "${root}"
setup_recover_fixture "${root}"
printf 'fake backup bytes' > "${state_dir}/pre-m11-backup.sql"
backup_sha="$(sha256sum "${state_dir}/pre-m11-backup.sql" | awk '{print $1}')"
make_r_a_fixture "${state_dir}" "${state_dir}/pre-m11-backup.sql" "${backup_sha}"
make_fake_docker_for_recover "${bin}" "08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323|applied" 0 0 0 t true
rc="$(run_recover "${root}")"
[[ "${rc}" -ne 0 ]] && [[ ! -f "${state_dir}/migration-stage.json" ]] \
  && grep -q "quiesced API container is running" "${root}/stderr" \
  && pass "R-A refuses when the quiesced API writer is running again" \
  || fail "R-A did not re-check the quiesced writer's running state: rc=${rc} $(cat "${root}/stderr")"

# ── R-A negative: M11 row says applied, but legacy tables are STILL present
# (schema/ledger disagree) -> must refuse, never fabricate a receipt.
root="${WORK}/r-a-negative"; mkdir -p "${root}"
setup_recover_fixture "${root}"
printf 'fake backup bytes' > "${state_dir}/pre-m11-backup.sql"
backup_sha="$(sha256sum "${state_dir}/pre-m11-backup.sql" | awk '{print $1}')"
make_r_a_fixture "${state_dir}" "${state_dir}/pre-m11-backup.sql" "${backup_sha}"
make_fake_docker_for_recover "${bin}" "08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323|applied" 0 0 5
rc="$(run_recover "${root}")"
[[ "${rc}" -ne 0 ]] && [[ ! -f "${state_dir}/migration-stage.json" ]] \
  && grep -q "legacy tables are still present" "${root}/stderr" \
  && pass "R-A refuses to reconstruct a receipt when legacy tables are still present" \
  || fail "R-A fabricated a receipt despite legacy tables remaining: rc=${rc} $(cat "${root}/stderr")"

# ── R-C: M11 row is unresolved (P3009) -> diagnosis only, no auto-recovery ─
root="${WORK}/r-c"; mkdir -p "${root}"
setup_recover_fixture "${root}"
make_fake_docker_for_recover "${bin}" "somechecksum|unresolved"
rc="$(run_recover "${root}")"
[[ "${rc}" -ne 0 ]] && [[ -f "${state_dir}/migration-stage.json.recover-diagnosis.json" ]] \
  && [[ ! -f "${state_dir}/migration-stage.json" ]] \
  && pass "R-C writes a diagnosis-only receipt and does not fabricate a committed one" \
  || fail "R-C did not behave correctly: rc=${rc} $(cat "${root}/stderr")"

# ── R-A negative: M11's finished_at predates this release's entry marker ───
# Without this check, a stale quiesce/backup/marker from a release that
# never reached M11 could be certified as the origin of an M11 row another
# release actually committed.
root="${WORK}/r-a-stale-binding"; mkdir -p "${root}"
setup_recover_fixture "${root}"
printf 'fake backup bytes' > "${state_dir}/pre-m11-backup.sql"
backup_sha="$(sha256sum "${state_dir}/pre-m11-backup.sql" | awk '{print $1}')"
make_r_a_fixture "${state_dir}" "${state_dir}/pre-m11-backup.sql" "${backup_sha}"
make_fake_docker_for_recover "${bin}" "08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323|applied" 0 0 0 f
rc="$(run_recover "${root}")"
[[ "${rc}" -ne 0 ]] && [[ ! -f "${state_dir}/migration-stage.json" ]] \
  && grep -q "predates this release's M11 entry marker" "${root}/stderr" \
  && pass "R-A refuses when M11's finished_at predates this release's entry marker" \
  || fail "R-A did not enforce the finished_at binding: rc=${rc} $(cat "${root}/stderr")"

# ── R-A negative: post-M11 catalog re-check beyond the original four (the
# lineage guard trigger here) also gates recovery, not only legacy tables ──
root="${WORK}/r-a-lineage-trigger-missing"; mkdir -p "${root}"
setup_recover_fixture "${root}"
printf 'fake backup bytes' > "${state_dir}/pre-m11-backup.sql"
backup_sha="$(sha256sum "${state_dir}/pre-m11-backup.sql" | awk '{print $1}')"
make_r_a_fixture "${state_dir}" "${state_dir}/pre-m11-backup.sql" "${backup_sha}"
cat > "${bin}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "docker \$*" >> "${log}"
case "\$*" in
  *"label=com.teameet.task168.stage-b"*) exit 0 ;;
  *"pg_locks"*) echo 0; exit 0 ;;
  *"finished_at >="*) echo t; exit 0 ;;
  *"count(*)"*"_prisma_migrations"*) echo 1; exit 0 ;;
  *"_prisma_migrations"*) echo "08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323|applied"; exit 0 ;;
  *"to_regclass"*) echo 0; exit 0 ;;
  *"information_schema.columns"*) echo 0; exit 0 ;;
  # Every other guard function/trigger/enum/outbox query is satisfied
  # (echoes 1 or the exact expected CHECK text as appropriate) EXCEPT the
  # lineage trigger below, which is the one check this scenario deliberately
  # breaks.
  *"v1_resolve_canonical_guard_game"*) echo 1; exit 0 ;;
  *"v1_guard_staff_fixture_scope"*) echo 1; exit 0 ;;
  *"v1_guard_tournament_result_lineage_insert"*) echo 1; exit 0 ;;
  *"v1_games_canonical_source_guard_ck"*) echo "CHECK ((((source_type)::text = 'TEAM_MATCH'::text) AND (team_match_id IS NOT NULL)))"; exit 0 ;;
  *"v1_staff_scope_canonical_source_guard_ck"*) echo "CHECK (((team_match_id IS NOT NULL) AND (tournament_id IS NOT NULL)))"; exit 0 ;;
  *"v1_operation_audits_canonical_source_guard_ck"*) echo 0; exit 0 ;;
  *"v1_outbox_events"*) echo 0; exit 0 ;;
  *"lineage_game_reparent"*) echo 0; exit 0 ;;
  *"pg_proc"*) echo 0; exit 0 ;;
  *"pg_trigger"*) echo 0; exit 0 ;;
  *"pg_type"*) echo 0; exit 0 ;;
  # Quiesced writers (raApi1/raWorker1, make_r_a_fixture) still correctly
  # stopped -- this scenario deliberately breaks the lineage trigger only.
  *"inspect"*"State.Running"*) echo false; exit 0 ;;
  *"HostConfig.RestartPolicy.Name"*) echo no; exit 0 ;;
  *) exit 0 ;;
esac
EOF
chmod +x "${bin}/docker"
rc="$(run_recover "${root}")"
[[ "${rc}" -ne 0 ]] && [[ ! -f "${state_dir}/migration-stage.json" ]] \
  && grep -q "canonical lineage trigger is missing" "${root}/stderr" \
  && pass "R-A refuses when the post-M11 lineage guard trigger is missing" \
  || fail "R-A did not re-check the lineage trigger: rc=${rc} $(cat "${root}/stderr")"

# ── R-A negative: every OTHER post_m11_catalog_violation code also gates
# recovery, one at a time (legacy_tables/lineage_trigger are already covered
# above by dedicated scenarios). Shared with the runner via
# task168-migration-contract.sh, so a check silently deleted from that one
# file would otherwise go untested for both callers.
CATALOG_BREAK_CODES=(games_guard_ck staff_guard_ck audit_guard_ck guard_fn_resolve guard_fn_staff guard_fn_lineage retired_enums retirement_functions retirement_triggers legacy_link_columns processing_outbox)
CATALOG_BREAK_MESSAGES=(
  "games canonical source guard constraint is missing or changed"
  "staff scope canonical source guard constraint is missing or changed"
  "legacy audit canonical-source guard constraint remains"
  "v1_resolve_canonical_guard_game is missing or its signature changed"
  "v1_guard_staff_fixture_scope is missing or its signature changed"
  "v1_guard_tournament_result_lineage_insert is missing or its signature changed"
  "retired enum types remain"
  "retirement functions are still present"
  "retirement triggers are still present"
  "legacy link columns are still present"
  "processing outbox rows remain"
)
for i in "${!CATALOG_BREAK_CODES[@]}"; do
  break_code="${CATALOG_BREAK_CODES[$i]}"; break_msg="${CATALOG_BREAK_MESSAGES[$i]}"
  root="${WORK}/r-a-catalog-${break_code}"; mkdir -p "${root}"
  setup_recover_fixture "${root}"
  printf 'fake backup bytes' > "${state_dir}/pre-m11-backup.sql"
  backup_sha="$(sha256sum "${state_dir}/pre-m11-backup.sql" | awk '{print $1}')"
  make_r_a_fixture "${state_dir}" "${state_dir}/pre-m11-backup.sql" "${backup_sha}"
  make_fake_docker_for_recover "${bin}" "08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323|applied" 0 0 0 t false no 0 "${break_code}"
  rc="$(run_recover "${root}")"
  [[ "${rc}" -ne 0 ]] && [[ ! -f "${state_dir}/migration-stage.json" ]] \
    && grep -q "${break_msg}" "${root}/stderr" \
    && pass "R-A refuses when the ${break_code} catalog check fails" \
    || fail "R-A did not enforce ${break_code}: rc=${rc} $(cat "${root}/stderr")"
done

# ── R-A negative: the running compose config's v1_api image does not match
# the pinned final image (activated the wrong release before recovering) ──
root="${WORK}/r-a-compose-image-mismatch"; mkdir -p "${root}"
setup_recover_fixture "${root}"
printf 'fake backup bytes' > "${state_dir}/pre-m11-backup.sql"
backup_sha="$(sha256sum "${state_dir}/pre-m11-backup.sql" | awk '{print $1}')"
make_r_a_fixture "${state_dir}" "${state_dir}/pre-m11-backup.sql" "${backup_sha}"
make_fake_docker_for_recover "${bin}" "08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323|applied" 0 0 0 t false no 0 "" "img@sha256:$(printf 'b%.0s' $(seq 1 64))"
rc="$(run_recover "${root}")"
[[ "${rc}" -ne 0 ]] && [[ ! -f "${state_dir}/migration-stage.json" ]] \
  && grep -q "running compose config's v1_api image does not match the pinned final image" "${root}/stderr" \
  && pass "R-A refuses when the running compose config's v1_api image does not match the pinned final image" \
  || fail "R-A did not re-check the compose image: rc=${rc} $(cat "${root}/stderr")"

# ── R-A negative: a quiesced writer is stopped (not running) but its restart
# policy is not 'no' -- isolates this check from the Running==true case
# ("r-a-writer-revived" above), which would otherwise refuse first ─────────
root="${WORK}/r-a-writer-restart-not-no"; mkdir -p "${root}"
setup_recover_fixture "${root}"
printf 'fake backup bytes' > "${state_dir}/pre-m11-backup.sql"
backup_sha="$(sha256sum "${state_dir}/pre-m11-backup.sql" | awk '{print $1}')"
make_r_a_fixture "${state_dir}" "${state_dir}/pre-m11-backup.sql" "${backup_sha}"
make_fake_docker_for_recover "${bin}" "08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323|applied" 0 0 0 t false always
rc="$(run_recover "${root}")"
[[ "${rc}" -ne 0 ]] && [[ ! -f "${state_dir}/migration-stage.json" ]] \
  && grep -q "restart policy is not 'no'" "${root}/stderr" \
  && pass "R-A refuses when a stopped quiesced writer's restart policy is not 'no'" \
  || fail "R-A did not re-check the quiesced writer's restart policy: rc=${rc} $(cat "${root}/stderr")"

# ── R-A negative: the manifest copy on disk no longer matches the hash the
# quiesce receipt recorded (corrupted or swapped after quiescence) ─────────
root="${WORK}/r-a-manifest-copy-corrupted"; mkdir -p "${root}"
setup_recover_fixture "${root}"
printf 'fake backup bytes' > "${state_dir}/pre-m11-backup.sql"
backup_sha="$(sha256sum "${state_dir}/pre-m11-backup.sql" | awk '{print $1}')"
make_r_a_fixture "${state_dir}" "${state_dir}/pre-m11-backup.sql" "${backup_sha}"
printf '\n' >> "${state_dir}/manifest.json"
make_fake_docker_for_recover "${bin}" "08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323|applied"
rc="$(run_recover "${root}")"
[[ "${rc}" -ne 0 ]] && [[ ! -f "${state_dir}/migration-stage.json" ]] \
  && grep -q "manifest copy no longer matches the quiesce receipt's manifestSha256" "${root}/stderr" \
  && pass "R-A refuses when the manifest copy no longer matches its recorded hash" \
  || fail "R-A did not re-check the manifest copy hash: rc=${rc} $(cat "${root}/stderr")"

# ── R-A negative (cross-release false-green): a sibling release's own M11
# entry marker was written at or after this release's own -- every OTHER
# binding is self-referential to this release's own state directory and
# cannot tell the two apart, so refuse instead of certifying a receipt that
# may actually belong to the sibling. Reproduces the false-recovery ordering
# at the wrapper level (see scenario w in test-task168-stage-b-runner.sh for
# the real end-to-end reproduction).
root="${WORK}/r-a-sibling-marker"; mkdir -p "${root}"
setup_recover_fixture "${root}"
printf 'fake backup bytes' > "${state_dir}/pre-m11-backup.sql"
backup_sha="$(sha256sum "${state_dir}/pre-m11-backup.sql" | awk '{print $1}')"
make_r_a_fixture "${state_dir}" "${state_dir}/pre-m11-backup.sql" "${backup_sha}"
sibling_dir="${home}/.teameet-alpha-releases/task168/2222222222222222222222222222222222222222"
install -d "${sibling_dir}"
jq -n '{schemaVersion:1,kind:"task168StageBM11EntryMarker",releaseSha:"2222222222222222222222222222222222222222",enteredAt:"2026-09-14T01:00:00Z"}' \
  > "${sibling_dir}/m11-entry-marker.json"
make_fake_docker_for_recover "${bin}" "08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323|applied"
rc="$(run_recover "${root}")"
[[ "${rc}" -ne 0 ]] && [[ ! -f "${state_dir}/migration-stage.json" ]] \
  && grep -q "sibling release" "${root}/stderr" \
  && pass "R-A refuses when a sibling release has its own M11 entry marker at or after this one" \
  || fail "R-A did not enforce the sibling-marker cross-release binding: rc=${rc} $(cat "${root}/stderr")"

# ── R-B negative: no M11 ledger row, but the pre-M11 physical schema is not
# fully present either -- do not trust the ledger's absence alone before
# reviving a predecessor-image writer against a database in an uncertain
# state.
root="${WORK}/r-b-schema-not-pre-m11"; mkdir -p "${root}"
setup_recover_fixture "${root}"
jq -n '{schemaVersion:1,kind:"quiesce",status:"COMPLETED",stage:"stageBFinal",
  preApiContainerId:"api123",preWorkerContainerId:"worker123",
  preApiImage:"",preWorkerImage:"",databaseIdentity:"",
  restartPolicyBefore:{api:"always",worker:"always"}}' > "${state_dir}/quiesce.json"
make_fake_docker_for_recover "${bin}" "" 0 0 3
rc="$(run_recover "${root}")"
[[ "${rc}" -ne 0 ]] && grep -q "retired tables are not fully present" "${root}/stderr" \
  && pass "R-B refuses to restore a writer when the pre-M11 physical schema is not fully present" \
  || fail "R-B did not check the pre-M11 schema shape: rc=${rc} $(cat "${root}/stderr")"

# ── stageBFinal: runner exits 0 but writes no receipt -> wrapper still fails
# (judged by migration-stage.json, never by exit code alone — §3).
run_stage_b_final_no_receipt() {
  local root="${WORK}/final-no-receipt"
  mkdir -p "${root}/candidate-source/deploy"
  local home="${root}/home" live="${root}/home/teameet"
  local bin="${root}/bin"
  mkdir -p "${live}/deploy" "${bin}"
  printf '#!/usr/bin/env bash\nexit 0\n' > "${bin}/flock"; chmod +x "${bin}/flock"
  printf 'V1_DB_USER=teameet_v1\nV1_DB_NAME=teameet_v1\n' > "${live}/deploy/.env"
  touch "${live}/deploy/docker-compose.prod.yml" "${live}/deploy/docker-compose.alpha.yml"

  local source_dir="${root}/candidate-source"
  cp "${ROOT}/deploy/alpha-manifest-common.sh" "${source_dir}/deploy/alpha-manifest-common.sh"
  cp "${ROOT}/deploy/alpha-source-common.sh" "${source_dir}/deploy/alpha-source-common.sh"
  cat > "${source_dir}/deploy/alpha-release-common.sh" <<EOF
source "${ROOT}/deploy/alpha-release-common.sh"
EOF
  # A runner stand-in that exits 0 without writing migration-stage.json —
  # exactly the "runner claims success but the receipt says otherwise" case.
  printf '#!/usr/bin/env bash\nexit 0\n' > "${source_dir}/deploy/task168-stage-b-migrate.sh"
  chmod +x "${source_dir}/deploy/task168-stage-b-migrate.sh"

  local registry=123456789012.dkr.ecr.ap-northeast-2.amazonaws.com
  local manifest="${root}/manifest.json"
  jq -n --arg registry "${registry}" '{
    schemaVersion:1, environment:"alpha",
    release:{sha:"'"${SHA}"'", version:"0.1.0-alpha.20260914.g111111111111", createdAt:"2026-09-14T00:00:00Z"},
    source:{bucket:"b", key:"releases/task168-stage-b/'"${SHA}"'.tar.gz", versionId:"v1", sha256:("c"*64)},
    database:{migrationPolicy:"task168-stageBFinal", rollbackMode:"backup-only", compatibilityCheck:"expand-contract-sql-v1",
      task168:{stage:"stageBFinal", schemaSha256:"e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46",
        runtimeClientSchemaSha256:"e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46",
        migrations:[range(0;11)|{name:("202609010000"+((10+.)|tostring)+"_v1_fixture"),sha256:("d"*64)}],
        fullMigrationHistory:[range(0;12)|{name:("202608010000"+((10+.)|tostring)+"_v1_history"),sha256:("d"*64)}],
        resolvedMigrationAttemptsSha256:("e"*64),
        migrationLockSha256:("1"*64),
        predecessor:{releaseSha:"2222222222222222222222222222222222222222",transition:"/x",transitionSha256:("f"*64),apiImage:"img",databaseIdentity:"id",schemaSha256:"91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f"},
        rehearsal:{mode:"waived",reason:"user-directed Alpha run without isolated rehearsal",decidedAt:"2026-09-14"},
        recoveryFrom:null, rollbackTarget:null}},
    images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:("sha256:"+("a"*64)),uri:($registry+"/teameet-alpha-v1-api@sha256:"+("a"*64))},
      web:{repository:($registry+"/teameet-alpha-v1-web"),digest:("sha256:"+("b"*64)),uri:($registry+"/teameet-alpha-v1-web@sha256:"+("b"*64))},
      cutoverTool:{repository:($registry+"/teameet-alpha-v1-api"),digest:("sha256:"+("c"*64)),uri:($registry+"/teameet-alpha-v1-api@sha256:"+("c"*64))}}}' \
    > "${manifest}"

  local bin2="${root}/bin"
  cat > "${bin2}/docker" <<EOF
#!/usr/bin/env bash
case "\$*" in
  *"run --rm --entrypoint cat"*.task168-runtime-client-attestation.json*)
    echo '{"stage":"stageBFinal","schemaSha256":"e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46","generatedClient":true}'
    ;;
  # Must drain stdin: "aws ecr get-login-password | docker login
  # --password-stdin" pipes a fake password in, and exiting without reading
  # it races the writer for SIGPIPE (see write_activation_fake_docker's
  # identical case for the full explanation).
  *"login --username AWS --password-stdin"*) cat > /dev/null ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "${bin2}/docker"
  cat > "${bin2}/aws" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  *"ecr get-login-password"*) echo fake-password ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "${bin2}/aws"

  local rc=0
  ALPHA_HOME_DIR="${home}" ALPHA_LIVE_DIR="${live}" TASK168_STAGE=stageBFinal \
    ALPHA_SOURCE_DIR="${source_dir}" ALPHA_MANIFEST_FILE="${manifest}" \
    ALPHA_MANIFEST_SHA256="$(sha256sum "${manifest}" | awk '{print $1}')" \
    ALPHA_SHA="${SHA}" ALPHA_RELEASE_VERSION="0.1.0-alpha.20260914.g111111111111" \
    ALPHA_ECR_REGISTRY="${registry}" ALPHA_AWS_REGION="ap-northeast-2" \
    ALPHA_SOURCE_BUCKET="b" ALPHA_SOURCE_VERSION_ID="v1" ALPHA_SOURCE_SHA256="$(printf 'c%.0s' {1..64})" \
    PATH="${bin2}:${PATH}" bash "${SCRIPT}" >"${root}/stdout" 2>"${root}/stderr" || rc=$?
  echo "${rc}"
}
rc="$(run_stage_b_final_no_receipt)"
[[ "${rc}" -ne 0 ]] && grep -q "wrote no migration-stage.json" "${WORK}/final-no-receipt/stderr" \
  && pass "stageBFinal fails when the runner exits 0 without a migration receipt (judged by receipt, not exit code)" \
  || fail "stageBFinal did not judge by the receipt: rc=${rc} $(cat "${WORK}/final-no-receipt/stderr" 2>/dev/null)"

# ── stageBFinal post-commit continuation (U2 = continue automatically):
# activation, restart-policy restoration from quiesce.json, T7
# (post-live-verify.sh), and promotion. Every scenario shares one fixture
# builder; BREAK selects which single step fails (empty = full success).
readonly ACTIVATION_RESTART_API=on-failure
readonly ACTIVATION_RESTART_WORKER=unless-stopped

build_activation_fixture() {
  local root="$1"
  mkdir -p "${root}/candidate-source/deploy" "${root}/candidate-source/scripts/release"
  home="${root}/home"; live="${root}/home/teameet"
  bin="${root}/bin"
  mkdir -p "${live}/deploy" "${bin}"
  printf '#!/usr/bin/env bash\nexit 0\n' > "${bin}/flock"; chmod +x "${bin}/flock"
  printf 'V1_DB_USER=teameet_v1\nV1_DB_NAME=teameet_v1\n' > "${live}/deploy/.env"
  touch "${live}/deploy/docker-compose.prod.yml" "${live}/deploy/docker-compose.alpha.yml"

  source_dir="${root}/candidate-source"
  cp "${ROOT}/deploy/alpha-manifest-common.sh" "${source_dir}/deploy/alpha-manifest-common.sh"
  cp "${ROOT}/deploy/alpha-source-common.sh" "${source_dir}/deploy/alpha-source-common.sh"
  cp "${ROOT}/scripts/release/task168-stage-b-post-live-verify.sh" "${source_dir}/scripts/release/task168-stage-b-post-live-verify.sh"
  cat > "${source_dir}/deploy/alpha-release-common.sh" <<EOF
source "${ROOT}/deploy/alpha-release-common.sh"
EOF
  # activate_alpha_release_source repoints ALPHA_LIVE_DIR at this staged
  # copy, so compose_prod/compose_alpha (computed once as
  # ${ALPHA_LIVE_DIR}/deploy/*.yml before activation) resolve through it
  # afterward -- the files must exist here, not just under the pre-activation
  # live dir built below.
  touch "${source_dir}/deploy/docker-compose.prod.yml" "${source_dir}/deploy/docker-compose.alpha.yml"

  registry=123456789012.dkr.ecr.ap-northeast-2.amazonaws.com
  api_uri="${registry}/teameet-alpha-v1-api@sha256:$(printf 'a%.0s' {1..64})"
  web_uri="${registry}/teameet-alpha-v1-web@sha256:$(printf 'b%.0s' {1..64})"
  manifest="${root}/manifest.json"
  jq -n --arg registry "${registry}" --arg api "${api_uri}" --arg web "${web_uri}" \
    --argjson migrations "$(task168_ledger_migrations_json)" '{
    schemaVersion:1, environment:"alpha",
    release:{sha:"'"${SHA}"'", version:"0.1.0-alpha.20260914.g111111111111", createdAt:"2026-09-14T00:00:00Z"},
    source:{bucket:"b", key:"releases/task168-stage-b/'"${SHA}"'.tar.gz", versionId:"v1", sha256:("c"*64)},
    database:{migrationPolicy:"task168-stageBFinal", rollbackMode:"backup-only", compatibilityCheck:"expand-contract-sql-v1",
      task168:{stage:"stageBFinal", schemaSha256:"e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46",
        runtimeClientSchemaSha256:"e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46",
        migrations:$migrations,
        fullMigrationHistory:[range(0;12)|{name:("202608010000"+((10+.)|tostring)+"_v1_history"),sha256:("d"*64)}],
        resolvedMigrationAttemptsSha256:("e"*64),
        migrationLockSha256:("1"*64),
        predecessor:{releaseSha:"2222222222222222222222222222222222222222",transition:"/x",transitionSha256:("f"*64),apiImage:"img",databaseIdentity:"id",schemaSha256:"91222f64cf30dd15169a17cf5eb096c446861c5f578a31c51d44c92b3a321f3f"},
        rehearsal:{mode:"waived",reason:"user-directed Alpha run without isolated rehearsal",decidedAt:"2026-09-14"},
        recoveryFrom:null, rollbackTarget:null}},
    images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:("sha256:"+("a"*64)),uri:$api},
      web:{repository:($registry+"/teameet-alpha-v1-web"),digest:("sha256:"+("b"*64)),uri:$web},
      cutoverTool:{repository:($registry+"/teameet-alpha-v1-api"),digest:("sha256:"+("c"*64)),uri:($registry+"/teameet-alpha-v1-api@sha256:"+("c"*64))}}}' \
    > "${manifest}"

  # A runner stand-in that behaves exactly like the real one on the
  # happy/no-receipt path already covered above: writes MIGRATION_COMMITTED
  # plus the quiesce.json the activation code reads restartPolicyBefore
  # from. The path is baked in at fixture-build time (immediate heredoc
  # substitution of ${home}) since the stub has no other way to learn it.
  local state_dir="${home}/.teameet-alpha-releases/task168/${SHA}"
  cat > "${source_dir}/deploy/task168-stage-b-migrate.sh" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
install -d -m 700 "${state_dir}"
jq -n --arg api "${ACTIVATION_RESTART_API}" --arg worker "${ACTIVATION_RESTART_WORKER}" '{
  schemaVersion:1,kind:"quiesce",releaseSha:"${SHA}",
  preApiContainerId:"pre-api",preWorkerContainerId:"pre-worker",
  preApiImage:"legacy-api-image",preWorkerImage:"legacy-worker-image",
  restartPolicyBefore:{api:\$api,worker:\$worker},
  databaseIdentity:"db-1",backupPath:"/tmp/backup.sql",backupSha256:("0"*64),
  manifestSha256:("0"*64)}' > "${state_dir}/quiesce.json"
quiesce_sha="\$(sha256sum "${state_dir}/quiesce.json" | awk '{print \$1}')"
jq -n --arg qsha "\${quiesce_sha}" '{schemaVersion:1,kind:"task168StageBMigration",status:"MIGRATION_COMMITTED",releaseSha:"${SHA}",quiesceReceiptSha256:\$qsha}' \
  > "${state_dir}/migration-stage.json"
EOF
  chmod +x "${source_dir}/deploy/task168-stage-b-migrate.sh"

  cat > "${bin}/aws" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  *"ecr get-login-password"*) echo fake-password ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "${bin}/aws"
}

# Writes a fake docker covering both the wrapper's own pre-runner
# attestation check and everything the activation code + real
# task168-stage-b-post-live-verify.sh (T7) call afterward. `docker update
# --restart=X <container>` is stateful (writes X to a per-container file
# under ${bin}/restart-state) so the later `docker inspect
# --format {{.HostConfig.RestartPolicy.Name}}` genuinely reflects what the
# script passed through -- a hardcoded "always" instead of reading
# quiesce.json would be caught, not just echoed back.
write_activation_fake_docker() {
  local bin="$1" break_case="${2:-}"
  mkdir -p "${bin}/restart-state"
  : > "${bin}/docker-calls.log"
  task168_ledger_lines > "${bin}/ledger-rows.txt"
  cat > "${bin}/docker" <<EOF
#!/usr/bin/env bash
set -u
printf '%s\n' "\$*" >> "${bin}/docker-calls.log"
argv=("\$@")
find_idx() { local n="\$1" i; for ((i=0;i<\${#argv[@]};i++)); do [[ "\${argv[i]}" == "\$n" ]] && { echo "\$i"; return 0; }; done; return 1; }
case "\${argv[0]}" in
  run)
    if [[ "${break_case}" == attestation ]]; then
      echo '{"stage":"stageAIntermediate","schemaSha256":"bad"}'
    else
      echo '{"stage":"stageBFinal","schemaSha256":"e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46","generatedClient":true}'
    fi
    exit 0 ;;
  pull) exit 0 ;;
  # Must drain stdin before exiting: "aws ecr get-login-password | docker
  # login --password-stdin" pipes a real (fake) password in. Exiting via the
  # catch-all below without reading it races the writer -- an aws process
  # that hasn't finished its single echo when this exits gets SIGPIPE,
  # killing the whole wrapper script with rc=141 instead of the real
  # (non-)error being tested.
  login) cat > /dev/null; exit 0 ;;
  update)
    cid="\${argv[-1]}"
    val="\${argv[1]#--restart=}"
    printf '%s' "\${val}" > "${bin}/restart-state/\${cid}"
    exit 0 ;;
  inspect)
    tmpl="\${argv[2]}"; cid="\${argv[3]}"
    case "\${tmpl}" in
      '{{.HostConfig.RestartPolicy.Name}}') cat "${bin}/restart-state/\${cid}" 2>/dev/null || echo unknown ;;
      '{{.Config.Image}}')
        case "\${cid}" in
          api-container) echo "${api_uri:-}" ;;
          web-container) echo "${web_uri:-}" ;;
          worker-container) echo "${api_uri:-}" ;;
          *) echo "fake docker: unexpected inspect container: \${cid}" >&2; exit 1 ;;
        esac ;;
      '{{.State.Health.Status}}')
        if [[ "${break_case}" == worker-unhealthy ]]; then echo unhealthy; else echo healthy; fi ;;
      *) echo "fake docker: unexpected inspect template: \${tmpl}" >&2; exit 1 ;;
    esac
    exit 0 ;;
  compose)
    if idx="\$(find_idx ps)"; then
      case "\${argv[\$((idx+2))]}" in
        v1_api) echo api-container ;;
        v1_web) echo web-container ;;
        v1_game_operations_worker) echo worker-container ;;
        *) echo "fake docker: unexpected ps service: \${argv[\$((idx+2))]}" >&2; exit 1 ;;
      esac
      exit 0
    elif idx="\$(find_idx up)"; then
      if [[ "${break_case}" == compose-up ]]; then exit 1; fi
      exit 0
    elif idx="\$(find_idx exec)"; then
      svc="\${argv[\$((idx+2))]}"
      if [[ "\${svc}" == v1_postgres ]]; then
        cidx="\$(find_idx -c)" || { echo "fake docker: no -c in psql exec" >&2; exit 1; }
        sql="\${argv[\$((cidx+1))]}"
        case "\${sql}" in
          *_prisma_migrations*)
            names="\$(grep -oE "'[0-9]{14}_[a-z0-9_]+'" <<< "\${sql}" | tr -d "'")"
            [[ -n "\${names}" ]] || { echo "fake docker: no exact migration names in ledger SQL" >&2; exit 1; }
            while IFS= read -r n; do grep "^\${n}|" "${bin}/ledger-rows.txt" || true; done <<< "\${names}" | LC_ALL=C sort
            ;;
          *v1_tournament_fixtures*) echo 0 ;;
          *information_schema.columns*) echo 0 ;;
          *v1_outbox_events*) echo 0 ;;
          *v1_tournaments*) echo 'tid|mid' ;;
          *) echo "fake docker: unexpected SQL: \${sql}" >&2; exit 1 ;;
        esac
      elif [[ "\${svc}" == v1_api ]]; then
        if [[ "${break_case}" == drift ]]; then echo "drift detected" >&2; exit 2; fi
        exit 0
      else
        echo "fake docker: unexpected exec service: \${svc}" >&2; exit 1
      fi
    else
      echo "fake docker: unexpected compose invocation: \$*" >&2; exit 1
    fi
    ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "${bin}/docker"

  cat > "${bin}/curl" <<EOF
#!/usr/bin/env bash
has_devnull=false
for a in "\$@"; do [[ "\${a}" == "/dev/null" ]] && has_devnull=true; done
if \${has_devnull}; then
  if [[ "${break_case}" == smoke ]]; then printf 500; else printf 200; fi
else
  if [[ "${break_case}" == health ]]; then echo '{"data":{"checks":{"db":false}}}'; else echo '{"data":{"checks":{"db":true}}}'; fi
fi
EOF
  chmod +x "${bin}/curl"
}

run_activation_case() {
  local root="$1" break_case="${2:-}"
  build_activation_fixture "${root}"
  write_activation_fake_docker "${bin}" "${break_case}"
  # The state StageB always meets on the real host: the push deploy for this
  # same commit has already staged its own, different tree at <sha>.
  if [[ -n "${PRESTAGE_PUSH_TREE:-}" ]]; then
    local push_tree="${home}/.teameet-alpha-sources/${SHA}"
    mkdir -p "${push_tree}/deploy"
    printf '#!/usr/bin/env bash\n' > "${push_tree}/deploy/deploy-alpha.sh"
    printf 'push-archive-sha256\n' > "${push_tree}/.source-sha256"
  fi
  local rc=0
  # task168-stage-b-post-live-verify.sh (invoked for real by the activation
  # code, a separate process) hardcodes /home/ec2-user/.teameet-alpha-releases
  # as ITS OWN ALPHA_RELEASE_STATE_DIR fallback -- unlike the wrapper, which
  # falls back to ${ALPHA_HOME_DIR}/.teameet-alpha-releases. These only agree
  # in real production because ALPHA_HOME_DIR there IS /home/ec2-user; the
  # test must set ALPHA_RELEASE_STATE_DIR explicitly so the two independently
  # resolve the same directory under this fixture's temp ALPHA_HOME_DIR.
  ALPHA_HOME_DIR="${home}" ALPHA_LIVE_DIR="${live}" TASK168_STAGE=stageBFinal \
    ALPHA_RELEASE_STATE_DIR="${home}/.teameet-alpha-releases" \
    ALPHA_SOURCE_DIR="${source_dir}" ALPHA_MANIFEST_FILE="${manifest}" \
    ALPHA_MANIFEST_SHA256="$(sha256sum "${manifest}" | awk '{print $1}')" \
    ALPHA_SHA="${SHA}" ALPHA_RELEASE_VERSION="0.1.0-alpha.20260914.g111111111111" \
    ALPHA_ECR_REGISTRY="${registry}" ALPHA_AWS_REGION="ap-northeast-2" \
    ALPHA_SOURCE_BUCKET="b" ALPHA_SOURCE_VERSION_ID="v1" ALPHA_SOURCE_SHA256="$(printf 'c%.0s' {1..64})" \
    PATH="${bin}:${PATH}" bash "${SCRIPT}" >"${root}/stdout" 2>"${root}/stderr" || rc=$?
  echo "${rc}"
}

# run_activation_case runs build_activation_fixture through a $(...) command
# substitution (a subshell), so the "global" bin/home/etc it sets never
# reach this scope -- every path below is recomputed from ${root} instead,
# which IS known here.
activation_paths() {
  local root="$1"
  echo "${root}/bin" "${root}/home/.teameet-alpha-releases/task168/${SHA}" "${root}/home/.teameet-alpha-releases"
}

# ── Positive: full success through activation, restart-policy restoration,
# T7, and promotion. ──────────────────────────────────────────────────────
(
  root="${WORK}/activation-success"; mkdir -p "${root}"
  rc="$(run_activation_case "${root}")"
  read -r local_bin local_state_dir local_release_state_dir <<< "$(activation_paths "${root}")"
  block_ok=true
  if [[ "${rc}" -eq 0 ]]; then
    pass "stageBFinal activation succeeds end-to-end (compose up, restart-policy restore, T7, promote)"
  else
    fail "activation success case failed: rc=${rc} $(cat "${root}/stderr")"; block_ok=false
  fi
  if [[ -f "${local_state_dir}/runtime-verification.json" ]]; then
    pass "runtime-verification.json (T7) is written on success"
  else
    fail "runtime-verification.json is missing after a successful activation: $(cat "${root}/stderr")"; block_ok=false
  fi
  if [[ "$(cat "${local_bin}/restart-state/api-container" 2>/dev/null)" == "${ACTIVATION_RESTART_API}" ]]; then
    pass "API restart policy is restored from quiesce.json's recorded value (${ACTIVATION_RESTART_API}), not hardcoded"
  else
    fail "API restart policy was not restored to quiesce.json's value"; block_ok=false
  fi
  if [[ "$(cat "${local_bin}/restart-state/worker-container" 2>/dev/null)" == "${ACTIVATION_RESTART_WORKER}" ]]; then
    pass "worker restart policy is restored from quiesce.json's recorded value (${ACTIVATION_RESTART_WORKER}), not hardcoded"
  else
    fail "worker restart policy was not restored to quiesce.json's value"; block_ok=false
  fi
  if grep -q "up -d --force-recreate --no-deps v1_api v1_web v1_game_operations_worker" "${local_bin}/docker-calls.log"; then
    pass "final runtime is brought up via compose force-recreate"
  else
    fail "compose up --force-recreate for the app services was not called"; block_ok=false
  fi
  if [[ -f "${local_release_state_dir}/state.json" ]]; then
    pass "state.json exists after promotion"
  else
    fail "state.json was not written by promote_candidate_manifest"; block_ok=false
  fi
  ${block_ok}
) && PASS=$((PASS + 5)) || FAIL=$((FAIL + 1))

# ── The push deploy has already staged a different tree at <sha>: StageB
# must stage and activate its own tree beside it, never over it. ─────────────
(
  root="${WORK}/activation-push-tree-staged"; mkdir -p "${root}"
  rc="$(PRESTAGE_PUSH_TREE=1 run_activation_case "${root}")"
  push_tree="${root}/home/.teameet-alpha-sources/${SHA}"
  block_ok=true
  if [[ "${rc}" -eq 0 ]]; then
    pass "stageBFinal succeeds when the push deploy already staged a different tree for the same SHA"
  else
    fail "StageB collided with the push tree: rc=${rc} $(cat "${root}/stderr")"; block_ok=false
  fi
  if [[ "$(cat "${push_tree}/.source-sha256" 2>/dev/null)" == push-archive-sha256 ]]; then
    pass "the push tree at <sha> is left untouched"
  else
    fail "the push tree at <sha> was modified"; block_ok=false
  fi
  live_target="$(cd -P "${root}/home/teameet" 2>/dev/null && pwd)"
  if [[ "${live_target}" == */.teameet-alpha-sources/task168-stage-b-${SHA} ]]; then
    pass "live points at the StageB tree after activation"
  else
    fail "live does not point at the StageB tree: ${live_target}"; block_ok=false
  fi
  ${block_ok}
) && PASS=$((PASS + 3)) || FAIL=$((FAIL + 1))

# ── Negative: T7 (post-live-verify) fails -> no runtime-verification.json,
# an activation-stage.json diagnosis exists naming the step, exit non-zero,
# and no predecessor-image compose call is ever made. ─────────────────────
(
  root="${WORK}/activation-postlive-fails"; mkdir -p "${root}"
  rc="$(run_activation_case "${root}" health)"
  read -r local_bin local_state_dir local_release_state_dir <<< "$(activation_paths "${root}")"
  block_ok=true
  if [[ "${rc}" -ne 0 ]]; then
    pass "post-live-verify failure fails the activation step (rc=${rc})"
  else
    fail "post-live-verify failure did not fail the wrapper"; block_ok=false
  fi
  if [[ ! -f "${local_state_dir}/runtime-verification.json" ]]; then
    pass "no runtime-verification.json is written when post-live-verify fails"
  else
    fail "runtime-verification.json was written despite a failed post-live-verify"; block_ok=false
  fi
  if [[ -f "${local_state_dir}/activation-stage.json" ]] && \
    jq -e '.status=="ACTIVATION_DIAGNOSIS_REQUIRED" and .failedStep=="post-live-verify"' "${local_state_dir}/activation-stage.json" >/dev/null; then
    pass "activation-stage.json names 'post-live-verify' as the failed step"
  else
    fail "activation-stage.json is missing or does not name the correct failed step: $(cat "${local_state_dir}/activation-stage.json" 2>/dev/null)"; block_ok=false
  fi
  if grep -q "legacy-api-image\|legacy-worker-image" "${local_bin}/docker-calls.log"; then
    fail "a predecessor (legacy) image was referenced after M11 committed -- must never roll back"; block_ok=false
  else
    pass "no predecessor image is ever referenced once M11 has committed"
  fi
  ${block_ok}
) && PASS=$((PASS + 4)) || FAIL=$((FAIL + 1))

# ── Negative: activation itself fails (compose up) -> same contract: no
# receipt, diagnosis names the right step, no predecessor rollback. ───────
(
  root="${WORK}/activation-compose-fails"; mkdir -p "${root}"
  rc="$(run_activation_case "${root}" compose-up)"
  read -r local_bin local_state_dir local_release_state_dir <<< "$(activation_paths "${root}")"
  block_ok=true
  if [[ "${rc}" -ne 0 ]]; then
    pass "a compose-up failure fails the activation step (rc=${rc})"
  else
    fail "a compose-up failure did not fail the wrapper"; block_ok=false
  fi
  if [[ ! -f "${local_state_dir}/runtime-verification.json" ]]; then
    pass "no runtime-verification.json is written when compose-up fails"
  else
    fail "runtime-verification.json was written despite a failed compose-up"; block_ok=false
  fi
  if [[ -f "${local_state_dir}/activation-stage.json" ]] && \
    jq -e '.status=="ACTIVATION_DIAGNOSIS_REQUIRED" and .failedStep=="compose-up"' "${local_state_dir}/activation-stage.json" >/dev/null; then
    pass "activation-stage.json names 'compose-up' as the failed step"
  else
    fail "activation-stage.json is missing or does not name the correct failed step: $(cat "${local_state_dir}/activation-stage.json" 2>/dev/null)"; block_ok=false
  fi
  ${block_ok}
) && PASS=$((PASS + 3)) || FAIL=$((FAIL + 1))

# ── Mutation regression: writing runtime-verification.json BEFORE running
# post-live-verify (instead of letting T7 itself write it) must be caught —
# proves the positive case actually depends on T7 succeeding first, not
# merely on reaching that line. ────────────────────────────────────────────
(
  root="${WORK}/activation-mutation-premature-receipt"; mkdir -p "${root}/deploy"
  build_activation_fixture "${root}"
  write_activation_fake_docker "${bin}" health
  # The mutated script must live under a deploy/ directory alongside a copy
  # of task168-migration-contract.sh -- the real script locates it via
  # "$(dirname "${BASH_SOURCE[0]}")", which would otherwise resolve to this
  # temp root instead of the real deploy/ directory.
  cp "${ROOT}/deploy/task168-migration-contract.sh" "${root}/deploy/task168-migration-contract.sh"
  mutated="${root}/deploy/deploy-alpha-stage-b-mutated.sh"
  python3 - "${SCRIPT}" "${mutated}" <<'PY'
import sys
src_path, out_path = sys.argv[1], sys.argv[2]
text = open(src_path).read()
marker = 'activation_step="post-live-verify"\n'
assert marker in text, "could not find the post-live-verify activation_step marker to mutate"
injected = (
    marker
    + 'jq -n \'{schemaVersion:1,kind:"task168StageBRuntimeVerification",status:"COMPLETED",'
    + 'migrationReceiptSha256:("0"*64),'
    + 'manifestSha256:("0"*64),ledgerCount:11,driftCheck:"none",healthDbTrue:true,workerHealthy:true,'
    + 'completedAt:(now|todate)}\' > "${state_dir}/runtime-verification.json"\n'
)
open(out_path, "w").write(text.replace(marker, injected, 1))
PY
  chmod +x "${mutated}"
  rc=0
  ALPHA_HOME_DIR="${home}" ALPHA_LIVE_DIR="${live}" TASK168_STAGE=stageBFinal \
    ALPHA_RELEASE_STATE_DIR="${home}/.teameet-alpha-releases" \
    ALPHA_SOURCE_DIR="${source_dir}" ALPHA_MANIFEST_FILE="${manifest}" \
    ALPHA_MANIFEST_SHA256="$(sha256sum "${manifest}" | awk '{print $1}')" \
    ALPHA_SHA="${SHA}" ALPHA_RELEASE_VERSION="0.1.0-alpha.20260914.g111111111111" \
    ALPHA_ECR_REGISTRY="${registry}" ALPHA_AWS_REGION="ap-northeast-2" \
    ALPHA_SOURCE_BUCKET="b" ALPHA_SOURCE_VERSION_ID="v1" ALPHA_SOURCE_SHA256="$(printf 'c%.0s' {1..64})" \
    PATH="${bin}:${PATH}" bash "${mutated}" >"${root}/stdout" 2>"${root}/stderr" || rc=$?
  # health=fail means the real post-live-verify.sh would refuse -- but the
  # injected line writes a receipt BEFORE that call runs, so a script that
  # doesn't already have the real T7 script write its own receipt would
  # leak a false-positive runtime-verification.json here. Assert the real
  # (unmutated) script's own post-live-verify.sh still overwrites/refuses:
  # write_json_atomic in task168-stage-b-post-live-verify.sh is no-clobber,
  # so the injected receipt existing first makes the real T7 script itself
  # fail with "receipt already exists" -- proving premature writes are
  # unsafe by construction, not merely untested.
  if [[ "${rc}" -ne 0 ]] && grep -qi "already exists\|health check db is not true" "${root}/stderr"; then
    pass "writing runtime-verification.json before T7 runs is unsafe (mutation correctly detected: ${root##*/})"
  else
    fail "premature runtime-verification.json write was not caught: rc=${rc} $(cat "${root}/stderr" 2>/dev/null)"
  fi
) && PASS=$((PASS + 1)) || FAIL=$((FAIL + 1))

echo "== ${PASS} passed, ${FAIL} failed, ${SKIP} skipped =="
(( FAIL == 0 ))

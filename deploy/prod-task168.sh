#!/usr/bin/env bash

# Task 168 production Stage A / Stage B transition runner (alpha procedure
# ported to prod: external RDS, prod release state directory).
#
# Sourced-only: the caller `set -Eeuo pipefail`s and defines a `compose` bash
# array first (arrays cannot cross a process boundary). Entry point:
#   prod_task168_main stageA|stageB|verify
# Required environment: PROD_TASK168_DATABASE_URL, PROD_SOURCE_DIR,
# PROD_MANIFEST_FILE.
#
# Every call site here is `f || return 1`, which disables errexit for the
# whole body of `f` (subshells included) -- so every risky command below is
# checked explicitly instead of relying on `set -e`.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/prod-task168-common.sh"

readonly PROD_TASK168_M1=(
  20260908130000_v1_team_match_tournament_expand
  20260908150000_v1_operation_audit_team_match_expand
  20260908160000_v1_official_fact_team_match_scope
  20260908170000_v1_lineup_invalidation
  20260908180000_v1_staff_scope_team_match
  20260909000000_v1_tournament_result_lineage
  20260909110000_v1_operation_audit_canonical_binding
)
readonly PROD_TASK168_M8=20260910010000_v1_official_fact_source_history
readonly PROD_TASK168_M9=20260910020000_v1_canonical_game_db_guards
readonly PROD_TASK168_M10=20260910160000_v1_outbox_cutover_claim_gate
readonly PROD_TASK168_M11=20260911090000_retire_tournament_fixture_tables
readonly PROD_TASK168_M11_PINNED_SHA256=08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323
readonly PROD_TASK168_CUTOVER_TOOL_ARCHIVE_SHA256=829cbb214afc26c417947c864fd477647498003e06915ca20b4d2f8b44b80c4b

_sha256_file() { sha256sum "$1" | awk '{print $1}'; }
# GNU stat (`-c`, the prod EC2 host) vs BSD stat (`-f`, local macOS dev/test) --
# only the host-side `stat` invocation differs; docker behavior does not.
_stat_owner() { stat -c '%u:%g' "$1" 2>/dev/null || stat -f '%u:%g' "$1"; }
_migration_sql_path() { printf '%s/apps/v1_api/prisma/migrations/%s/migration.sql' "${PROD_SOURCE_DIR}" "$1"; }
_manifest_field() { jq -er "$1" "${PROD_MANIFEST_FILE}"; }
_manifest_migration_sha() {
  jq -er --arg n "$1" '.database.task168.migrations[] | select(.name==$n) | .sha256' "${PROD_MANIFEST_FILE}"
}

_task168_names_csv() {
  local name parts=()
  for name in "$@"; do parts+=("'${name}'"); done
  local IFS=,
  echo "${parts[*]}"
}
# The 10 names Stage A applies (never M11), and all 11.
_task168_pre_m11_csv() { _task168_names_csv "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}"; }
_task168_all_csv() { _task168_names_csv "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}" "${PROD_TASK168_M11}"; }

# Ruling R2's manifest shape, re-checked here: the runner never trusts an
# upstream validator.
_assert_manifest_schema() {
  local stage name
  stage="$(jq -r '.database.task168.stage // empty' "${PROD_MANIFEST_FILE}" 2>/dev/null)" || return 1
  [[ "${stage}" == stageA || "${stage}" == stageB ]] || {
    echo "[prod-task168] manifest database.task168.stage must be stageA or stageB" >&2
    return 1
  }
  jq -e '(.database.task168.migrations | length) == 11' "${PROD_MANIFEST_FILE}" >/dev/null || {
    echo "[prod-task168] manifest must list exactly 11 task168 migrations" >&2
    return 1
  }
  jq -e '((.database.task168.rehearsal.evidence // "") | length) > 0' "${PROD_MANIFEST_FILE}" >/dev/null || {
    echo "[prod-task168] manifest database.task168.rehearsal.evidence must be non-empty" >&2
    return 1
  }
  for name in "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}" "${PROD_TASK168_M11}"; do
    local sha
    sha="$(_manifest_migration_sha "${name}")" || {
      echo "[prod-task168] manifest is missing a checksum for ${name}" >&2
      return 1
    }
    [[ "${sha}" =~ ^[0-9a-f]{64}$ ]] || {
      echo "[prod-task168] manifest checksum for ${name} is not a valid sha256" >&2
      return 1
    }
  done
  [[ "$(_manifest_migration_sha "${PROD_TASK168_M11}")" == "${PROD_TASK168_M11_PINNED_SHA256}" ]] || {
    echo "[prod-task168] manifest M11 checksum does not match the pinned value" >&2
    return 1
  }
}

_expected_row() {
  local name="$1" sha
  sha="$(_manifest_migration_sha "${name}")" || return 1
  printf '%s|%s' "${name}" "${sha}"
}

_rows_equal() {
  local actual="$1" name expected=()
  shift
  for name in "$@"; do
    expected+=("$(_expected_row "${name}")") || return 1
  done
  local joined
  joined="$(printf '%s\n' "${expected[@]}")"
  [[ "${actual}" == "${joined}" ]]
}

# $1: pre_m1 (names sorting before M1) | all (every migration folder).
_source_migration_names() {
  local scope="$1" names
  names="$(find "${PROD_SOURCE_DIR}/apps/v1_api/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -exec basename '{}' \;)" || return 1
  if [[ "${scope}" == pre_m1 ]]; then
    LC_ALL=C sort <<< "${names}" | awk -v m1="${PROD_TASK168_M1[0]}" 'NF && $0 < m1'
  else
    LC_ALL=C sort <<< "${names}" | awk 'NF'
  fi
}

# $1: comm flag (-23 or -13), $2/$3: newline-joined name lists. Prints the
# count of lines comm reports. BSD comm (macOS) silently mis-reports unsorted
# input, so both inputs are checked with the portable `sort -c` first.
_name_set_comm_count() {
  local flag="$1" list_a="$2" list_b="$3" sort_rc comm_rc tmp count
  printf '%s\n' "${list_a}" | LC_ALL=C sort -c >/dev/null 2>&1 &&
    printf '%s\n' "${list_b}" | LC_ALL=C sort -c >/dev/null 2>&1 && sort_rc=0 || sort_rc=$?
  if [[ "${sort_rc}" -ne 0 ]]; then
    echo "[prod-task168] migration name list is not C-sorted (sort -c exit ${sort_rc}) -- refusing rather than trusting comm on possibly-misordered input" >&2
    return 2
  fi
  # Written to a file, not piped into grep: under pipefail a failing comm
  # would otherwise be masked by grep's own exit status.
  tmp="$(mktemp)" || return 2
  LC_ALL=C comm "${flag}" <(printf '%s\n' "${list_a}") <(printf '%s\n' "${list_b}") > "${tmp}"
  comm_rc=$?
  if [[ "${comm_rc}" -ne 0 ]]; then
    rm -f "${tmp}"
    echo "[prod-task168] comm ${flag} failed comparing migration name sets (exit ${comm_rc})" >&2
    return 2
  fi
  count="$(grep -c '.' "${tmp}")" || count=0
  rm -f "${tmp}"
  printf '%s' "${count}"
}

# $1: subset (the ledger may lag the source, but must not contain a name the
#     source does not ship) | exact (every source name applied, too).
# $2: pre_m1 | all -- `all` includes every migration after M11.
# Returns 0 clean, 1 violation (caller rejects), 2 query/setup failure --
# kept distinct so a DB outage never reads as a safe rejection.
_assert_ledger_name_set() {
  local mode="$1" scope="$2" label scope_sql source_names applied_names anomalous foreign missing comm_rc
  case "${scope}" in
    pre_m1) label='pre-M1'; scope_sql="migration_name < '${PROD_TASK168_M1[0]}'" ;;
    all) label='full'; scope_sql='TRUE' ;;
    *) echo "[prod-task168] internal error: unknown ledger scope '${scope}'" >&2; return 2 ;;
  esac
  source_names="$(_source_migration_names "${scope}")" || return 2
  [[ -n "${source_names}" ]] || {
    echo "[prod-task168] no ${label} migrations found under PROD_SOURCE_DIR -- cannot validate the ledger" >&2
    return 2
  }
  # Pending/failed (Prisma P3009) or finished-and-rolled-back rows. A clean
  # rollback (finished_at NULL, rolled_back_at set) is normal history.
  anomalous="$(prod_dbq "SELECT count(*) FROM \"_prisma_migrations\" WHERE ${scope_sql} AND ((finished_at IS NULL AND rolled_back_at IS NULL) OR (finished_at IS NOT NULL AND rolled_back_at IS NOT NULL))")" || return 2
  if [[ "${anomalous}" != 0 ]]; then
    echo "[prod-task168] ${label} migration ledger has ${anomalous} stuck or self-contradictory row(s) -- resolve them manually (docs/ops/prod-task168-transition-runbook.md)" >&2
    return 1
  fi
  # DISTINCT + ORDER BY requires the COLLATE "C" expression in the select
  # list; it pins the server's order to `LC_ALL=C sort`.
  applied_names="$(prod_dbq "SELECT DISTINCT migration_name COLLATE \"C\" FROM \"_prisma_migrations\" WHERE ${scope_sql} AND finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name COLLATE \"C\"")" || return 2
  if [[ -z "${applied_names}" ]]; then
    foreign=0
    missing="$(grep -c '.' <<< "${source_names}")" || missing=0
  else
    foreign="$(_name_set_comm_count -23 "${applied_names}" "${source_names}")" && comm_rc=0 || comm_rc=$?
    [[ "${comm_rc}" -eq 0 ]] || return 2
    missing="$(_name_set_comm_count -13 "${applied_names}" "${source_names}")" && comm_rc=0 || comm_rc=$?
    [[ "${comm_rc}" -eq 0 ]] || return 2
  fi
  if [[ "${foreign}" != 0 ]]; then
    echo "[prod-task168] ${label} ledger has ${foreign} applied migration name(s) PROD_SOURCE_DIR does not ship (a different branch's migration?)" >&2
    return 1
  fi
  if [[ "${mode}" == exact && "${missing}" != 0 ]]; then
    echo "[prod-task168] ${label} ledger is missing ${missing} migration(s) PROD_SOURCE_DIR ships -- Stage B requires all of them applied" >&2
    return 1
  fi
  return 0
}

# Stage B's gate before any receipt write or backfill: the whole ledger has
# no failed row and every source migration (M11 and everything after it) is
# applied. Otherwise the next ordinary deploy stops on Prisma P3009.
_stage_b_assert_full_ledger() {
  local rc
  _assert_ledger_name_set exact all && rc=0 || rc=$?
  [[ "${rc}" -eq 0 ]] && return 0
  echo "[prod-task168] Stage B refuses: the migration ledger is not fully applied -- manual inspection required, do not re-dispatch blindly (docs/ops/prod-task168-transition-runbook.md)" >&2
  return 1
}

# Same 0/1/2 contract as _assert_ledger_name_set. Stage A allows the ledger
# to lag the source (real prod did by 34 migrations); its "pre" migrate phase
# catches up.
_assert_stage_a_ledger_clean() {
  local pre_m1_rc bad m11_present
  _assert_ledger_name_set subset pre_m1 && pre_m1_rc=0 || pre_m1_rc=$?
  case "${pre_m1_rc}" in
    0) ;;
    1) return 1 ;;
    *) return 2 ;;
  esac
  bad="$(prod_dbq "SELECT count(*) FROM \"_prisma_migrations\" WHERE migration_name IN ($(_task168_pre_m11_csv)) AND NOT (finished_at IS NOT NULL AND rolled_back_at IS NULL)")" || return 2
  m11_present="$(prod_dbq "SELECT count(*) FROM \"_prisma_migrations\" WHERE migration_name = '${PROD_TASK168_M11}'")" || return 2
  [[ "${bad}" == 0 && "${m11_present}" == 0 ]]
}

# Prints one of fresh|precutover|committed|complete|reject on stdout and
# returns 0. Returns 1 only for a real query/connection failure (nothing
# printed) -- "reject" is itself a valid, safe determination, not an error.
task168_stage_a_state() {
  local clean_rc rows seals
  _assert_stage_a_ledger_clean && clean_rc=0 || clean_rc=$?
  case "${clean_rc}" in
    0) ;;
    1) echo reject; return 0 ;;
    *) return 1 ;;
  esac
  rows="$(prod_ledger_rows "$(_task168_pre_m11_csv)")" || return 1
  seals="$(prod_count_cutover_seals)" || return 1
  if [[ -z "${rows}" ]]; then
    if [[ "${seals}" == '0|0|0' ]]; then echo fresh; else echo reject; fi
    return 0
  fi
  if _rows_equal "${rows}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M10}"; then
    case "${seals}" in
      '0|0|0') echo precutover ;;
      '5|5|3') echo committed ;;
      *) echo reject ;;
    esac
    return 0
  fi
  if _rows_equal "${rows}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}"; then
    if [[ "${seals}" == '5|5|3' ]]; then echo complete; else echo reject; fi
    return 0
  fi
  echo reject
}

_stage_a_assert_receipt() {
  local path="$1" kind="$2" release_sha="$3" db_id="$4" api_image="$5"
  [[ -s "${path}" ]] || {
    echo "[prod-task168] expected an existing ${kind} receipt: ${path}" >&2
    return 1
  }
  jq -e --arg kind "${kind}" --arg release "${release_sha}" --arg db "${db_id}" --arg api "${api_image}" \
    '.schemaVersion==1 and .kind==$kind and .status=="COMPLETED" and .releaseSha==$release and .databaseIdentity==$db and .apiImage==$api' \
    "${path}" >/dev/null || {
    echo "[prod-task168] ${kind} receipt is not bound to this release/database: ${path}" >&2
    return 1
  }
}

# A receipt of this exact release/database/image with a terminal status lets
# a retry skip that step: prod_write_receipt refuses any rewrite that is not
# byte-identical, and a fresh write always carries a new timestamp.
_receipt_reusable() {
  local path="$1" kind="$2" release_sha="$3" db_id="$4" api_image="$5"
  [[ -s "${path}" ]] || return 1
  jq -e --arg kind "${kind}" --arg release "${release_sha}" --arg db "${db_id}" --arg api "${api_image}" \
    '.schemaVersion==1 and .kind==$kind and (.status=="COMPLETED" or .status=="ENTERED" or .status=="MIGRATION_COMMITTED") and .releaseSha==$release and .databaseIdentity==$db and .apiImage==$api' \
    "${path}" >/dev/null 2>&1
}

# v1_api and the worker are `restart: always`: a host reboot or docker
# restart between attempts brings the old writers back. Every stage entry
# stops them again and proves they are down before touching the database.
_stop_writers() {
  local api_running worker_running
  "${compose[@]}" stop v1_api v1_game_operations_worker || {
    echo "[prod-task168] compose stop failed" >&2
    return 1
  }
  # Captured separately: `[[ -z "$(cmd)" ]]` would read a failing `ps` as
  # "nothing running".
  api_running="$("${compose[@]}" ps -q v1_api)" || {
    echo "[prod-task168] compose ps v1_api failed" >&2
    return 1
  }
  worker_running="$("${compose[@]}" ps -q v1_game_operations_worker)" || {
    echo "[prod-task168] compose ps v1_game_operations_worker failed" >&2
    return 1
  }
  [[ -z "${api_running}" && -z "${worker_running}" ]] || {
    echo "[prod-task168] writers did not quiesce" >&2
    return 1
  }
}

_stage_a_quiesce() {
  local release_sha="$1" api_image="$2" db_id="$3" quiesce_receipt="$4" content
  _stop_writers || return 1
  _receipt_reusable "${quiesce_receipt}" quiesce "${release_sha}" "${db_id}" "${api_image}" && return 0
  content="$(jq -nc --arg release "${release_sha}" --arg api "${api_image}" --arg db "${db_id}" \
    --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{schemaVersion:1,kind:"quiesce",status:"COMPLETED",releaseSha:$release,apiImage:$api,databaseIdentity:$db,services:["v1_api","v1_game_operations_worker"],completedAt:$at}')" || return 1
  prod_write_receipt "${quiesce_receipt}" "${content}"
}

# pg_dump streams to the host's own redirect, so the dump is owned by the
# host user rather than the container's uid.
_stage_a_backup() {
  local release_sha="$1" api_image="$2" db_id="$3" backup_file="$4" backup_receipt="$5"
  local network content existing_sha
  if _receipt_reusable "${backup_receipt}" backup "${release_sha}" "${db_id}" "${api_image}" && [[ -s "${backup_file}" ]]; then
    existing_sha="$(jq -er '.backupSha256' "${backup_receipt}" 2>/dev/null)" || existing_sha=''
    if [[ -n "${existing_sha}" && "$(_sha256_file "${backup_file}")" == "${existing_sha}" ]]; then
      echo "[prod-task168] reusing existing backup for this release" >&2
      return 0
    fi
  fi
  network="$(prod_task168_assert_network)" || return 1
  _prod_task168_docker_argv
  "${_PROD_TASK168_DOCKER_ARGV[@]}" run --rm --network "${network}" \
    --env-file /dev/stdin \
    postgres:16-alpine sh -c 'exec pg_dump "$DATABASE_URL" -Fc' \
    < <(printf 'DATABASE_URL=%s\n' "${PROD_TASK168_DATABASE_URL}") \
    > "${backup_file}" || {
    echo "[prod-task168] pg_dump failed" >&2
    return 1
  }
  chmod 600 "${backup_file}" || return 1
  [[ -s "${backup_file}" ]] || {
    echo "[prod-task168] backup file is empty" >&2
    return 1
  }
  # A truncated/corrupt dump must never be trusted as a real backup.
  "${_PROD_TASK168_DOCKER_ARGV[@]}" run --rm -v "${backup_file}:/work/backup.dump:ro" postgres:16-alpine \
    pg_restore --list /work/backup.dump >/dev/null || {
    echo "[prod-task168] backup archive failed pg_restore --list verification" >&2
    return 1
  }
  content="$(jq -nc --arg release "${release_sha}" --arg api "${api_image}" --arg db "${db_id}" \
    --arg path "${backup_file}" --arg sha "$(_sha256_file "${backup_file}")" \
    --argjson bytes "$(wc -c < "${backup_file}" | tr -d ' ')" \
    --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{schemaVersion:1,kind:"backup",status:"COMPLETED",releaseSha:$release,apiImage:$api,databaseIdentity:$db,backupPath:$path,backupSha256:$sha,backupBytes:$bytes,completedAt:$at}')" || return 1
  prod_write_receipt "${backup_receipt}" "${content}"
}

# Applies a throwaway tree of pre-M1 + M1 + (pre: M8,M10 | post: M8,M9,M10)
# -- never M11, whatever PROD_SOURCE_DIR ships -- with the candidate API
# image (Ruling R3), not the compose service.
_stage_a_run_migrations() {
  local phase="$1" api_image="$2"
  (
    set -Eeuo pipefail
    local tmp owner network name
    tmp="$(mktemp -d)" || exit 1
    trap 'rm -rf "${tmp}"' EXIT
    mkdir -p "${tmp}/migrations" || exit 1
    cp "${PROD_SOURCE_DIR}/apps/v1_api/prisma/migrations/migration_lock.toml" "${tmp}/migrations/" || exit 1
    cp "${PROD_SOURCE_DIR}/apps/v1_api/prisma/schema.prisma" "${tmp}/schema.prisma" || exit 1
    copy_migration() { cp -R "${PROD_SOURCE_DIR}/apps/v1_api/prisma/migrations/$1" "${tmp}/migrations/$1" || exit 1; }
    while IFS= read -r name; do
      [[ "${name}" < "${PROD_TASK168_M1[0]}" ]] && copy_migration "${name}"
    done < <(find "${PROD_SOURCE_DIR}/apps/v1_api/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -exec basename '{}' \; | LC_ALL=C sort)
    for name in "${PROD_TASK168_M1[@]}"; do copy_migration "${name}"; done
    case "${phase}" in
      pre) copy_migration "${PROD_TASK168_M8}"; copy_migration "${PROD_TASK168_M10}" ;;
      post) copy_migration "${PROD_TASK168_M8}"; copy_migration "${PROD_TASK168_M9}"; copy_migration "${PROD_TASK168_M10}" ;;
      *) echo "[prod-task168] unknown migration phase: ${phase}" >&2; exit 1 ;;
    esac
    owner="$(_stat_owner "${tmp}")" || exit 1
    network="$(prod_task168_assert_network)" || exit 1
    _prod_task168_docker_argv
    "${_PROD_TASK168_DOCKER_ARGV[@]}" run --rm --network "${network}" --user "${owner}" \
      --env-file /dev/stdin \
      -v "${tmp}:/tmp/task168" \
      "${api_image}" sh -c 'cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy --schema /tmp/task168/schema.prisma' \
      < <(printf 'DATABASE_URL=%s\n' "${PROD_TASK168_DATABASE_URL}") || exit 1
  )
}

# The image must be the build of the pinned v7 archive (the Dockerfile's
# task168-cutover-tool stage writes this attestation).
_stage_a_assert_tool_attestation() {
  local tool_image="$1" attestation
  _prod_task168_docker_argv
  attestation="$("${_PROD_TASK168_DOCKER_ARGV[@]}" run --rm --entrypoint cat "${tool_image}" /opt/task168/tool-attestation.json)" || {
    echo "[prod-task168] cutover tool attestation is unreadable in ${tool_image}" >&2
    return 1
  }
  jq -e --arg sha "${PROD_TASK168_CUTOVER_TOOL_ARCHIVE_SHA256}" '.schemaVersion==1 and .archiveSha256==$sha and .generatedClient==true' \
    <<< "${attestation}" >/dev/null 2>&1 || {
    echo "[prod-task168] cutover tool attestation does not match the pinned archive" >&2
    return 1
  }
}

# Exit 0: the report must exist and be a clean COMPLETED result. Nonzero: the
# seals decide -- 5|5|3 means the cutover committed before the tool exited.
_stage_a_run_cutover_tool() {
  local tool_image="$1" report_file="$2"
  if [[ -e "${report_file}" ]]; then
    # The tool writes a FAILED report even on preflight failure. Only that,
    # with no seal yet, is safe to archive and retry -- the tool must never
    # run twice against a database it may have committed.
    local seals prior_status
    seals="$(prod_count_cutover_seals)" || return 1
    prior_status="$(jq -r '.status // empty' "${report_file}" 2>/dev/null)" || prior_status=''
    if [[ "${seals}" == '0|0|0' && "${prior_status}" == FAILED ]]; then
      local archived
      archived="${report_file%.json}.failed-$(date -u +%s).json"
      mv "${report_file}" "${archived}" || {
        echo "[prod-task168] could not archive the prior failed cutover report: ${report_file}" >&2
        return 1
      }
      echo "[prod-task168] archived prior ${prior_status} cutover report to ${archived} (seals still 0|0|0) -- retrying" >&2
    else
      echo "[prod-task168] cutover report already exists: ${report_file} (status=${prior_status:-<unreadable>}, seals=${seals})" >&2
      return 1
    fi
  fi
  local network owner tool_rc
  _stage_a_assert_tool_attestation "${tool_image}" || return 1
  network="$(prod_task168_assert_network)" || return 1
  owner="$(_stat_owner "$(dirname "${report_file}")")" || return 1
  _prod_task168_docker_argv
  "${_PROD_TASK168_DOCKER_ARGV[@]}" run --rm --network "${network}" --user "${owner}" \
    --env-file /dev/stdin \
    -v "$(dirname "${report_file}"):/work" \
    "${tool_image}" --report "/work/$(basename "${report_file}")" \
    < <(printf 'DATABASE_URL=%s\n' "${PROD_TASK168_DATABASE_URL}") && tool_rc=0 || tool_rc=$?
  if [[ "${tool_rc}" -eq 0 ]]; then
    [[ -s "${report_file}" ]] || {
      echo "[prod-task168] cutover tool exited 0 but wrote no report file" >&2
      return 1
    }
    jq -e '.status=="COMPLETED" and .result.verification.remainingLegacyGameLinks==0 and .result.verification.remainingLegacyStaffScopes==0 and .result.verification.remainingLegacyAuditScopes==0' "${report_file}" >/dev/null || {
      echo "[prod-task168] cutover tool exited 0 but its report is not a clean COMPLETED result" >&2
      return 1
    }
    return 0
  fi
  local seals
  seals="$(prod_count_cutover_seals)" || return 1
  if [[ "${seals}" == '5|5|3' ]]; then
    echo "[prod-task168] cutover tool exited ${tool_rc} but seals are already committed -- continuing" >&2
    return 0
  fi
  echo "[prod-task168] cutover tool failed (exit ${tool_rc}) and no seals are present -- refusing" >&2
  return 1
}

_stage_a_write_transition() {
  local release_sha="$1" api_image="$2" tool_image="$3" db_id="$4" quiesce_receipt="$5" backup_receipt="$6" backup_file="$7" report_file="$8" transition_receipt="$9"
  local migrations_json content
  [[ -s "${report_file}" ]] || {
    echo "[prod-task168] cannot write transition receipt: cutover report is missing" >&2
    return 1
  }
  migrations_json="$(jq -c '.database.task168.migrations' "${PROD_MANIFEST_FILE}")" || return 1
  content="$(jq -nc \
    --arg releaseSha "${release_sha}" \
    --arg apiImage "${api_image}" \
    --arg toolImage "${tool_image}" \
    --arg databaseIdentity "${db_id}" \
    --argjson migrations "${migrations_json}" \
    --arg quiesceReceipt "${quiesce_receipt}" \
    --arg quiesceReceiptSha256 "$(prod_receipt_sha "${quiesce_receipt}")" \
    --arg backupReceipt "${backup_receipt}" \
    --arg backupReceiptSha256 "$(prod_receipt_sha "${backup_receipt}")" \
    --arg backupPath "${backup_file}" \
    --arg backupSha256 "$(prod_receipt_sha "${backup_file}")" \
    --arg reportPath "${report_file}" \
    --arg cutoverReportSha256 "$(prod_receipt_sha "${report_file}")" \
    --arg completedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{schemaVersion:1,kind:"transition",status:"COMPLETED",stage:"stageA",releaseSha:$releaseSha,apiImage:$apiImage,toolImage:$toolImage,databaseIdentity:$databaseIdentity,migrations:$migrations,quiesceReceipt:$quiesceReceipt,quiesceReceiptSha256:$quiesceReceiptSha256,backupReceipt:$backupReceipt,backupReceiptSha256:$backupReceiptSha256,backupPath:$backupPath,backupSha256:$backupSha256,cutoverReport:$reportPath,cutoverReportSha256:$cutoverReportSha256,completedAt:$completedAt}')" || return 1
  prod_write_receipt "${transition_receipt}" "${content}"
}

_stage_a_verify_transition_receipt() {
  local transition_receipt="$1" db_id="$2"
  [[ -s "${transition_receipt}" ]] || {
    echo "[prod-task168] Stage A reports complete but transition receipt is missing" >&2
    return 1
  }
  jq -e --arg db "${db_id}" '.schemaVersion==1 and .kind=="transition" and .status=="COMPLETED" and .stage=="stageA" and .databaseIdentity==$db' "${transition_receipt}" >/dev/null || {
    echo "[prod-task168] transition receipt does not match this database identity" >&2
    return 1
  }
  _assert_transition_bindings "${transition_receipt}"
}

task168_stage_a() {
  : "${PROD_SOURCE_DIR:?PROD_SOURCE_DIR is required}"
  : "${PROD_MANIFEST_FILE:?PROD_MANIFEST_FILE is required}"
  declare -p compose &>/dev/null || {
    echo "[prod-task168] the caller must define the 'compose' array before invoking stageA" >&2
    return 1
  }
  _assert_manifest_schema || return 1
  [[ "$(jq -r '.database.task168.stage' "${PROD_MANIFEST_FILE}")" == stageA ]] || {
    echo "[prod-task168] manifest is not a Stage A manifest" >&2
    return 1
  }

  local name
  for name in "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}"; do
    local path expected actual
    path="$(_migration_sql_path "${name}")"
    expected="$(_manifest_migration_sha "${name}")" || return 1
    [[ -f "${path}" ]] || { echo "[prod-task168] missing migration source: ${name}" >&2; return 1; }
    actual="$(_sha256_file "${path}")" || return 1
    [[ "${actual}" == "${expected}" ]] || { echo "[prod-task168] raw migration checksum mismatch: ${name}" >&2; return 1; }
  done
  # Ruling R9: PROD_SOURCE_DIR carries M11 during Stage A too (one dev
  # source for both stages); _stage_a_run_migrations never copies it.

  local release_sha api_image tool_image db_id state_dir report_dir state
  release_sha="$(_manifest_field '.release.sha')" || return 1
  api_image="$(_manifest_field '.images.api.uri')" || return 1
  tool_image="$(_manifest_field '.images.cutoverTool.uri')" || return 1
  db_id="$(prod_db_identity)" || return 1
  state_dir="${PROD_TASK168_STATE_ROOT}/${release_sha}"
  report_dir="${state_dir}/report"

  state="$(task168_stage_a_state)" || return 1

  local quiesce_receipt="${state_dir}/quiesce.json"
  local backup_receipt="${state_dir}/backup.json"
  local backup_file="${state_dir}/backup.dump"
  local report_file="${report_dir}/cutover-report.json"
  local transition_receipt="${state_dir}/transition.json"

  case "${state}" in
    complete)
      _stage_a_verify_transition_receipt "${transition_receipt}" "${db_id}" || return 1
      prod_assert_cutover_seals || return 1
      echo "[prod-task168] Stage A already complete for this database"
      return 0
      ;;
    reject)
      echo "[prod-task168] Stage A refuses: prod ledger/seal state is not a recognized Stage A state" >&2
      return 1
      ;;
    fresh|precutover|committed) ;;
    *)
      echo "[prod-task168] internal error: unrecognized Stage A state '${state}'" >&2
      return 1
      ;;
  esac

  install -d -m 700 "${state_dir}" "${report_dir}" || return 1

  case "${state}" in
    fresh)
      _stage_a_quiesce "${release_sha}" "${api_image}" "${db_id}" "${quiesce_receipt}" || return 1
      _stage_a_backup "${release_sha}" "${api_image}" "${db_id}" "${backup_file}" "${backup_receipt}" || return 1
      _stage_a_run_migrations pre "${api_image}" || return 1
      local pre_rows
      pre_rows="$(prod_ledger_rows "$(_task168_pre_m11_csv)")" || return 1
      _rows_equal "${pre_rows}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M10}" ||
        { echo "[prod-task168] pre-cutover ledger does not match the expected M1..M8,M10 set" >&2; return 1; }
      _stage_a_run_cutover_tool "${tool_image}" "${report_file}" || return 1
      ;;
    precutover)
      _stage_a_assert_receipt "${quiesce_receipt}" quiesce "${release_sha}" "${db_id}" "${api_image}" || return 1
      _stage_a_assert_receipt "${backup_receipt}" backup "${release_sha}" "${db_id}" "${api_image}" || return 1
      [[ -s "${backup_file}" ]] || { echo "[prod-task168] precutover resume is missing the backup file" >&2; return 1; }
      _stop_writers || return 1
      _stage_a_run_cutover_tool "${tool_image}" "${report_file}" || return 1
      ;;
    committed)
      _stage_a_assert_receipt "${quiesce_receipt}" quiesce "${release_sha}" "${db_id}" "${api_image}" || return 1
      _stage_a_assert_receipt "${backup_receipt}" backup "${release_sha}" "${db_id}" "${api_image}" || return 1
      [[ -s "${backup_file}" ]] || { echo "[prod-task168] committed resume is missing the backup file" >&2; return 1; }
      _stop_writers || return 1
      # Seals read 5|5|3: the tool already committed and must not run again.
      # Its report must still show zero legacy links.
      [[ -s "${report_file}" ]] || { echo "[prod-task168] committed resume is missing the cutover report" >&2; return 1; }
      jq -e '(.status=="COMPLETED" or .status=="COMPLETED_WITH_GATE_RELEASE_ERROR") and .result.verification.remainingLegacyGameLinks==0 and .result.verification.remainingLegacyStaffScopes==0 and .result.verification.remainingLegacyAuditScopes==0' "${report_file}" >/dev/null || {
        echo "[prod-task168] committed resume's cutover report is not a recognized completed status with zero legacy links" >&2
        return 1
      }
      ;;
  esac

  _stage_a_run_migrations post "${api_image}" || return 1
  local final_rows
  final_rows="$(prod_ledger_rows "$(_task168_pre_m11_csv)")" || return 1
  _rows_equal "${final_rows}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}" ||
    { echo "[prod-task168] post-M9 ledger does not match the expected M1..M10 set" >&2; return 1; }
  prod_assert_cutover_seals || return 1

  _stage_a_write_transition "${release_sha}" "${api_image}" "${tool_image}" "${db_id}" \
    "${quiesce_receipt}" "${backup_receipt}" "${backup_file}" "${report_file}" "${transition_receipt}" || return 1

  echo "[prod-task168] Stage A complete — run task168_stage=stageB"
}

# Exactly one COMPLETED Stage A transition receipt for the given database
# identity, or empty (caller treats "not found" and "more than one" the same:
# refuse). Also used by `verify` to locate the state directory.
_stage_b_find_transition_receipt() {
  local db_id="$1"
  local candidates=() candidate matches=0 found=''
  shopt -s nullglob
  candidates=("${PROD_TASK168_STATE_ROOT}"/*/transition.json)
  shopt -u nullglob
  for candidate in "${candidates[@]}"; do
    if jq -e --arg db "${db_id}" '.schemaVersion==1 and .kind=="transition" and .status=="COMPLETED" and .stage=="stageA" and .databaseIdentity==$db' "${candidate}" >/dev/null 2>&1; then
      found="${candidate}"
      matches=$((matches + 1))
    fi
  done
  [[ "${matches}" -eq 1 ]] || return 1
  printf '%s' "${found}"
}

_assert_transition_bindings() {
  local receipt="$1" quiesce_path backup_receipt_path backup_file_path report_path
  quiesce_path="$(jq -er '.quiesceReceipt' "${receipt}")" || return 1
  backup_receipt_path="$(jq -er '.backupReceipt' "${receipt}")" || return 1
  backup_file_path="$(jq -er '.backupPath' "${receipt}")" || return 1
  report_path="$(jq -er '.cutoverReport' "${receipt}")" || return 1
  [[ "$(prod_receipt_sha "${quiesce_path}")" == "$(jq -er '.quiesceReceiptSha256' "${receipt}")" ]] || {
    echo "[prod-task168] transition quiesce evidence changed" >&2
    return 1
  }
  [[ "$(prod_receipt_sha "${backup_receipt_path}")" == "$(jq -er '.backupReceiptSha256' "${receipt}")" ]] || {
    echo "[prod-task168] transition backup receipt evidence changed" >&2
    return 1
  }
  [[ -s "${backup_file_path}" && "$(prod_receipt_sha "${backup_file_path}")" == "$(jq -er '.backupSha256' "${receipt}")" ]] || {
    echo "[prod-task168] transition backup file evidence changed" >&2
    return 1
  }
  [[ -s "${report_path}" && "$(prod_receipt_sha "${report_path}")" == "$(jq -er '.cutoverReportSha256' "${receipt}")" ]] || {
    echo "[prod-task168] transition cutover report evidence changed" >&2
    return 1
  }
}

_write_migration_stage_receipt() {
  local receipt="$1" release_sha="$2" api_image="$3" db_id="$4" ledger_rows="$5" applied_count content
  applied_count="$(grep -c '.' <<< "${ledger_rows}")" || return 1
  content="$(jq -nc --arg release "${release_sha}" --arg api "${api_image}" --arg db "${db_id}" --argjson applied "${applied_count}" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{schemaVersion:1,kind:"migrationStage",status:"MIGRATION_COMMITTED",releaseSha:$release,apiImage:$api,databaseIdentity:$db,appliedCount:$applied,completedAt:$at}')" || return 1
  prod_write_receipt "${receipt}" "${content}"
}

task168_stage_b() {
  : "${PROD_SOURCE_DIR:?PROD_SOURCE_DIR is required}"
  : "${PROD_MANIFEST_FILE:?PROD_MANIFEST_FILE is required}"
  declare -p compose &>/dev/null || {
    echo "[prod-task168] the caller must define the 'compose' array before invoking stageB" >&2
    return 1
  }
  _assert_manifest_schema || return 1
  [[ "$(jq -r '.database.task168.stage' "${PROD_MANIFEST_FILE}")" == stageB ]] || {
    echo "[prod-task168] manifest is not a Stage B manifest" >&2
    return 1
  }

  local release_sha api_image db_id
  release_sha="$(_manifest_field '.release.sha')" || return 1
  api_image="$(_manifest_field '.images.api.uri')" || return 1
  db_id="$(prod_db_identity)" || return 1

  local transition_receipt
  transition_receipt="$(_stage_b_find_transition_receipt "${db_id}")" || {
    echo "[prod-task168] Stage B refuses: no unique Stage A transition receipt for this database" >&2
    return 1
  }
  _assert_transition_bindings "${transition_receipt}" || return 1
  # Stage A evidence must belong to this release and pin the same checksums.
  jq -e --arg r "${release_sha}" '.releaseSha==$r' "${transition_receipt}" >/dev/null || {
    echo "[prod-task168] Stage B refuses: transition receipt's releaseSha does not match this manifest" >&2
    return 1
  }
  local transition_migrations manifest_migrations
  transition_migrations="$(jq -Sc '.migrations | sort_by(.name)' "${transition_receipt}")" || return 1
  manifest_migrations="$(jq -Sc '.database.task168.migrations | sort_by(.name)' "${PROD_MANIFEST_FILE}")" || return 1
  [[ "${transition_migrations}" == "${manifest_migrations}" ]] || {
    echo "[prod-task168] Stage B refuses: manifest migration checksums do not match the Stage A transition receipt" >&2
    return 1
  }

  # C2: writers stay down from Stage A until Stage B activates the release.
  _stop_writers || return 1

  local state_dir migration_stage_receipt m11_entry_receipt network ledger_rows
  state_dir="$(dirname "${transition_receipt}")"
  migration_stage_receipt="${state_dir}/migration-stage.json"
  m11_entry_receipt="${state_dir}/m11-entry.json"

  # Once M11 has run, prod_assert_cutover_seals cannot even parse (it casts
  # to tables M11 drops): post-M11 paths check prod_assert_legacy_tables_retired.
  if _receipt_reusable "${migration_stage_receipt}" migrationStage "${release_sha}" "${db_id}" "${api_image}"; then
    prod_assert_legacy_tables_retired || return 1
    ledger_rows="$(prod_ledger_rows "$(_task168_all_csv)")" || return 1
    _rows_equal "${ledger_rows}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}" "${PROD_TASK168_M11}" ||
      { echo "[prod-task168] Stage B resume refuses: ledger no longer shows the committed M11 set" >&2; return 1; }
    _stage_b_assert_full_ledger || return 1
  else
    _assert_ledger_name_set exact pre_m1 || return 1
    # All 11 names, so an M11 applied without a receipt shows up here.
    ledger_rows="$(prod_ledger_rows "$(_task168_all_csv)")" || return 1

    local m11_path m11_sha
    m11_path="$(_migration_sql_path "${PROD_TASK168_M11}")"
    [[ -f "${m11_path}" ]] || { echo "[prod-task168] M11 migration source is missing" >&2; return 1; }
    m11_sha="$(_sha256_file "${m11_path}")" || return 1
    [[ "${m11_sha}" == "${PROD_TASK168_M11_PINNED_SHA256}" ]] || {
      echo "[prod-task168] M11 source checksum does not match the pinned value" >&2
      return 1
    }

    if _rows_equal "${ledger_rows}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}" "${PROD_TASK168_M11}"; then
      # M11 is applied but migration-stage.json is not (a later migration
      # failed, or the run died before the receipt): resume only when
      # m11-entry.json proves this Stage B run applied it.
      prod_assert_legacy_tables_retired || return 1
      if ! _receipt_reusable "${m11_entry_receipt}" m11Entry "${release_sha}" "${db_id}" "${api_image}"; then
        echo "[prod-task168] Stage B refuses: ledger already shows the full M1..M11 set but there is no matching m11-entry.json for this release/database (M11 applied out-of-band?)" >&2
        return 1
      fi
      echo "[prod-task168] M11 already applied and m11-entry.json confirms this Stage B run -- re-running migrate deploy for anything after M11" >&2
    else
      _rows_equal "${ledger_rows}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}" ||
        { echo "[prod-task168] Stage B refuses: prod ledger is not exactly the Stage A M1..M10 set" >&2; return 1; }
      prod_assert_cutover_seals || return 1
      if ! _receipt_reusable "${m11_entry_receipt}" m11Entry "${release_sha}" "${db_id}" "${api_image}"; then
        local entry_content
        entry_content="$(jq -nc --arg release "${release_sha}" --arg api "${api_image}" --arg db "${db_id}" --arg sha "${m11_sha}" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
          '{schemaVersion:1,kind:"m11Entry",status:"ENTERED",releaseSha:$release,apiImage:$api,databaseIdentity:$db,migrationSha256:$sha,enteredAt:$at}')" || return 1
        prod_write_receipt "${m11_entry_receipt}" "${entry_content}" || return 1
      fi
    fi

    # The packaged release source as-is (read-only): M11 and every migration
    # after it. Idempotent on resume -- Prisma skips what is applied, and a
    # failed row left in the ledger makes it fail (P3009) instead.
    network="$(prod_task168_assert_network)" || return 1
    _prod_task168_docker_argv
    "${_PROD_TASK168_DOCKER_ARGV[@]}" run --rm --network "${network}" \
      --env-file /dev/stdin \
      -v "${PROD_SOURCE_DIR}/apps/v1_api/prisma:/tmp/task168-prisma:ro" \
      "${api_image}" sh -c 'cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy --schema /tmp/task168-prisma/schema.prisma' \
      < <(printf 'DATABASE_URL=%s\n' "${PROD_TASK168_DATABASE_URL}") || {
      echo "[prod-task168] Stage B prisma migrate deploy failed (M11 or a migration after it) -- inspect the ledger before any retry (docs/ops/prod-task168-transition-runbook.md)" >&2
      return 1
    }

    ledger_rows="$(prod_ledger_rows "$(_task168_all_csv)")" || return 1
    _rows_equal "${ledger_rows}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}" "${PROD_TASK168_M11}" ||
      { echo "[prod-task168] post-M11 ledger does not match the expected full set" >&2; return 1; }
    _stage_b_assert_full_ledger || return 1
    _write_migration_stage_receipt "${migration_stage_receipt}" "${release_sha}" "${api_image}" "${db_id}" "${ledger_rows}" || return 1
  fi

  network="$(prod_task168_assert_network)" || return 1
  _prod_task168_docker_argv
  "${_PROD_TASK168_DOCKER_ARGV[@]}" run --rm --network "${network}" \
    --env-file /dev/stdin \
    "${api_image}" sh -c 'cd /app/apps/v1_api && node dist/src/tournaments/migration/tournament-award-recipient-backfill.cli.js' \
    < <(printf 'DATABASE_URL=%s\n' "${PROD_TASK168_DATABASE_URL}") || {
    echo "[prod-task168] tournament award recipient backfill failed" >&2
    return 1
  }

  echo "[prod-task168] Stage B migration commit complete — activation continues in deploy-prod.sh"
}

# Prints every id the paginated public endpoint exposes, one per line.
# $1 first-page URL, $2 jq filter emitting the page's ids (must raise on a
# wrong shape), $3 jq filter emitting the next cursor or "" when done.
# All failures are explicit: callers run this under `||`.
_verify_collect_ids() {
  local first_url="$1" ids_filter="$2" next_filter="$3"
  local url="$1" sep='?' page=0 body page_ids cursor encoded id
  [[ "${first_url}" != *\?* ]] || sep='&'
  while :; do
    page=$((page + 1))
    [[ "${page}" -le 500 ]] || { echo "[prod-task168] ${first_url}: pagination exceeded 500 pages" >&2; return 1; }
    body="$(curl -fsS --connect-timeout 3 --max-time 10 "${url}")" || {
      echo "[prod-task168] request failed: ${url}" >&2
      return 1
    }
    page_ids="$(jq -r "${ids_filter}" <<< "${body}" 2>/dev/null)" || {
      echo "[prod-task168] response has an unexpected shape: ${url}" >&2
      return 1
    }
    while IFS= read -r id; do
      [[ -n "${id}" ]] || continue
      [[ "${id}" =~ ^[A-Za-z0-9_-]+$ ]] || { echo "[prod-task168] unexpected id format in ${url}" >&2; return 1; }
      printf '%s\n' "${id}"
    done <<< "${page_ids}"
    cursor="$(jq -r "${next_filter}" <<< "${body}" 2>/dev/null)" || {
      echo "[prod-task168] response has an unexpected pagination shape: ${url}" >&2
      return 1
    }
    [[ -n "${cursor}" ]] || return 0
    encoded="$(jq -rn --arg c "${cursor}" '$c|@uri')" || return 1
    url="${first_url}${sep}cursor=${encoded}"
  done
}

# $1 URL, $2 label. Nonzero (with the reason) unless HTTP 200.
_verify_expect_200() {
  local url="$1" label="$2" code curl_rc
  code="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 3 --max-time 10 "${url}")" && curl_rc=0 || curl_rc=$?
  [[ "${curl_rc}" -eq 0 && "${code}" == 200 ]] && return 0
  echo "[prod-task168] ${label} non-200 (${code:-none}, curl exit ${curl_rc}): ${url}" >&2
  return 1
}

readonly _VERIFY_LIST_IDS='.data.items | if type == "array" then .[].id | if type == "string" then . else error("id") end else error("items") end'
readonly _VERIFY_LIST_NEXT='.data.pageInfo | if .hasNext == false then "" elif .hasNext == true and (.nextCursor | type) == "string" and (.nextCursor | length) > 0 then .nextCursor else error("pageInfo") end'
readonly _VERIFY_SCHEDULE_IDS='.data | if (.items | type) == "array" and (.unscheduled | type) == "array" then (.items[], .unscheduled[]) | .fixtureId | if type == "string" then . else error("fixtureId") end else error("schedule") end'
readonly _VERIFY_SCHEDULE_NEXT='.data.nextCursor | if . == null then "" elif type == "string" and length > 0 then . else error("nextCursor") end'

# After deploy-prod.sh's health check, before promotion. Checks only what the
# public API itself exposes: every listed tournament's detail, and every match
# its public schedule lists. Draft/unpublished tournaments expose nothing and
# are never probed. Zero public matches fails: the prod dump this was
# rehearsed on has 32 public fixtures in 2 published tournaments.
task168_verify() {
  local base_url="${PROD_TASK168_VERIFY_BASE_URL:-http://127.0.0.1:8121/api/v1}"
  local db_id state_dir transition_receipt
  db_id="$(prod_db_identity)" || return 1
  transition_receipt="$(_stage_b_find_transition_receipt "${db_id}")" || {
    echo "[prod-task168] verify refuses: no Stage A transition receipt for this database" >&2
    return 1
  }
  state_dir="$(dirname "${transition_receipt}")"

  local failures=0 checked=0 tournament_count=0 match_count=0 tournament_ids='' tid match_ids fid
  tournament_ids="$(_verify_collect_ids "${base_url}/tournaments?limit=50" "${_VERIFY_LIST_IDS}" "${_VERIFY_LIST_NEXT}")" ||
    failures=$((failures + 1))
  tournament_ids="$(awk 'NF' <<< "${tournament_ids}" | LC_ALL=C sort -u)"
  if [[ -z "${tournament_ids}" ]]; then
    echo "[prod-task168] verify: zero public tournaments after full pagination" >&2
    failures=$((failures + 1))
  fi

  while IFS= read -r tid; do
    [[ -n "${tid}" ]] || continue
    tournament_count=$((tournament_count + 1))
    checked=$((checked + 1))
    _verify_expect_200 "${base_url}/tournaments/${tid}" 'tournament detail' || failures=$((failures + 1))
    match_ids="$(_verify_collect_ids "${base_url}/tournaments/${tid}/schedule?limit=100" "${_VERIFY_SCHEDULE_IDS}" "${_VERIFY_SCHEDULE_NEXT}")" || {
      failures=$((failures + 1))
      continue
    }
    # `unscheduled` repeats on every schedule page.
    match_ids="$(awk 'NF' <<< "${match_ids}" | LC_ALL=C sort -u)"
    while IFS= read -r fid; do
      [[ -n "${fid}" ]] || continue
      match_count=$((match_count + 1))
      checked=$((checked + 1))
      _verify_expect_200 "${base_url}/tournaments/${tid}/matches/${fid}" 'match detail' || failures=$((failures + 1))
    done <<< "${match_ids}"
  done <<< "${tournament_ids}"

  if [[ "${match_count}" -eq 0 ]]; then
    echo "[prod-task168] verify: zero public matches across all public tournaments" >&2
    failures=$((failures + 1))
  fi

  local status='COMPLETED' content tmp
  [[ "${failures}" -eq 0 ]] || status='FAILED'
  content="$(jq -nc --arg db "${db_id}" --arg status "${status}" --argjson checked "${checked}" --argjson failures "${failures}" \
    --argjson tournaments "${tournament_count}" --argjson matches "${match_count}" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{schemaVersion:1,kind:"runtimeVerification",status:$status,databaseIdentity:$db,checkedCount:$checked,failureCount:$failures,tournamentCount:$tournaments,publicMatchCount:$matches,completedAt:$at}')" || return 1
  # Overwritten on every run: a retry after a fix legitimately differs.
  install -d -m 700 "${state_dir}" || return 1
  tmp="$(mktemp "${state_dir}/.receipt.XXXXXX")" || return 1
  printf '%s' "${content}" > "${tmp}" || return 1
  chmod 600 "${tmp}" || return 1
  mv "${tmp}" "${state_dir}/runtime-verification.json" || return 1

  [[ "${failures}" -eq 0 ]] || {
    echo "[prod-task168] verify FAILED (${failures} failure(s)) -- see ${state_dir}/runtime-verification.json" >&2
    return 1
  }
}

prod_task168_main() {
  case "${1:-}" in
    stageA) task168_stage_a ;;
    stageB) task168_stage_b ;;
    verify) task168_verify ;;
    *) echo "usage: prod_task168_main <stageA|stageB|verify>" >&2; return 64 ;;
  esac
}

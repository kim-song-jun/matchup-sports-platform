#!/usr/bin/env bash

# Task 168 production Stage A / Stage B transition runner. Ports the alpha
# procedure (deploy/task168-stage-a-migrate.sh, deploy/task168-stage-b-migrate.sh,
# deploy/task168-migration-contract.sh) to prod's conditions: no local
# `v1_postgres` compose service (external RDS), and a prod release state
# directory instead of alpha's.
#
# Sourced-only, same convention as deploy/prod-release-common.sh: the caller
# `set -Eeuo pipefail`s and defines a `compose` bash array (arrays cannot
# cross a subprocess boundary, so this cannot be a plain child-process CLI --
# it must be sourced into the caller's shell, exactly like
# prod-release-common.sh/prod-manifest-common.sh/prod-source-common.sh
# already are by deploy-prod.sh). After sourcing, call one of:
#   prod_task168_main stageA
#   prod_task168_main stageB
#   prod_task168_main verify
# (or the underlying task168_stage_a / task168_stage_b / task168_verify
# functions directly).
#
# Required environment: PROD_TASK168_DATABASE_URL (see prod-task168-common.sh),
# PROD_SOURCE_DIR, PROD_MANIFEST_FILE, and a pre-defined `compose` array
# (Ruling R3 -- migration itself never goes through compose, only the quiesce
# step below does).

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

# Ruling R2's manifest shape. Independent of whatever builds/validates the
# manifest upstream (Task 4/5) -- this runner never trusts an unchecked shape.
_assert_manifest_schema() {
  local stage name
  stage="$(jq -r '.database.task168.stage // empty' "${PROD_MANIFEST_FILE}" 2>/dev/null)"
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

_task168_pre_m11_names_csv() {
  local name parts=()
  for name in "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}"; do
    parts+=("'${name}'")
  done
  local IFS=,
  echo "${parts[*]}"
}

# Any row for our migration names that is not (finished, not rolled back) --
# an in-progress/failed attempt, or a resolved rollback -- means the ledger
# is not one of the 5 recognized states; reject rather than guess. M11 is
# checked separately: Stage A must never see it applied.
_assert_stage_a_ledger_clean() {
  local bad m11_present
  bad="$(prod_dbq "SELECT count(*) FROM \"_prisma_migrations\" WHERE migration_name IN ($(_task168_pre_m11_names_csv)) AND NOT (finished_at IS NOT NULL AND rolled_back_at IS NULL)")" || return 2
  m11_present="$(prod_dbq "SELECT count(*) FROM \"_prisma_migrations\" WHERE migration_name = '${PROD_TASK168_M11}'")" || return 2
  [[ "${bad}" == 0 && "${m11_present}" == 0 ]]
}

# Prints one of fresh|precutover|committed|complete|reject on stdout and
# returns 0. Returns 1 only for a real query/connection failure (nothing
# printed) -- "reject" is itself a valid, safe determination, not an error.
task168_stage_a_state() {
  local clean_rc rows seals
  # Not `_assert_stage_a_ledger_clean; clean_rc=$?` -- under `set -e`, a bare
  # (unchecked) call to a function whose last command is a failing `[[ ]]`
  # aborts the whole script right there, so `clean_rc=$?` is never reached.
  # The `&&`/`||` list is itself the "checked" context errexit exempts.
  _assert_stage_a_ledger_clean && clean_rc=0 || clean_rc=$?
  case "${clean_rc}" in
    0) ;;
    1) echo reject; return 0 ;;
    *) return 1 ;;
  esac
  rows="$(prod_ledger_rows)" || return 1
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

_stage_a_quiesce() {
  local release_sha="$1" api_image="$2" db_id="$3" quiesce_receipt="$4" content
  "${compose[@]}" stop v1_api v1_game_operations_worker
  [[ -z "$("${compose[@]}" ps -q v1_api)" && -z "$("${compose[@]}" ps -q v1_game_operations_worker)" ]] || {
    echo "[prod-task168] writers did not quiesce" >&2
    return 1
  }
  content="$(jq -nc --arg release "${release_sha}" --arg api "${api_image}" --arg db "${db_id}" \
    --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{schemaVersion:1,kind:"quiesce",status:"COMPLETED",releaseSha:$release,apiImage:$api,databaseIdentity:$db,services:["v1_api","v1_game_operations_worker"],completedAt:$at}')"
  prod_write_receipt "${quiesce_receipt}" "${content}"
}

# pg_dump's OUTPUT is streamed to the host's own stdout redirect (not a bind
# mount the container writes into), so the resulting file is owned by
# whichever host user is running this runner, never by the container's
# internal uid -- sidesteps a uid mismatch entirely (same technique alpha
# uses via `compose exec ... pg_dump | gzip > file`).
_stage_a_backup() {
  local release_sha="$1" api_image="$2" db_id="$3" backup_file="$4" backup_receipt="$5"
  local network content
  network="$(prod_task168_assert_network)" || return 1
  _prod_task168_docker_argv
  "${_PROD_TASK168_DOCKER_ARGV[@]}" run --rm --network "${network}" \
    --env-file <(printf 'DATABASE_URL=%s\n' "${PROD_TASK168_DATABASE_URL}") \
    postgres:16-alpine sh -c 'exec pg_dump "$DATABASE_URL" -Fc' > "${backup_file}" || {
    echo "[prod-task168] pg_dump failed" >&2
    return 1
  }
  chmod 600 "${backup_file}"
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
    '{schemaVersion:1,kind:"backup",status:"COMPLETED",releaseSha:$release,apiImage:$api,databaseIdentity:$db,backupPath:$path,backupSha256:$sha,backupBytes:$bytes,completedAt:$at}')"
  prod_write_receipt "${backup_receipt}" "${content}"
}

# Builds a throwaway migration source tree containing every pre-M1 migration
# (unrelated history, copied as-is) + all of M1 + (pre: M8,M10 | post:
# M8,M9,M10), then runs `prisma migrate deploy` against it inside the
# manifest's own candidate API image -- never the compose-managed v1_api
# service (Ruling R3), so a test can substitute a local image. `--user`
# matches the temp dir's own host owner so the container can read/write it
# regardless of the image's declared default user.
_stage_a_run_migrations() {
  local phase="$1" api_image="$2"
  (
    set -Eeuo pipefail
    local tmp owner network name
    tmp="$(mktemp -d)"
    trap 'rm -rf "${tmp}"' EXIT
    mkdir -p "${tmp}/migrations"
    cp "${PROD_SOURCE_DIR}/apps/v1_api/prisma/migrations/migration_lock.toml" "${tmp}/migrations/"
    cp "${PROD_SOURCE_DIR}/apps/v1_api/prisma/schema.prisma" "${tmp}/schema.prisma"
    copy_migration() { cp -R "${PROD_SOURCE_DIR}/apps/v1_api/prisma/migrations/$1" "${tmp}/migrations/$1"; }
    while IFS= read -r name; do
      [[ "${name}" < "${PROD_TASK168_M1[0]}" ]] && copy_migration "${name}"
    done < <(find "${PROD_SOURCE_DIR}/apps/v1_api/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -exec basename '{}' \; | LC_ALL=C sort)
    for name in "${PROD_TASK168_M1[@]}"; do copy_migration "${name}"; done
    case "${phase}" in
      pre) copy_migration "${PROD_TASK168_M8}"; copy_migration "${PROD_TASK168_M10}" ;;
      post) copy_migration "${PROD_TASK168_M8}"; copy_migration "${PROD_TASK168_M9}"; copy_migration "${PROD_TASK168_M10}" ;;
      *) echo "[prod-task168] unknown migration phase: ${phase}" >&2; exit 1 ;;
    esac
    owner="$(_stat_owner "${tmp}")"
    network="$(prod_task168_assert_network)"
    _prod_task168_docker_argv
    "${_PROD_TASK168_DOCKER_ARGV[@]}" run --rm --network "${network}" --user "${owner}" \
      --env-file <(printf 'DATABASE_URL=%s\n' "${PROD_TASK168_DATABASE_URL}") \
      -v "${tmp}:/tmp/task168" \
      "${api_image}" sh -c 'cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy --schema /tmp/task168/schema.prisma'
  )
}

# Exit code 0: report is authoritative, must be COMPLETED with zero legacy
# links. Nonzero: the seals themselves (not the tool's exit code) are the
# authoritative signal -- if they already read 5|5|3 the cutover committed
# before whatever made the tool exit nonzero, and Stage A must resume from
# there rather than refuse a genuinely-committed database.
_stage_a_run_cutover_tool() {
  local tool_image="$1" report_file="$2"
  [[ ! -e "${report_file}" ]] || {
    echo "[prod-task168] cutover report already exists: ${report_file}" >&2
    return 1
  }
  local network owner tool_rc
  network="$(prod_task168_assert_network)" || return 1
  owner="$(_stat_owner "$(dirname "${report_file}")")"
  _prod_task168_docker_argv
  set +e
  "${_PROD_TASK168_DOCKER_ARGV[@]}" run --rm --network "${network}" --user "${owner}" \
    --env-file <(printf 'DATABASE_URL=%s\n' "${PROD_TASK168_DATABASE_URL}") \
    -v "$(dirname "${report_file}"):/work" \
    "${tool_image}" --report "/work/$(basename "${report_file}")"
  tool_rc=$?
  set -e
  if [[ "${tool_rc}" -eq 0 ]]; then
    if [[ -s "${report_file}" ]]; then
      jq -e '.status=="COMPLETED" and .result.verification.remainingLegacyGameLinks==0 and .result.verification.remainingLegacyStaffScopes==0 and .result.verification.remainingLegacyAuditScopes==0' "${report_file}" >/dev/null || {
        echo "[prod-task168] cutover tool exited 0 but its report is not a clean COMPLETED result" >&2
        return 1
      }
    fi
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
  migrations_json="$(jq -c '.database.task168.migrations' "${PROD_MANIFEST_FILE}")"
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
    --arg completedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{schemaVersion:1,kind:"transition",status:"COMPLETED",stage:"stageA",releaseSha:$releaseSha,apiImage:$apiImage,toolImage:$toolImage,databaseIdentity:$databaseIdentity,migrations:$migrations,quiesceReceipt:$quiesceReceipt,quiesceReceiptSha256:$quiesceReceiptSha256,backupReceipt:$backupReceipt,backupReceiptSha256:$backupReceiptSha256,backupPath:$backupPath,backupSha256:$backupSha256,cutoverReport:$reportPath,completedAt:$completedAt}')"
  if [[ -s "${report_file}" ]]; then
    content="$(jq -c --arg s "$(prod_receipt_sha "${report_file}")" '. + {cutoverReportSha256:$s}' <<< "${content}")"
  fi
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
  local quiesce_path backup_receipt_path backup_file_path
  quiesce_path="$(jq -er '.quiesceReceipt' "${transition_receipt}")"
  backup_receipt_path="$(jq -er '.backupReceipt' "${transition_receipt}")"
  backup_file_path="$(jq -er '.backupPath' "${transition_receipt}")"
  [[ "$(prod_receipt_sha "${quiesce_path}")" == "$(jq -er '.quiesceReceiptSha256' "${transition_receipt}")" ]] || {
    echo "[prod-task168] transition quiesce evidence changed" >&2
    return 1
  }
  [[ "$(prod_receipt_sha "${backup_receipt_path}")" == "$(jq -er '.backupReceiptSha256' "${transition_receipt}")" ]] || {
    echo "[prod-task168] transition backup receipt evidence changed" >&2
    return 1
  }
  [[ -s "${backup_file_path}" && "$(prod_receipt_sha "${backup_file_path}")" == "$(jq -er '.backupSha256' "${transition_receipt}")" ]] || {
    echo "[prod-task168] transition backup file evidence changed" >&2
    return 1
  }
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
    actual="$(_sha256_file "${path}")"
    [[ "${actual}" == "${expected}" ]] || { echo "[prod-task168] raw migration checksum mismatch: ${name}" >&2; return 1; }
  done
  # Stage A must never carry the M11 folder -- that is Stage B's exclusive step.
  [[ ! -e "$(_migration_sql_path "${PROD_TASK168_M11}")" ]] || {
    echo "[prod-task168] Stage A source must not include M11 (${PROD_TASK168_M11})" >&2
    return 1
  }

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

  install -d -m 700 "${state_dir}" "${report_dir}"

  case "${state}" in
    fresh)
      _stage_a_quiesce "${release_sha}" "${api_image}" "${db_id}" "${quiesce_receipt}" || return 1
      _stage_a_backup "${release_sha}" "${api_image}" "${db_id}" "${backup_file}" "${backup_receipt}" || return 1
      _stage_a_run_migrations pre "${api_image}" || return 1
      local pre_rows
      pre_rows="$(prod_ledger_rows)" || return 1
      _rows_equal "${pre_rows}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M10}" ||
        { echo "[prod-task168] pre-cutover ledger does not match the expected M1..M8,M10 set" >&2; return 1; }
      _stage_a_run_cutover_tool "${tool_image}" "${report_file}" || return 1
      ;;
    precutover)
      _stage_a_assert_receipt "${quiesce_receipt}" quiesce "${release_sha}" "${db_id}" "${api_image}" || return 1
      _stage_a_assert_receipt "${backup_receipt}" backup "${release_sha}" "${db_id}" "${api_image}" || return 1
      [[ -s "${backup_file}" ]] || { echo "[prod-task168] precutover resume is missing the backup file" >&2; return 1; }
      _stage_a_run_cutover_tool "${tool_image}" "${report_file}" || return 1
      ;;
    committed)
      _stage_a_assert_receipt "${quiesce_receipt}" quiesce "${release_sha}" "${db_id}" "${api_image}" || return 1
      _stage_a_assert_receipt "${backup_receipt}" backup "${release_sha}" "${db_id}" "${api_image}" || return 1
      [[ -s "${backup_file}" ]] || { echo "[prod-task168] committed resume is missing the backup file" >&2; return 1; }
      # Seals already read 5|5|3 (that is what makes this "committed") -- the
      # cutover tool already ran successfully in a prior attempt. Re-running
      # it here is exactly what Review Focus #1 forbids.
      ;;
  esac

  _stage_a_run_migrations post "${api_image}" || return 1
  local final_rows
  final_rows="$(prod_ledger_rows)" || return 1
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

_stage_b_assert_transition_bindings() {
  local receipt="$1" quiesce_path backup_receipt_path backup_file_path
  quiesce_path="$(jq -er '.quiesceReceipt' "${receipt}")" || return 1
  backup_receipt_path="$(jq -er '.backupReceipt' "${receipt}")" || return 1
  backup_file_path="$(jq -er '.backupPath' "${receipt}")" || return 1
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
}

task168_stage_b() {
  : "${PROD_SOURCE_DIR:?PROD_SOURCE_DIR is required}"
  : "${PROD_MANIFEST_FILE:?PROD_MANIFEST_FILE is required}"
  _assert_manifest_schema || return 1
  [[ "$(jq -r '.database.task168.stage' "${PROD_MANIFEST_FILE}")" == stageB ]] || {
    echo "[prod-task168] manifest is not a Stage B manifest" >&2
    return 1
  }

  local api_image db_id
  api_image="$(_manifest_field '.images.api.uri')" || return 1
  db_id="$(prod_db_identity)" || return 1

  local transition_receipt
  transition_receipt="$(_stage_b_find_transition_receipt "${db_id}")" || {
    echo "[prod-task168] Stage B refuses: no unique Stage A transition receipt for this database" >&2
    return 1
  }
  _stage_b_assert_transition_bindings "${transition_receipt}" || return 1
  prod_assert_cutover_seals || return 1
  local ledger_rows
  ledger_rows="$(prod_ledger_rows)" || return 1
  _rows_equal "${ledger_rows}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}" ||
    { echo "[prod-task168] Stage B refuses: prod ledger is not exactly the Stage A M1..M10 set" >&2; return 1; }

  local state_dir m11_path m11_sha
  state_dir="$(dirname "${transition_receipt}")"
  m11_path="$(_migration_sql_path "${PROD_TASK168_M11}")"
  [[ -f "${m11_path}" ]] || { echo "[prod-task168] M11 migration source is missing" >&2; return 1; }
  m11_sha="$(_sha256_file "${m11_path}")"
  [[ "${m11_sha}" == "${PROD_TASK168_M11_PINNED_SHA256}" ]] || {
    echo "[prod-task168] M11 source checksum does not match the pinned value" >&2
    return 1
  }

  local entry_content
  entry_content="$(jq -nc --arg db "${db_id}" --arg sha "${m11_sha}" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{schemaVersion:1,kind:"m11Entry",status:"ENTERED",databaseIdentity:$db,migrationSha256:$sha,enteredAt:$at}')"
  prod_write_receipt "${state_dir}/m11-entry.json" "${entry_content}" || return 1

  # Unlike Stage A's crafted subset, Stage B trusts the real release source
  # tree as packaged (it already carries every migration up to and including
  # M11 in order) -- mounted read-only, since the container must never write
  # into the immutable release source.
  local network
  network="$(prod_task168_assert_network)" || return 1
  _prod_task168_docker_argv
  "${_PROD_TASK168_DOCKER_ARGV[@]}" run --rm --network "${network}" \
    --env-file <(printf 'DATABASE_URL=%s\n' "${PROD_TASK168_DATABASE_URL}") \
    -v "${PROD_SOURCE_DIR}/apps/v1_api/prisma:/tmp/task168-prisma:ro" \
    "${api_image}" sh -c 'cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy --schema /tmp/task168-prisma/schema.prisma' || {
    echo "[prod-task168] M11 prisma migrate deploy failed" >&2
    return 1
  }

  local final_rows applied_count
  final_rows="$(prod_ledger_rows)" || return 1
  _rows_equal "${final_rows}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}" "${PROD_TASK168_M11}" ||
    { echo "[prod-task168] post-M11 ledger does not match the expected full set" >&2; return 1; }
  applied_count="$(grep -c '.' <<< "${final_rows}")"

  local stage_content
  stage_content="$(jq -nc --arg db "${db_id}" --argjson applied "${applied_count}" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{schemaVersion:1,kind:"migrationStage",status:"MIGRATION_COMMITTED",databaseIdentity:$db,appliedCount:$applied,completedAt:$at}')"
  prod_write_receipt "${state_dir}/migration-stage.json" "${stage_content}" || return 1

  "${_PROD_TASK168_DOCKER_ARGV[@]}" run --rm --network "${network}" \
    --env-file <(printf 'DATABASE_URL=%s\n' "${PROD_TASK168_DATABASE_URL}") \
    "${api_image}" sh -c 'cd /app/apps/v1_api && node dist/src/tournaments/migration/tournament-award-recipient-backfill.cli.js' || {
    echo "[prod-task168] tournament award recipient backfill failed" >&2
    return 1
  }

  echo "[prod-task168] Stage B migration commit complete — activation continues in deploy-prod.sh"
}

# Runs after deploy-prod.sh's own health check passes, before it promotes the
# candidate manifest. Public read surface only (no auth): tournament list,
# every tournament's detail, and every v1_tournament_match_details row's
# public match detail. A non-200 anywhere is a release-blocking failure.
task168_verify() {
  local base_url="${PROD_TASK168_VERIFY_BASE_URL:-http://127.0.0.1:8121/api/v1}"
  local db_id state_dir
  db_id="$(prod_db_identity)" || return 1
  local transition_receipt
  transition_receipt="$(_stage_b_find_transition_receipt "${db_id}")" || {
    echo "[prod-task168] verify refuses: no Stage A transition receipt for this database" >&2
    return 1
  }
  state_dir="$(dirname "${transition_receipt}")"

  local failures=0 checked=0 list_response
  list_response="$(curl -fsS --connect-timeout 3 --max-time 10 "${base_url}/tournaments")" || {
    echo "[prod-task168] tournament list request failed" >&2
    failures=$((failures + 1))
  }

  local tournament_ids=()
  if [[ -n "${list_response:-}" ]]; then
    mapfile -t tournament_ids < <(jq -r '.data.items[]?.id // empty' <<< "${list_response}" 2>/dev/null)
  fi

  local tid code
  for tid in "${tournament_ids[@]}"; do
    checked=$((checked + 1))
    code="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 3 --max-time 10 "${base_url}/tournaments/${tid}")"
    [[ "${code}" == 200 ]] || { echo "[prod-task168] tournament detail non-200 (${code}): ${tid}" >&2; failures=$((failures + 1)); }
  done

  local match_rows
  match_rows="$(prod_dbq "SELECT tournament_id || '|' || team_match_id FROM v1_tournament_match_details")" || return 1
  local tournament_id team_match_id
  while IFS='|' read -r tournament_id team_match_id; do
    [[ -n "${tournament_id}" ]] || continue
    checked=$((checked + 1))
    code="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 3 --max-time 10 "${base_url}/tournaments/${tournament_id}/matches/${team_match_id}")"
    [[ "${code}" == 200 ]] || { echo "[prod-task168] fixture detail non-200 (${code}): ${tournament_id}/${team_match_id}" >&2; failures=$((failures + 1)); }
  done <<< "${match_rows}"

  local status='COMPLETED'
  [[ "${failures}" -eq 0 ]] || status='FAILED'
  local content tmp
  content="$(jq -nc --arg db "${db_id}" --arg status "${status}" --argjson checked "${checked}" --argjson failures "${failures}" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{schemaVersion:1,kind:"runtimeVerification",status:$status,databaseIdentity:$db,checkedCount:$checked,failureCount:$failures,completedAt:$at}')"
  # Overwrites on every run (unlike prod_write_receipt's idempotent-content
  # contract) -- a retry after a real fix is expected to produce different
  # content for the exact same release.
  install -d -m 700 "${state_dir}"
  tmp="$(mktemp "${state_dir}/.receipt.XXXXXX")"
  printf '%s' "${content}" > "${tmp}"
  chmod 600 "${tmp}"
  mv "${tmp}" "${state_dir}/runtime-verification.json"

  [[ "${failures}" -eq 0 ]]
}

prod_task168_main() {
  case "${1:-}" in
    stageA) task168_stage_a ;;
    stageB) task168_stage_b ;;
    verify) task168_verify ;;
    *) echo "usage: prod_task168_main <stageA|stageB|verify>" >&2; return 64 ;;
  esac
}

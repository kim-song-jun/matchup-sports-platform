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
#
# Fix round 1 note (errexit does not protect a function's own body): a bash
# function or `(...)` subshell invoked as `f args || handler` has its ENTIRE
# body's `set -e` disabled -- POSIX/bash exempt a compound command used as
# the left side of an AND/OR list from ErrExit, and that exemption extends
# through everything it runs, including a subshell that explicitly
# re-declares `set -Eeuo pipefail` at its own top. Verified empirically in
# this session. Since every call site in this file uses exactly that
# `|| return 1` shape, every function below explicitly `||`-checks its own
# risky commands rather than trusting the caller's errexit.

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
# 10 names: M1(7) + M8 + M9 + M10 -- everything Stage A ever applies (never
# M11). Used both for the state-table's single scoped ledger read (whose
# content decides "9 rows present" vs "10 rows present" vs "reject") and for
# Stage B's own precondition read.
_task168_pre_m11_csv() { _task168_names_csv "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}"; }
# 11 names: the full set including M11 -- Stage B's post-migrate read.
_task168_all_csv() { _task168_names_csv "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}" "${PROD_TASK168_M11}"; }

# Ruling R2's manifest shape. Independent of whatever builds/validates the
# manifest upstream (Task 4/5) -- this runner never trusts an unchecked shape.
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

# Critical 1 (real prod_pristine check found 122 unrelated ledger rows): a
# scoped IN-list comparison alone cannot see a MISSING or foreign migration
# among everything that came before M1 -- it would simply not appear in the
# scoped read.
_pre_m1_source_names() {
  find "${PROD_SOURCE_DIR}/apps/v1_api/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -exec basename '{}' \; 2>/dev/null |
    LC_ALL=C sort | awk -v m1="${PROD_TASK168_M1[0]}" '$0 < m1'
}

# $1: comm flag (-23 or -13). $2/$3: newline-joined name lists that the
# caller believes are both C-sorted (applied_names via the SQL query's
# `ORDER BY ... COLLATE "C"`, source_names via `LC_ALL=C sort` above).
# Prints the matching line count on success.
#
# Fix round 3 Important (reviewer-found): `comm`'s output on misordered
# input is meaningless, and the previous callers' `"$(comm ... | grep -c
# '.')" || x=0` swallowed that into a false "0 matches" -- under pipefail
# the pipeline's exit status is the RIGHTMOST command's, so a failing comm
# feeding a `grep -c '.'` that happens to still find a match (or find
# nothing, which the `|| x=0` fallback treats as a legitimate empty result
# either way) never surfaces the comm failure at all. `comm --check-order`
# would catch this on GNU coreutils (the actual EC2 prod host), but BSD
# `comm` (this repo's local macOS dev/test host) has no such flag and does
# not detect unsorted input at all -- verified empirically in this session
# (`comm -23` on deliberately unsorted input exits 0 and prints a wrong
# result). `sort -c` is portable (GNU and BSD both support it) and lets us
# independently verify both inputs are properly ordered BEFORE trusting
# `comm` at all, which is strictly stronger than relying on `comm`'s own
# order check and works identically on both platforms.
_pre_m1_comm_count() {
  local flag="$1" list_a="$2" list_b="$3" sort_rc comm_rc tmp count
  printf '%s\n' "${list_a}" | LC_ALL=C sort -c >/dev/null 2>&1 &&
    printf '%s\n' "${list_b}" | LC_ALL=C sort -c >/dev/null 2>&1 && sort_rc=0 || sort_rc=$?
  if [[ "${sort_rc}" -ne 0 ]]; then
    echo "[prod-task168] pre-M1 name list is not C-sorted (sort -c exit ${sort_rc}) -- refusing rather than trusting comm on possibly-misordered input" >&2
    return 2
  fi
  # Redirected to a real file (not piped into grep) so comm's OWN exit code
  # is captured directly via `$?` -- inside a pipe, pipefail's exit status is
  # the RIGHTMOST failing command, so a failing comm feeding a grep that
  # still finds (or fails to find) lines can hide comm's own failure
  # entirely. `grep -c` runs afterward on the file, so its own "0 matches"
  # (rc=1) is the only thing `|| count=0` is allowed to paper over.
  tmp="$(mktemp)" || return 2
  LC_ALL=C comm "${flag}" <(printf '%s\n' "${list_a}") <(printf '%s\n' "${list_b}") > "${tmp}"
  comm_rc=$?
  if [[ "${comm_rc}" -ne 0 ]]; then
    rm -f "${tmp}"
    echo "[prod-task168] comm ${flag} failed comparing pre-M1 name sets (exit ${comm_rc})" >&2
    return 2
  fi
  count="$(grep -c '.' "${tmp}")" || count=0
  rm -f "${tmp}"
  printf '%s' "${count}"
}

# Fix round 2 (load-bearing): the earlier version compared COUNTS of
# "resolved" (applied OR cleanly-rolled-back) pre-M1 rows against the count
# of pre-M1 source folders, and required an exact match. Both were wrong for
# a real prod database that legitimately lags dev between releases (real
# prod_pristine: 157 source pre-M1 folders, only 123 applied) -- that design
# blocks Stage A forever. Counts also let two completely different name sets
# cancel out to the same number, and folded a rolled-back-and-never-reapplied
# row in as if it satisfied "this migration is present", which it does not
# (its effect is not in the schema).
#
# $1: "subset" (Stage A -- the ledger's applied pre-M1 names may lag behind
# what source ships; the "pre" migrate phase below catches the rest up, so
# only a FOREIGN name -- applied but not shipped by this source, i.e. from a
# different branch -- is a violation) or "exact" (Stage B -- by the time
# Stage B runs, Stage A's own "pre" phase already had its chance to apply
# every pre-M1 migration source ships, so nothing should be missing either).
#
# Returns 0 (clean), 1 (a real violation was found -- the caller should
# treat this as "reject", not an error), or 2 (a genuine query/setup failure,
# e.g. the DB is unreachable -- the caller must propagate this as a hard
# failure, never as "reject"). Collapsing 1 and 2 into a single nonzero code
# would make a real DB outage look identical to a safe, expected rejection.
_assert_pre_m1_name_set() {
  local mode="$1" source_names applied_names anomalous foreign missing
  source_names="$(_pre_m1_source_names)"
  [[ -n "${source_names}" ]] || {
    echo "[prod-task168] no pre-M1 migrations found under PROD_SOURCE_DIR -- cannot validate the ledger baseline" >&2
    return 2
  }
  # Anomalous: still-pending/failed (no finished_at, no rollback either) OR
  # self-contradictory (both finished AND rolled back, which should never
  # happen). A cleanly rolled-back row (finished_at NULL, rolled_back_at SET)
  # is normal Prisma history, not an anomaly, and is handled below by simply
  # never counting it toward "applied".
  anomalous="$(prod_dbq "SELECT count(*) FROM \"_prisma_migrations\" WHERE migration_name < '${PROD_TASK168_M1[0]}' AND ((finished_at IS NULL AND rolled_back_at IS NULL) OR (finished_at IS NOT NULL AND rolled_back_at IS NOT NULL))")" || return 2
  if [[ "${anomalous}" != 0 ]]; then
    echo "[prod-task168] pre-M1 migration ledger has ${anomalous} stuck or self-contradictory row(s)" >&2
    return 1
  fi
  # COLLATE "C" pins the server's ORDER BY to the same byte order as this
  # function's `LC_ALL=C sort`/`comm` calls -- without it a server default
  # collation (e.g. en_US.utf8) can order names differently than the C
  # locale for certain byte sequences, which is exactly the misordering
  # `_pre_m1_comm_count`'s own `sort -c` guard below exists to catch.
  # Postgres requires a SELECT DISTINCT's ORDER BY expression to appear
  # verbatim in the select list -- `ORDER BY migration_name COLLATE "C"`
  # alone errors with "ORDER BY expressions must appear in select list"
  # (confirmed against a real prod_pristine copy in this session). COLLATE
  # on the select-list item itself does not change the returned bytes, only
  # what DISTINCT/ORDER BY collate against, so this is still exactly the
  # migration_name values.
  applied_names="$(prod_dbq "SELECT DISTINCT migration_name COLLATE \"C\" FROM \"_prisma_migrations\" WHERE migration_name < '${PROD_TASK168_M1[0]}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name COLLATE \"C\"")" || return 2
  local pre_m1_comm_rc
  if [[ -z "${applied_names}" ]]; then
    # `printf '%s\n' ""` would print one phantom blank line, and "" sorts
    # before every real name -- comm -23 would misreport it as "applied but
    # not shipped by source" even though nothing was actually applied. An
    # empty applied set trivially has zero foreign names, so skip comm
    # entirely rather than reason about the phantom line's interaction with
    # `sort -c`/`comm`.
    foreign=0
  else
    foreign="$(_pre_m1_comm_count -23 "${applied_names}" "${source_names}")" && pre_m1_comm_rc=0 || pre_m1_comm_rc=$?
    [[ "${pre_m1_comm_rc}" -eq 0 ]] || return 2
  fi
  if [[ "${foreign}" != 0 ]]; then
    echo "[prod-task168] pre-M1 ledger has ${foreign} applied migration name(s) PROD_SOURCE_DIR does not ship (a different branch's migration?)" >&2
    return 1
  fi
  [[ "${mode}" == exact ]] || return 0
  if [[ -z "${applied_names}" ]]; then
    # Nothing applied at all -> everything source ships is missing. The
    # phantom blank line is harmless for -13 (it is unique to file1, never
    # file2), but computing this directly avoids the comm round-trip.
    missing="$(grep -c '.' <<< "${source_names}")" || missing=0
  else
    missing="$(_pre_m1_comm_count -13 "${applied_names}" "${source_names}")" && pre_m1_comm_rc=0 || pre_m1_comm_rc=$?
    [[ "${pre_m1_comm_rc}" -eq 0 ]] || return 2
  fi
  if [[ "${missing}" != 0 ]]; then
    echo "[prod-task168] pre-M1 ledger is missing ${missing} migration(s) PROD_SOURCE_DIR ships -- Stage B requires all of them applied" >&2
    return 1
  fi
  return 0
}

# Any row for our migration names that is not (finished, not rolled back) --
# an in-progress/failed attempt, or a resolved rollback -- means the ledger
# is not one of the 5 recognized states; reject rather than guess. M11 is
# checked separately: Stage A must never see it applied. Same 0/1/2 contract
# as _assert_pre_m1_name_set, for the same reason.
_assert_stage_a_ledger_clean() {
  local pre_m1_rc bad m11_present
  # Not a bare `_assert_pre_m1_name_set subset || return 2` -- that would
  # collapse its own 1-vs-2 distinction back into one code. The `&&`/`||`
  # list is the "checked" context that keeps this call's own errexit exempt
  # without losing which of the two failure codes it returned. "subset": a
  # real prod database legitimately lags dev between releases (34-migration
  # gap observed against prod_pristine), so Stage A only requires that
  # whatever IS applied is legitimate, not that everything is already there
  # -- the "pre" migrate phase below catches the rest up.
  _assert_pre_m1_name_set subset && pre_m1_rc=0 || pre_m1_rc=$?
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

# Returns 0 when `path` already holds a receipt bound to this exact
# release/database/api-image with a terminal status -- lets a retry of the
# SAME release skip re-doing (and thus re-writing) a step a prior attempt
# already finished, instead of being permanently blocked by
# prod_write_receipt's byte-identical-content requirement (a fresh write
# always carries a new timestamp field, so a naive retry can never match).
_receipt_reusable() {
  local path="$1" kind="$2" release_sha="$3" db_id="$4" api_image="$5"
  [[ -s "${path}" ]] || return 1
  jq -e --arg kind "${kind}" --arg release "${release_sha}" --arg db "${db_id}" --arg api "${api_image}" \
    '.schemaVersion==1 and .kind==$kind and (.status=="COMPLETED" or .status=="ENTERED" or .status=="MIGRATION_COMMITTED") and .releaseSha==$release and .databaseIdentity==$db and .apiImage==$api' \
    "${path}" >/dev/null 2>&1
}

_stage_a_assert_quiesced() {
  local api_running worker_running
  # Captured separately, not `[[ -z "$(cmd)" ]]` -- a failing `ps -q` prints
  # nothing to stdout, and `[[ ]]` only looks at that string, never the
  # substituted command's own exit status. Two failing `ps` calls would read
  # as "both empty" = "quiesced", which is exactly backwards.
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
  "${compose[@]}" stop v1_api v1_game_operations_worker || {
    echo "[prod-task168] compose stop failed" >&2
    return 1
  }
  _stage_a_assert_quiesced || return 1
  _receipt_reusable "${quiesce_receipt}" quiesce "${release_sha}" "${db_id}" "${api_image}" && return 0
  content="$(jq -nc --arg release "${release_sha}" --arg api "${api_image}" --arg db "${db_id}" \
    --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{schemaVersion:1,kind:"quiesce",status:"COMPLETED",releaseSha:$release,apiImage:$api,databaseIdentity:$db,services:["v1_api","v1_game_operations_worker"],completedAt:$at}')" || return 1
  prod_write_receipt "${quiesce_receipt}" "${content}"
}

# pg_dump's OUTPUT is streamed to the host's own stdout redirect (not a bind
# mount the container writes into), so the resulting file is owned by
# whichever host user is running this runner, never by the container's
# internal uid -- sidesteps a uid mismatch entirely (same technique alpha
# uses via `compose exec ... pg_dump | gzip > file`).
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

# Builds a throwaway migration source tree containing every pre-M1 migration
# (unrelated history, copied as-is) + all of M1 + (pre: M8,M10 | post:
# M8,M9,M10), then runs `prisma migrate deploy` against it inside the
# manifest's own candidate API image -- never the compose-managed v1_api
# service (Ruling R3), so a test can substitute a local image. `--user`
# matches the temp dir's own host owner so the container can read/write it
# regardless of the image's declared default user.
#
# Every step is `|| exit 1`-checked (see the file header on why this
# subshell's own `set -e` does not protect it): `copy_migration` bakes the
# check into its one definition instead of repeating `|| exit 1` at every
# call site.
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

# Exit code 0: report is authoritative, must exist and be a clean COMPLETED
# result -- "exit 0 but wrote no report" is treated as a failure, not a
# silent pass. Nonzero: the seals themselves (not the tool's exit code) are
# the authoritative signal -- if they already read 5|5|3 the cutover
# committed before whatever made the tool exit nonzero, and Stage A must
# resume from there rather than refuse a genuinely-committed database.
_stage_a_run_cutover_tool() {
  local tool_image="$1" report_file="$2"
  if [[ -e "${report_file}" ]]; then
    # Fix round 2 (I4): the tool writes a report even when it fails preflight
    # -- a report existing must not by itself block every future retry of
    # the same release forever. Only a report from a run that never sealed
    # anything (seals still 0|0|0) and whose own status says it failed is
    # safe to archive and retry; a report sitting next to seals that already
    # read 5|5|3 (committed) or an unrecognized status must still refuse,
    # since the cutover tool itself must never run twice against a database
    # it already (or ambiguously might have) committed.
    # Fix round 3 Minor: the tool's own contract (alpha
    # deploy/task168-stage-a-migrate.sh:72, assert_preflight_failed_report)
    # is `.status=="FAILED"` with `.error.code=="PREFLIGHT_BLOCKED"` nested
    # underneath -- PREFLIGHT_BLOCKED is never a top-level status value the
    # tool emits, so checking `prior_status == PREFLIGHT_BLOCKED` could never
    # match anything real. Only `.status` matters for this gate.
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
  network="$(prod_task168_assert_network)" || return 1
  owner="$(_stat_owner "$(dirname "${report_file}")")" || return 1
  _prod_task168_docker_argv
  set +e
  "${_PROD_TASK168_DOCKER_ARGV[@]}" run --rm --network "${network}" --user "${owner}" \
    --env-file /dev/stdin \
    -v "$(dirname "${report_file}"):/work" \
    "${tool_image}" --report "/work/$(basename "${report_file}")" \
    < <(printf 'DATABASE_URL=%s\n' "${PROD_TASK168_DATABASE_URL}")
  tool_rc=$?
  set -e
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
  local quiesce_path backup_receipt_path backup_file_path report_path
  quiesce_path="$(jq -er '.quiesceReceipt' "${transition_receipt}")" || return 1
  backup_receipt_path="$(jq -er '.backupReceipt' "${transition_receipt}")" || return 1
  backup_file_path="$(jq -er '.backupPath' "${transition_receipt}")" || return 1
  report_path="$(jq -er '.cutoverReport' "${transition_receipt}")" || return 1
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
  [[ -s "${report_path}" && "$(prod_receipt_sha "${report_path}")" == "$(jq -er '.cutoverReportSha256' "${transition_receipt}")" ]] || {
    echo "[prod-task168] transition cutover report evidence changed" >&2
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
    actual="$(_sha256_file "${path}")" || return 1
    [[ "${actual}" == "${expected}" ]] || { echo "[prod-task168] raw migration checksum mismatch: ${name}" >&2; return 1; }
  done
  # Ruling R9 (fix round 1): C2 runs Stage A and Stage B off the SAME dev
  # source tree, so PROD_SOURCE_DIR legitimately carries the M11 folder
  # during Stage A too -- rejecting on its mere presence (the alpha-derived
  # assumption this runner used to make) would refuse every real Stage A
  # run. The real safety invariant lives in _stage_a_run_migrations()
  # instead: its throwaway migration tree is built name-by-name (pre-M1 +
  # M1 + M8/M10 or M8/M9/M10) and never calls copy_migration for M11, so
  # Stage A's own `prisma migrate deploy` physically cannot see it
  # regardless of what PROD_SOURCE_DIR contains.

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
      # Re-quiesce unconditionally on resume too (alpha task168-stage-a-migrate.sh:202) --
      # nothing guarantees the writers are still down between attempts.
      "${compose[@]}" stop v1_api v1_game_operations_worker || { echo "[prod-task168] compose stop failed" >&2; return 1; }
      _stage_a_assert_quiesced || return 1
      _stage_a_run_cutover_tool "${tool_image}" "${report_file}" || return 1
      ;;
    committed)
      _stage_a_assert_receipt "${quiesce_receipt}" quiesce "${release_sha}" "${db_id}" "${api_image}" || return 1
      _stage_a_assert_receipt "${backup_receipt}" backup "${release_sha}" "${db_id}" "${api_image}" || return 1
      [[ -s "${backup_file}" ]] || { echo "[prod-task168] committed resume is missing the backup file" >&2; return 1; }
      "${compose[@]}" stop v1_api v1_game_operations_worker || { echo "[prod-task168] compose stop failed" >&2; return 1; }
      _stage_a_assert_quiesced || return 1
      # Seals already read 5|5|3 (that is what makes this "committed") -- the
      # cutover tool already ran successfully in a prior attempt. Re-running
      # it here is exactly what Review Focus #1 forbids. Its report evidence
      # must still exist and show zero legacy links, though.
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

_stage_b_assert_transition_bindings() {
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

task168_stage_b() {
  : "${PROD_SOURCE_DIR:?PROD_SOURCE_DIR is required}"
  : "${PROD_MANIFEST_FILE:?PROD_MANIFEST_FILE is required}"
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
  _stage_b_assert_transition_bindings "${transition_receipt}" || return 1

  # The transition receipt must be for THIS candidate release and carry the
  # same migration checksums this manifest pins -- otherwise Stage B could
  # apply M11 against a DB whose Stage A evidence belongs to a different
  # release or a tampered checksum set.
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

  local state_dir migration_stage_receipt network
  state_dir="$(dirname "${transition_receipt}")"
  migration_stage_receipt="${state_dir}/migration-stage.json"

  if _receipt_reusable "${migration_stage_receipt}" migrationStage "${release_sha}" "${db_id}" "${api_image}"; then
    # M11 was already committed in a prior Stage B attempt (only the backfill
    # step failed after it) -- never re-run `prisma migrate deploy` against
    # an already-migrated DB. Re-verify independently (never trust the
    # receipt alone for something this destructive) before resuming straight
    # into the backfill.
    #
    # Fix round 4 (Task 6 real-DB finding, load-bearing): this branch is
    # ALWAYS post-M11 by construction (migration-stage.json only ever gets
    # written after M11 succeeds), so the physical invariant to re-verify is
    # "M11's own retirement DDL is intact" (prod_assert_legacy_tables_retired),
    # never prod_assert_cutover_seals -- that query casts to the 5 legacy
    # tables M11 physically DROPs and hard-crashes with "relation ... does
    # not exist" on every real post-M11 database (reproduced live by Task 6's
    # real-DB test; the shim tests never caught it because they fake the
    # seal query's result instead of running it against real tables).
    prod_assert_legacy_tables_retired || return 1
    local resumed_rows
    resumed_rows="$(prod_ledger_rows "$(_task168_all_csv)")" || return 1
    _rows_equal "${resumed_rows}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}" "${PROD_TASK168_M11}" ||
      { echo "[prod-task168] Stage B resume refuses: ledger no longer shows the committed M11 set" >&2; return 1; }
  else
    # "exact": by Stage B time, Stage A's own "pre" migrate phase already had
    # its chance to catch up every pre-M1 migration source ships, so nothing
    # should be missing (fix round 2, item 2).
    _assert_pre_m1_name_set exact || return 1
    # Declared here (covering BOTH branches below), not inside the `if` that
    # first assigns them -- this function is `source`d into deploy-prod.sh's
    # own shell, so a `local` that only executes on the `if` path leaves the
    # `else` path's bare assignment (same names) creating real GLOBAL
    # variables when that path runs instead (carried over from Task 1-3).
    local ledger_rows applied_count stage_content
    # Scoped to all 11 names (including M11), not just the 10 pre-M11 ones --
    # fix round 2 Minor 6: reading only the pre-M11 scope makes an M11 that
    # is already applied (with no valid migration-stage.json receipt, e.g.
    # because it was applied out-of-band) invisible to this check, so it
    # would wrongly pass as "exactly the Stage A M1..M10 set" and this branch
    # would run `prisma migrate deploy` a second time against an
    # already-migrated DB. Reading all 11 names means an already-applied M11
    # shows up as an extra row and correctly fails the 10-name `_rows_equal`
    # below instead. Read BEFORE any seal check (fix round 4) -- which seal
    # invariant is even safe to query depends on whether M11 has already run.
    ledger_rows="$(prod_ledger_rows "$(_task168_all_csv)")" || return 1

    if _rows_equal "${ledger_rows}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}" "${PROD_TASK168_M11}"; then
      # Fix round 3 item 1 (F5 residual): M11's own `prisma migrate deploy`
      # can succeed and then the ledger re-read or the migration-stage.json
      # write can still fail (crash, disk full, etc). On retry,
      # migration-stage.json is still missing so this "else" branch is
      # reached again, and (post fix round 2 Minor 6) the ledger already
      # showing all 11 rows would otherwise hard-refuse forever. Resume
      # straight to writing the receipt -- but ONLY with independent
      # evidence THIS Stage B run (not an out-of-band change) is what
      # applied M11: M11's own retirement DDL is intact (fix round 4 --
      # NEVER prod_assert_cutover_seals here either, for the same reason as
      # the resume branch above: M11 has already run by this point in this
      # branch) plus a valid m11-entry.json bound to this exact
      # release/database/image. Any other reason the ledger might show all
      # 11 rows (no matching m11-entry.json) still hard-refuses.
      prod_assert_legacy_tables_retired || return 1
      if ! _receipt_reusable "${state_dir}/m11-entry.json" m11Entry "${release_sha}" "${db_id}" "${api_image}"; then
        echo "[prod-task168] Stage B refuses: ledger already shows the full M1..M11 set but there is no matching m11-entry.json for this release/database (M11 applied out-of-band?)" >&2
        return 1
      fi
      echo "[prod-task168] M11 already applied and m11-entry.json confirms this Stage B run -- resuming to write migration-stage.json" >&2
      applied_count="$(grep -c '.' <<< "${ledger_rows}")" || return 1
      stage_content="$(jq -nc --arg release "${release_sha}" --arg api "${api_image}" --arg db "${db_id}" --argjson applied "${applied_count}" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{schemaVersion:1,kind:"migrationStage",status:"MIGRATION_COMMITTED",releaseSha:$release,apiImage:$api,databaseIdentity:$db,appliedCount:$applied,completedAt:$at}')" || return 1
      prod_write_receipt "${migration_stage_receipt}" "${stage_content}" || return 1
    else
      _rows_equal "${ledger_rows}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}" ||
        { echo "[prod-task168] Stage B refuses: prod ledger is not exactly the Stage A M1..M10 set" >&2; return 1; }
      # M11 has not run yet in this branch -- prod_assert_cutover_seals is
      # the correct (and only safe) pre-M11 invariant here: it reverifies
      # Stage A really committed the cutover before we dare run M11's DDL.
      prod_assert_cutover_seals || return 1

      local m11_path m11_sha
      m11_path="$(_migration_sql_path "${PROD_TASK168_M11}")"
      [[ -f "${m11_path}" ]] || { echo "[prod-task168] M11 migration source is missing" >&2; return 1; }
      m11_sha="$(_sha256_file "${m11_path}")" || return 1
      [[ "${m11_sha}" == "${PROD_TASK168_M11_PINNED_SHA256}" ]] || {
        echo "[prod-task168] M11 source checksum does not match the pinned value" >&2
        return 1
      }

      if ! _receipt_reusable "${state_dir}/m11-entry.json" m11Entry "${release_sha}" "${db_id}" "${api_image}"; then
        local entry_content
        entry_content="$(jq -nc --arg release "${release_sha}" --arg api "${api_image}" --arg db "${db_id}" --arg sha "${m11_sha}" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
          '{schemaVersion:1,kind:"m11Entry",status:"ENTERED",releaseSha:$release,apiImage:$api,databaseIdentity:$db,migrationSha256:$sha,enteredAt:$at}')" || return 1
        prod_write_receipt "${state_dir}/m11-entry.json" "${entry_content}" || return 1
      fi

      # Unlike Stage A's crafted subset, Stage B trusts the real release source
      # tree as packaged (it already carries every migration up to and
      # including M11 in order) -- mounted read-only, since the container must
      # never write into the immutable release source.
      network="$(prod_task168_assert_network)" || return 1
      _prod_task168_docker_argv
      "${_PROD_TASK168_DOCKER_ARGV[@]}" run --rm --network "${network}" \
        --env-file /dev/stdin \
        -v "${PROD_SOURCE_DIR}/apps/v1_api/prisma:/tmp/task168-prisma:ro" \
        "${api_image}" sh -c 'cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy --schema /tmp/task168-prisma/schema.prisma' \
        < <(printf 'DATABASE_URL=%s\n' "${PROD_TASK168_DATABASE_URL}") || {
        echo "[prod-task168] M11 prisma migrate deploy failed" >&2
        return 1
      }

      local final_rows
      final_rows="$(prod_ledger_rows "$(_task168_all_csv)")" || return 1
      _rows_equal "${final_rows}" "${PROD_TASK168_M1[@]}" "${PROD_TASK168_M8}" "${PROD_TASK168_M9}" "${PROD_TASK168_M10}" "${PROD_TASK168_M11}" ||
        { echo "[prod-task168] post-M11 ledger does not match the expected full set" >&2; return 1; }
      applied_count="$(grep -c '.' <<< "${final_rows}")" || return 1

      stage_content="$(jq -nc --arg release "${release_sha}" --arg api "${api_image}" --arg db "${db_id}" --argjson applied "${applied_count}" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{schemaVersion:1,kind:"migrationStage",status:"MIGRATION_COMMITTED",releaseSha:$release,apiImage:$api,databaseIdentity:$db,appliedCount:$applied,completedAt:$at}')" || return 1
      prod_write_receipt "${migration_stage_receipt}" "${stage_content}" || return 1
    fi
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

# Runs after deploy-prod.sh's own health check passes, before it promotes the
# candidate manifest. Public read surface only (no auth): the full
# cursor-paginated tournament list, every tournament's detail, and every
# v1_tournament_match_details row's public match detail. A non-200 anywhere
# is a release-blocking failure (a private/draft tournament's legitimate
# 403/404 is not distinguished from a real regression here -- Task 6's
# real-data run is expected to confirm whether that distinction is needed).
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

  local failures=0 checked=0
  local tournament_ids=() cursor='' has_next=true page_count=0

  # This repo's list responses carry their cursor inside `data.pageInfo`
  # (`{nextCursor,hasNext}`), never a top-level `data.nextCursor` -- walk it
  # to exhaustion instead of reading only the first page.
  while [[ "${has_next}" == true ]]; do
    page_count=$((page_count + 1))
    if [[ "${page_count}" -gt 500 ]]; then
      echo "[prod-task168] tournament list pagination exceeded 500 pages -- refusing to loop further" >&2
      failures=$((failures + 1))
      break
    fi
    local url="${base_url}/tournaments" page_response page_ids encoded_cursor
    if [[ -n "${cursor}" ]]; then
      encoded_cursor="$(jq -rn --arg c "${cursor}" '$c|@uri')" || { failures=$((failures + 1)); break; }
      url="${url}?cursor=${encoded_cursor}"
    fi
    page_response="$(curl -fsS --connect-timeout 3 --max-time 10 "${url}")" || {
      echo "[prod-task168] tournament list request failed (page ${page_count})" >&2
      failures=$((failures + 1))
      break
    }
    jq -e '.data.items | type == "array"' <<< "${page_response}" >/dev/null 2>&1 || {
      echo "[prod-task168] tournament list response has an unexpected shape (page ${page_count})" >&2
      failures=$((failures + 1))
      break
    }
    mapfile -t page_ids < <(jq -r '.data.items[].id' <<< "${page_response}")
    tournament_ids+=("${page_ids[@]}")
    has_next="$(jq -r '.data.pageInfo.hasNext // false' <<< "${page_response}")" || { failures=$((failures + 1)); break; }
    cursor="$(jq -r '.data.pageInfo.nextCursor // empty' <<< "${page_response}")" || { failures=$((failures + 1)); break; }
    if [[ "${has_next}" == true && -z "${cursor}" ]]; then
      echo "[prod-task168] tournament list says hasNext=true but returned no cursor -- stopping" >&2
      failures=$((failures + 1))
      break
    fi
  done

  if [[ "${#tournament_ids[@]}" -eq 0 ]]; then
    echo "[prod-task168] tournament list returned zero ids after full pagination" >&2
    failures=$((failures + 1))
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
    '{schemaVersion:1,kind:"runtimeVerification",status:$status,databaseIdentity:$db,checkedCount:$checked,failureCount:$failures,completedAt:$at}')" || return 1
  # Overwrites on every run (unlike prod_write_receipt's idempotent-content
  # contract) -- a retry after a real fix is expected to produce different
  # content for the exact same release.
  install -d -m 700 "${state_dir}" || return 1
  tmp="$(mktemp "${state_dir}/.receipt.XXXXXX")" || return 1
  printf '%s' "${content}" > "${tmp}" || return 1
  chmod 600 "${tmp}" || return 1
  mv "${tmp}" "${state_dir}/runtime-verification.json" || return 1

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

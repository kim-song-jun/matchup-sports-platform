#!/usr/bin/env bash

# Sourced-only helpers for deploy/prod-task168.sh. Prod has no local
# `v1_postgres` service (external RDS), so every query runs in a throwaway
# postgres:16-alpine container. DATABASE_URL never reaches a docker argv (any
# host user can read it via `ps`) or a log line.
#
# Callers `set -Eeuo pipefail` and provide:
#   PROD_TASK168_DATABASE_URL  required, env var only
#   PROD_TASK168_DOCKER        docker invocation (default: "sudo docker")
#   PROD_TASK168_DB_NETWORK    network for the one-off containers (default: deploy_default)
#   PROD_TASK168_STATE_ROOT    receipt/report state root

PROD_TASK168_DB_NETWORK="${PROD_TASK168_DB_NETWORK:-deploy_default}"
PROD_TASK168_STATE_ROOT="${PROD_TASK168_STATE_ROOT:-${PROD_RELEASE_STATE_DIR:-${PROD_HOME_DIR:-/home/ec2-user}/.teameet-prod-releases}/task168}"

# Sets the global _PROD_TASK168_DOCKER_ARGV. A string, not an array, so a
# test can point it at a single fake binary (Ruling R3).
_prod_task168_docker_argv() {
  read -r -a _PROD_TASK168_DOCKER_ARGV <<< "${PROD_TASK168_DOCKER:-sudo docker}"
}

prod_task168_assert_network() {
  _prod_task168_docker_argv
  local found
  found="$("${_PROD_TASK168_DOCKER_ARGV[@]}" network ls --filter "name=^${PROD_TASK168_DB_NETWORK}\$" --format '{{.Name}}')"
  [[ "${found}" == "${PROD_TASK168_DB_NETWORK}" ]] || {
    echo "[prod-task168] docker network unavailable: ${PROD_TASK168_DB_NETWORK}" >&2
    return 1
  }
  printf '%s' "${found}"
}

# stdout = `psql -At -c "$1"` result. Nonzero on any failure (network,
# connection, SQL error under ON_ERROR_STOP=1).
prod_dbq() {
  local sql="$1" stderr_file rc output
  : "${PROD_TASK168_DATABASE_URL:?PROD_TASK168_DATABASE_URL is required}"
  _prod_task168_docker_argv
  stderr_file="$(mktemp)"
  # `--env-file /dev/stdin`, never `--env-file <(...)`: sudo closes fds >= 3
  # before exec, so a process-substitution fd is gone by the time docker
  # opens it (Ruling R13, measured on the prod host).
  output="$("${_PROD_TASK168_DOCKER_ARGV[@]}" run --rm --network "${PROD_TASK168_DB_NETWORK}" \
    --env-file /dev/stdin \
    postgres:16-alpine sh -c 'exec psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -c "$1"' sh "${sql}" \
    < <(printf 'DATABASE_URL=%s\n' "${PROD_TASK168_DATABASE_URL}") \
    2>"${stderr_file}")" && rc=0 || rc=$?
  if [[ "${rc}" -ne 0 ]]; then
    echo "[prod-task168] prod_dbq failed:" >&2
    cat "${stderr_file}" >&2
    rm -f "${stderr_file}"
    return "${rc}"
  fi
  rm -f "${stderr_file}"
  printf '%s' "${output}"
}

# host[:port] of a DATABASE_URL; never touches the password segment.
_prod_task168_url_hostport() {
  local url="$1" rest
  rest="${url#*://}"
  rest="${rest#*@}"
  rest="${rest%%/*}"
  rest="${rest%%\?*}"
  printf '%s' "${rest}"
}

# Ruling R4: sha256(current_database|current_user|system_identifier). RDS
# roles may not read pg_control_system(); only when the narrower query still
# succeeds does it fall back to the URL's host:port. Fails closed otherwise.
prod_db_identity() {
  local full_output rc basic hostport
  full_output="$(prod_dbq "SELECT current_database() || '|' || current_user || '|' || (SELECT system_identifier::text FROM pg_control_system())" 2>/dev/null)" && rc=0 || rc=$?
  if [[ "${rc}" -eq 0 && -n "${full_output}" ]]; then
    printf '%s' "${full_output}" | sha256sum | awk '{print $1}'
    return 0
  fi
  basic="$(prod_dbq "SELECT current_database() || '|' || current_user")" || return 1
  hostport="$(_prod_task168_url_hostport "${PROD_TASK168_DATABASE_URL}")"
  [[ -n "${hostport}" ]] || {
    echo "[prod-task168] cannot resolve DATABASE_URL host:port for the identity fallback" >&2
    return 1
  }
  printf '%s|%s' "${basic}" "${hostport}" | sha256sum | awk '{print $1}'
}

# $1 (required): SQL IN-list of migration names. The full prod ledger has
# 100+ unrelated rows, so no Task168 comparison may read it unscoped.
prod_ledger_rows() {
  local names_csv="${1:?names_csv is required}"
  prod_dbq "SELECT migration_name || '|' || COALESCE(checksum,'') FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND migration_name IN (${names_csv}) ORDER BY migration_name"
}

# alpha's assert_actual_cutover_seals query: the 3 seal trigger counts plus
# the 3 legacy-link counts they drive to zero. Pre-M11 only (see below).
_prod_task168_seal_query() {
  echo "SELECT (SELECT count(*) FROM pg_trigger t WHERE t.tgname='v1_tournament_fixture_retired_write' AND t.tgenabled='A' AND t.tgtype::int=62 AND NOT t.tgisinternal AND t.tgrelid IN ('v1_tournament_fixtures'::regclass,'v1_tournament_fixture_results'::regclass,'v1_tournament_fixture_goals'::regclass,'v1_tournament_fixture_videos'::regclass,'v1_tournament_fixture_advancement_edges'::regclass))::text || '|' || (SELECT count(*) FROM pg_trigger t WHERE t.tgname='v1_tournament_fixture_retired_row_write' AND t.tgenabled='A' AND t.tgtype::int=27 AND NOT t.tgisinternal AND t.tgrelid IN ('v1_tournament_fixtures'::regclass,'v1_tournament_fixture_results'::regclass,'v1_tournament_fixture_goals'::regclass,'v1_tournament_fixture_videos'::regclass,'v1_tournament_fixture_advancement_edges'::regclass))::text || '|' || (SELECT count(*) FROM pg_trigger t WHERE t.tgname='v1_000_tournament_fixture_retired_link' AND t.tgenabled='A' AND t.tgtype::int=23 AND NOT t.tgisinternal AND t.tgrelid IN ('v1_games'::regclass,'v1_tournament_staff_fixture_scopes'::regclass,'v1_operation_audits'::regclass))::text || '|' || (SELECT count(*) FROM v1_games WHERE source_type::text='TOURNAMENT_FIXTURE' OR tournament_fixture_id IS NOT NULL)::text || '|' || (SELECT count(*) FROM v1_tournament_staff_fixture_scopes WHERE fixture_id IS NOT NULL)::text || '|' || (SELECT count(*) FROM v1_operation_audits WHERE fixture_id IS NOT NULL)::text"
}

# "a|b|c" trigger counts only: 0|0|0 (no seal) vs 5|5|3 (committed).
prod_count_cutover_seals() {
  local full
  full="$(prod_dbq "$(_prod_task168_seal_query)")" || return 1
  cut -d'|' -f1-3 <<< "${full}"
}

prod_assert_cutover_seals() {
  local full
  full="$(prod_dbq "$(_prod_task168_seal_query)")" || return 1
  [[ "${full}" == '5|5|3|0|0|0' ]] || {
    echo "[prod-task168] cutover seals or zero-legacy-link counts are not exact: ${full}" >&2
    return 1
  }
}

# Post-M11 counterpart of the seal query. M11 DROPs the 5 legacy tables and
# the 3 link triggers, and Postgres resolves every relation in a query at
# parse time, so the seal query errors out on a migrated database. This one
# uses to_regclass() (NULL instead of an error) and casts only to tables M11
# keeps. Expected: 0|0.
_prod_task168_legacy_retirement_query() {
  echo "SELECT (SELECT count(*) FROM (VALUES ('v1_tournament_fixtures'),('v1_tournament_fixture_results'),('v1_tournament_fixture_goals'),('v1_tournament_fixture_videos'),('v1_tournament_fixture_advancement_edges')) AS legacy(name) WHERE to_regclass(legacy.name) IS NOT NULL)::text || '|' || (SELECT count(*) FROM pg_trigger t WHERE t.tgname='v1_000_tournament_fixture_retired_link' AND t.tgenabled='A' AND t.tgtype::int=23 AND NOT t.tgisinternal AND t.tgrelid IN ('v1_games'::regclass,'v1_tournament_staff_fixture_scopes'::regclass,'v1_operation_audits'::regclass))::text"
}

prod_assert_legacy_tables_retired() {
  local result
  result="$(prod_dbq "$(_prod_task168_legacy_retirement_query)")" || return 1
  [[ "${result}" == '0|0' ]] || {
    echo "[prod-task168] post-M11 retirement invariant not intact (legacy_tables_remaining|link_triggers_remaining = ${result}, expected 0|0)" >&2
    return 1
  }
}

# 0600. A re-run passes only with byte-identical content -- a retry must never
# overwrite evidence written by a different run.
prod_write_receipt() {
  local path="$1" content="$2" existing tmp
  install -d -m 700 "$(dirname "${path}")" || return 1
  if [[ -e "${path}" ]]; then
    existing="$(cat "${path}")" || return 1
    [[ "${existing}" == "${content}" ]] || {
      echo "[prod-task168] receipt already exists with different content: ${path}" >&2
      return 1
    }
    return 0
  fi
  tmp="$(mktemp "$(dirname "${path}")/.receipt.XXXXXX")" || return 1
  printf '%s' "${content}" > "${tmp}" || return 1
  chmod 600 "${tmp}" || return 1
  mv "${tmp}" "${path}" || return 1
}

prod_receipt_sha() {
  sha256sum "$1" | awk '{print $1}'
}

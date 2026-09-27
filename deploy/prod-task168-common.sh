#!/usr/bin/env bash

# Sourced-only helper library for the Task 168 production Stage A/B transition
# runner (deploy/prod-task168.sh). The host has no local `v1_postgres` compose
# service (prod DB is an external RDS instance), so every query here goes
# through a throwaway `postgres:16-alpine` container rather than
# `compose exec v1_postgres`, reusing the DB-URL-never-in-argv shape already
# proven by assert_task168_m11_guard() (deploy/prod-release-common.sh:281-344):
# --env-file with a process-substitution fd, so DATABASE_URL never appears in
# a `docker` argv (visible to any other user on the host via `ps`) or in a
# log line.
#
# Callers must `set -Eeuo pipefail` themselves (same convention as
# prod-release-common.sh) and export/define before use:
#   PROD_TASK168_DATABASE_URL  required, DB connection string, env var only
#   PROD_TASK168_DOCKER        space-separated docker invocation (default: "sudo docker")
#   PROD_TASK168_DB_NETWORK    docker network the one-off DB containers join (default: deploy_default)
#   PROD_TASK168_STATE_ROOT    receipt/report state directory root

PROD_TASK168_DB_NETWORK="${PROD_TASK168_DB_NETWORK:-deploy_default}"
PROD_TASK168_STATE_ROOT="${PROD_TASK168_STATE_ROOT:-${PROD_RELEASE_STATE_DIR:-${PROD_HOME_DIR:-/home/ec2-user}/.teameet-prod-releases}/task168}"

# Out-param convention (sets the global array, does not print): PROD_TASK168_DOCKER
# is a space-separated string on purpose (Ruling R3), so tests can override it
# to a single fake binary path with no "sudo" prefix.
_prod_task168_docker_argv() {
  read -r -a _PROD_TASK168_DOCKER_ARGV <<< "${PROD_TASK168_DOCKER:-sudo docker}"
}

# Confirms the configured network exists before any container joins it, so a
# missing network fails with a clear message instead of an opaque docker
# error buried in a psql/pg_dump/migrate invocation.
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
  output="$("${_PROD_TASK168_DOCKER_ARGV[@]}" run --rm --network "${PROD_TASK168_DB_NETWORK}" \
    --env-file <(printf 'DATABASE_URL=%s\n' "${PROD_TASK168_DATABASE_URL}") \
    postgres:16-alpine sh -c 'exec psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -c "$1"' sh "${sql}" \
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

# Parameter-expansion-only URL parsing (no external tool, no eval) -- strips
# scheme/userinfo/path/query and keeps host[:port]. Never touches the
# password segment.
_prod_task168_url_hostport() {
  local url="$1" rest
  rest="${url#*://}"
  rest="${rest#*@}"
  rest="${rest%%/*}"
  rest="${rest%%\?*}"
  printf '%s' "${rest}"
}

# sha256(current_database()|current_user|system_identifier). RDS-managed
# Postgres roles can leave pg_control_system() unreadable even on an
# otherwise healthy connection (see Ruling R4) -- inet_server_addr() is
# deliberately not used (unstable on RDS). On any failure of the full query,
# a second, narrower query (no pg_control_system) tells "DB unreachable"
# apart from "this one administrative function is unreadable"; only the
# latter falls back to a DATABASE_URL host:port component instead of the
# system identifier. Fails closed (nonzero, no fallback guess) when even the
# narrow query fails.
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

prod_ledger_rows() {
  prod_dbq "SELECT migration_name || '|' || COALESCE(checksum,'') FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name"
}

# Same catalog query as alpha's assert_actual_cutover_seals
# (deploy/task168-stage-a-migrate.sh) -- the 3 committed-seal trigger counts
# plus the 3 legacy-link counts those seals drive to zero.
_prod_task168_seal_query() {
  echo "SELECT (SELECT count(*) FROM pg_trigger t WHERE t.tgname='v1_tournament_fixture_retired_write' AND t.tgenabled='A' AND t.tgtype::int=62 AND NOT t.tgisinternal AND t.tgrelid IN ('v1_tournament_fixtures'::regclass,'v1_tournament_fixture_results'::regclass,'v1_tournament_fixture_goals'::regclass,'v1_tournament_fixture_videos'::regclass,'v1_tournament_fixture_advancement_edges'::regclass))::text || '|' || (SELECT count(*) FROM pg_trigger t WHERE t.tgname='v1_tournament_fixture_retired_row_write' AND t.tgenabled='A' AND t.tgtype::int=27 AND NOT t.tgisinternal AND t.tgrelid IN ('v1_tournament_fixtures'::regclass,'v1_tournament_fixture_results'::regclass,'v1_tournament_fixture_goals'::regclass,'v1_tournament_fixture_videos'::regclass,'v1_tournament_fixture_advancement_edges'::regclass))::text || '|' || (SELECT count(*) FROM pg_trigger t WHERE t.tgname='v1_000_tournament_fixture_retired_link' AND t.tgenabled='A' AND t.tgtype::int=23 AND NOT t.tgisinternal AND t.tgrelid IN ('v1_games'::regclass,'v1_tournament_staff_fixture_scopes'::regclass,'v1_operation_audits'::regclass))::text || '|' || (SELECT count(*) FROM v1_games WHERE source_type::text='TOURNAMENT_FIXTURE' OR tournament_fixture_id IS NOT NULL)::text || '|' || (SELECT count(*) FROM v1_tournament_staff_fixture_scopes WHERE fixture_id IS NOT NULL)::text || '|' || (SELECT count(*) FROM v1_operation_audits WHERE fixture_id IS NOT NULL)::text"
}

# write|row_write|link trigger counts only, as "a|b|c" -- used by the state
# machine to tell 0|0|0 (no seals yet) apart from 5|5|3 (committed) without
# requiring the full 6-value zero-legacy assertion.
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

# 0600. Idempotent: a re-run that finds an existing receipt passes only when
# the new content is byte-identical -- a retry must never silently overwrite
# evidence written by a different run.
prod_write_receipt() {
  local path="$1" content="$2" existing tmp
  install -d -m 700 "$(dirname "${path}")"
  if [[ -e "${path}" ]]; then
    existing="$(cat "${path}")"
    [[ "${existing}" == "${content}" ]] || {
      echo "[prod-task168] receipt already exists with different content: ${path}" >&2
      return 1
    }
    return 0
  fi
  tmp="$(mktemp "$(dirname "${path}")/.receipt.XXXXXX")"
  printf '%s' "${content}" > "${tmp}"
  chmod 600 "${tmp}"
  mv "${tmp}" "${path}"
}

prod_receipt_sha() {
  sha256sum "$1" | awk '{print $1}'
}

#!/usr/bin/env bash

# Read-only. Run on the Alpha host (via SSM RunShellScript, never locally —
# GH Actions has no other path to the StageA transition receipt or the live
# DB identity/resolved-migration-attempt snapshot, all of which only exist
# on the host). The workflow base64-encodes THIS FILE from the checkout and
# ships its bytes inline in the SSM command rather than referencing a path
# on the host — the host's live tree is whatever a PRIOR StageA push
# deployed, which may predate this script's own existence. See
# .github/workflows/deploy-alpha.yml's "Resolve Task168 StageA predecessor
# transition" step, which is the only caller.
#
# Prints one JSON object to stdout: {path, sha256, apiImage,
# databaseIdentity, resolvedMigrationAttemptsSha256}. Mutates nothing.

set -Eeuo pipefail

usage() { echo "usage: $0 <predecessor-release-sha>" >&2; exit 64; }
[[ $# -eq 1 ]] || usage
readonly PREDECESSOR_SHA="$1"
[[ "${PREDECESSOR_SHA}" =~ ^[0-9a-f]{40}$ ]] || usage

state_dir="${ALPHA_RELEASE_STATE_DIR:-/home/ec2-user/.teameet-alpha-releases}/task168/${PREDECESSOR_SHA}"
transition="${state_dir}/transition.json"
[[ -f "${transition}" ]] || { echo "no StageA transition receipt for ${PREDECESSOR_SHA}" >&2; exit 1; }

api_image="$(jq -er '.apiImage' "${transition}")"

# Not `docker compose`: it resolves the whole model before any subcommand, and
# the alpha compose files require image variables only deploy-alpha.sh exports,
# so every compose call fails on interpolation in this standalone SSM shell.
postgres_id="$(docker ps -q \
  --filter label=com.docker.compose.project="${ALPHA_COMPOSE_PROJECT:-deploy}" \
  --filter label=com.docker.compose.service=v1_postgres)"
[[ "$(printf '%s\n' "${postgres_id}" | grep -c .)" == 1 ]] ||
  { echo 'expected exactly one running database container' >&2; exit 1; }

# Role and database come from the container's own environment, as in
# deploy/task168-stage-b-migrate.sh: the operator env file is not sourced into
# this shell, so a hardcoded default would name a role the host may not have.
db_env="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "${postgres_id}")"
db_user="$(awk -F= '$1=="POSTGRES_USER" {print substr($0,index($0,"=")+1)}' <<< "${db_env}")"
db_name="$(awk -F= '$1=="POSTGRES_DB" {print substr($0,index($0,"=")+1)}' <<< "${db_env}")"
[[ "${db_user}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ && "${db_name}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] ||
  { echo 'database container does not expose one valid POSTGRES_USER/POSTGRES_DB binding' >&2; exit 1; }

# No `-i`: this script is piped into `bash -s`, so a child holding stdin open
# would swallow the not-yet-read remainder of the script itself.
psql_cmd=(docker exec "${postgres_id}" psql -X -v ON_ERROR_STOP=1 -At \
  -U "${db_user}" -d "${db_name}")

db_id="$("${psql_cmd[@]}" -c \
  "SELECT current_database() || '|' || current_user || '|' || COALESCE(inet_server_addr()::text,'local') || '|' || COALESCE(inet_server_port()::text,'local')")"

# Same query and row order as deploy/task168-stage-b-migrate.sh's
# resolved_attempt_rows()/resolved_attempt_sha() — the runner recomputes this
# independently at execution time and
# rejects the manifest if its own answer differs (assert_resolved_attempts),
# so this is a real, checked commitment, not a cosmetic field.
resolved_sha="$("${psql_cmd[@]}" -c \
  "SELECT migration_name || '|' || COALESCE(checksum,'') || '|' || COALESCE(finished_at::text,'') || '|' || COALESCE(rolled_back_at::text,'') FROM \"_prisma_migrations\" WHERE finished_at IS NULL AND rolled_back_at IS NOT NULL ORDER BY migration_name,rolled_back_at,checksum,id" \
  | sha256sum | awk '{print $1}')"

jq -nc \
  --arg path "${transition}" \
  --arg sha "$(sha256sum "${transition}" | awk '{print $1}')" \
  --arg api "${api_image}" \
  --arg db "${db_id}" \
  --arg resolvedSha "${resolved_sha}" \
  '{path:$path,sha256:$sha,apiImage:$api,databaseIdentity:$db,resolvedMigrationAttemptsSha256:$resolvedSha}'

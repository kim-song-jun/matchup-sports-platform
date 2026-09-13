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

live_dir="${ALPHA_LIVE_DIR:-/home/ec2-user/teameet}"
compose_prod="${live_dir}/deploy/docker-compose.prod.yml"
compose_alpha="${live_dir}/deploy/docker-compose.alpha.yml"
env_file="${live_dir}/deploy/.env"
psql_cmd=(docker compose --project-name deploy -f "${compose_prod}" -f "${compose_alpha}" \
  --env-file "${env_file}" exec -T v1_postgres psql -X -v ON_ERROR_STOP=1 -At \
  -U "${V1_DB_USER:-teameet_v1}" -d "${V1_DB_NAME:-teameet_v1}")

db_id="$("${psql_cmd[@]}" -c \
  "SELECT current_database() || '|' || current_user || '|' || COALESCE(inet_server_addr()::text,'local') || '|' || COALESCE(inet_server_port()::text,'local')")"

# Same query and row order as deploy/task168-stage-b-migrate.sh's
# resolved_attempt_rows()/resolved_attempt_sha() (m11-stageb-spec.md §3.3
# L4) — the runner recomputes this independently at execution time and
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

#!/usr/bin/env bash

set -Eeuo pipefail

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

if [[ ! "${ALPHA_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "[alpha-deploy] ALPHA_SHA must be a full lowercase commit SHA" >&2
  exit 1
fi

if [[ ! "${ALPHA_RELEASE_VERSION}" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-alpha\.[0-9]{8}\.g[0-9a-f]{12}$ ]]; then
  echo "[alpha-deploy] ALPHA_RELEASE_VERSION must be a Teameet alpha SemVer prerelease" >&2
  exit 1
fi

readonly LIVE_DIR="/home/ec2-user/teameet"
readonly ENV_FILE="${LIVE_DIR}/deploy/.env"
readonly COMPOSE_PROD="${LIVE_DIR}/deploy/docker-compose.prod.yml"
readonly COMPOSE_ALPHA="${LIVE_DIR}/deploy/docker-compose.alpha.yml"

exec 9>"/home/ec2-user/.teameet-alpha-deploy.lock"
if ! flock -n 9; then
  echo "[alpha-deploy] Another alpha deployment is active" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[alpha-deploy] Missing protected runtime environment file" >&2
  exit 1
fi

for required_path in \
  "${ALPHA_SOURCE_DIR}/deploy/deploy-alpha.sh" \
  "${ALPHA_SOURCE_DIR}/deploy/alpha-release-common.sh" \
  "${ALPHA_SOURCE_DIR}/deploy/alpha-manifest-common.sh" \
  "${ALPHA_SOURCE_DIR}/deploy/alpha-source-common.sh" \
  "${ALPHA_SOURCE_DIR}/deploy/rollback-alpha.sh" \
  "${ALPHA_SOURCE_DIR}/deploy/alpha-sanitize.sql" \
  "${ALPHA_SOURCE_DIR}/deploy/docker-compose.alpha.yml" \
  "${ALPHA_SOURCE_DIR}/deploy/nginx.alpha.conf" \
  "${ALPHA_MANIFEST_FILE}"; do
  if [[ ! -f "${required_path}" ]]; then
    echo "[alpha-deploy] Incomplete release artifact: ${required_path}" >&2
    exit 1
  fi
done

source "${ALPHA_SOURCE_DIR}/deploy/alpha-release-common.sh"
validate_alpha_release_manifest \
  "${ALPHA_MANIFEST_FILE}" \
  "${ALPHA_SHA}" \
  "${ALPHA_RELEASE_VERSION}" \
  "${ALPHA_MANIFEST_SHA256}" \
  "${ALPHA_ECR_REGISTRY}"
validate_alpha_release_source_binding "${ALPHA_MANIFEST_FILE}"
load_alpha_release_manifest "${ALPHA_MANIFEST_FILE}"

had_active=false
if [[ -f "${ALPHA_RELEASE_STATE_FILE}" ]]; then
  had_active=true
fi
runtime_mutated=false
source_activated=false
legacy_api_image=''
legacy_web_image=''
legacy_release_version=''
legacy_release_sha=''

if [[ "${had_active}" == false ]]; then
  [[ -f "${ALPHA_LEGACY_STATE_FILE}" ]] || {
    echo "[alpha-deploy] Legacy release receipt is required for fail-closed first conversion" >&2
    exit 1
  }
  legacy_release_version="$(awk -F= '$1 == "release" { print $2 }' "${ALPHA_LEGACY_STATE_FILE}")"
  legacy_release_sha="$(awk -F= '$1 == "sha" { print $2 }' "${ALPHA_LEGACY_STATE_FILE}")"
  [[ "${legacy_release_version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+-alpha\.[0-9]{8}\.g[0-9a-f]{12}$ ]]
  [[ "${legacy_release_sha}" =~ ^[0-9a-f]{40}$ ]]
  legacy_api_container="$(docker ps -q \
    --filter label=com.docker.compose.project=deploy \
    --filter label=com.docker.compose.service=v1_api | head -n 1)"
  legacy_web_container="$(docker ps -q \
    --filter label=com.docker.compose.project=deploy \
    --filter label=com.docker.compose.service=v1_web | head -n 1)"
  if [[ -n "${legacy_api_container}" ]]; then
    legacy_api_image="$(docker inspect --format '{{.Config.Image}}' "${legacy_api_container}" 2>/dev/null || true)"
  fi
  if [[ -n "${legacy_web_container}" ]]; then
    legacy_web_image="$(docker inspect --format '{{.Config.Image}}' "${legacy_web_container}" 2>/dev/null || true)"
  fi
  [[ "${legacy_api_image}" == "teameet-v1-api:${legacy_release_version}" ]]
  [[ "${legacy_web_image}" == "teameet-v1-web:${legacy_release_version}" ]]
fi

set -a
# shellcheck disable=SC1090 -- protected operator-managed runtime configuration.
source "${ENV_FILE}"
set +a

export COMPOSE_PARALLEL_LIMIT=1
compose=(
  docker compose
  --project-name deploy
  -f "${COMPOSE_PROD}"
  -f "${COMPOSE_ALPHA}"
  --env-file "${ENV_FILE}"
)

restore_on_failure() {
  local status="$?"
  trap - ERR
  archive_failed_candidate
  if [[ "${runtime_mutated}" == true && "${had_active}" == true ]]; then
    echo "[alpha-deploy] Candidate failed; restoring active release" >&2
    if ! restore_active_release; then
      echo "[alpha-deploy] CRITICAL: active release restore failed" >&2
    fi
  elif [[ "${source_activated}" == true && "${had_active}" == false ]]; then
    echo "[alpha-deploy] First immutable candidate failed; restoring legacy source" >&2
    if ! restore_legacy_runtime; then
      echo "[alpha-deploy] CRITICAL: legacy source restore failed" >&2
    fi
  fi
  exit "${status}"
}
trap 'restore_on_failure' ERR

restore_legacy_runtime() {
  [[ -n "${legacy_api_image}" && -n "${legacy_web_image}" ]] || return 1
  restore_legacy_alpha_source || return 1
  ALPHA_API_IMAGE="${legacy_api_image}"
  ALPHA_WEB_IMAGE="${legacy_web_image}"
  ALPHA_RELEASE_VERSION="${legacy_release_version}"
  ALPHA_RELEASE_SHA="${legacy_release_sha}"
  export ALPHA_API_IMAGE ALPHA_WEB_IMAGE ALPHA_RELEASE_VERSION ALPHA_RELEASE_SHA
  "${compose[@]}" up -d --no-deps v1_api v1_web || return 1
  "${compose[@]}" up -d --force-recreate --no-deps nginx || return 1
  local restored_api_container
  local restored_web_container
  restored_api_container="$("${compose[@]}" ps -q v1_api)" || return 1
  restored_web_container="$("${compose[@]}" ps -q v1_web)" || return 1
  [[ -n "${restored_api_container}" && -n "${restored_web_container}" ]] || return 1
  [[ "$(docker inspect --format '{{.Config.Image}} {{.State.Running}}' "${restored_api_container}")" == "${legacy_api_image} true" ]] || return 1
  [[ "$(docker inspect --format '{{.Config.Image}} {{.State.Running}}' "${restored_web_container}")" == "${legacy_web_image} true" ]] || return 1
  curl -fsS --connect-timeout 3 --max-time 10 \
    http://127.0.0.1:8121/api/v1/health | jq -e '.data.checks.db == true' >/dev/null || return 1
  local restored_headers restored_release restored_sha
  restored_headers="$(curl -fsSI --connect-timeout 3 --max-time 10 \
    https://alpha.teameet.co.kr/landing)" || return 1
  restored_release="$(awk -F': ' 'tolower($1) == "x-teameet-release" { gsub("\r", "", $2); print $2 }' <<< "${restored_headers}")"
  restored_sha="$(awk -F': ' 'tolower($1) == "x-teameet-commit" { gsub("\r", "", $2); print $2 }' <<< "${restored_headers}")"
  [[ "${restored_release}" == "${legacy_release_version}" ]] || return 1
  [[ "${restored_sha}" == "${legacy_release_sha}" ]] || return 1
}

if ! command -v rsync >/dev/null 2>&1; then
  echo "[alpha-deploy] Installing missing rsync prerequisite"
  sudo dnf install -y rsync
fi

write_candidate_manifest "${ALPHA_MANIFEST_FILE}"
prepare_alpha_release_source "${ALPHA_SOURCE_DIR}" "${ALPHA_SHA}" "${ALPHA_SOURCE_SHA256}"
activate_alpha_release_source "${ALPHA_SHA}"
source_activated=true
runtime_mutated=true
chmod 600 "${ENV_FILE}"

cpu_count="$(getconf _NPROCESSORS_ONLN)"
load_average="$(awk '{ print $1 }' /proc/loadavg)"
memory_available_kib="$(awk '$1 == "MemAvailable:" { print $2 }' /proc/meminfo)"
swap_free_kib="$(awk '$1 == "SwapFree:" { print $2 }' /proc/meminfo)"
container_count="$(docker ps -q | wc -l | tr -d ' ')"
printf '[alpha-deploy] preflight cpu=%s load=%s mem_available_kib=%s swap_free_kib=%s containers=%s\n' \
  "${cpu_count}" "${load_average}" "${memory_available_kib}" "${swap_free_kib}" "${container_count}"

if (( memory_available_kib < 131072 || swap_free_kib < 131072 )); then
  echo "[alpha-deploy] Host memory or swap headroom is too low" >&2
  false
fi

aws ecr get-login-password --region "${ALPHA_AWS_REGION}" |
  docker login --username AWS --password-stdin "${ALPHA_ECR_REGISTRY}"

pull_release_images
write_release_metadata "${ALPHA_MANIFEST_FILE}"
"${compose[@]}" up -d v1_postgres

for attempt in $(seq 1 30); do
  if "${compose[@]}" exec -T v1_postgres \
    pg_isready -U "${V1_DB_USER:-teameet_v1}" -d "${V1_DB_NAME:-teameet_v1}" >/dev/null 2>&1; then
    break
  fi
  if [[ "${attempt}" -eq 30 ]]; then
    echo "[alpha-deploy] PostgreSQL did not become ready" >&2
    false
  fi
  sleep 2
done

"${compose[@]}" run --rm --no-deps -T v1_api sh -c \
  'cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy'
"${compose[@]}" exec -T v1_postgres \
  psql -v ON_ERROR_STOP=1 \
  -U "${V1_DB_USER:-teameet_v1}" \
  -d "${V1_DB_NAME:-teameet_v1}" < "${LIVE_DIR}/deploy/alpha-sanitize.sql"
"${compose[@]}" run --rm --no-deps -T \
  -e V1_ALPHA_QA_SEED=true \
  -e V1_ALPHA_QA_ORIGIN=https://alpha.teameet.co.kr \
  v1_api sh -c \
  'cd /app/apps/v1_api && ./node_modules/.bin/ts-node prisma/seed-alpha-tournament-qa.ts'

"${compose[@]}" up -d
"${compose[@]}" up -d --force-recreate --no-deps nginx
wait_for_alpha_health_contract
assert_running_release_digests

if [[ "${had_active}" == true ]] &&
  jq -e --slurpfile candidate "${ALPHA_CANDIDATE_MANIFEST}" \
    '.active == $candidate[0]' "${ALPHA_RELEASE_STATE_FILE}" >/dev/null; then
  rm -f "${ALPHA_CANDIDATE_MANIFEST}"
else
  promote_candidate_manifest
fi
trap - ERR
prune_stale_alpha_release_sources \
  "$(jq -er '.active.release.sha' "${ALPHA_RELEASE_STATE_FILE}")" \
  "$(jq -r '.previous.release.sha // empty' "${ALPHA_RELEASE_STATE_FILE}")" ||
  echo "[alpha-deploy] WARNING: stale release source prune failed" >&2
if ! write_legacy_release_state; then
  echo "[alpha-deploy] WARNING: canonical state is active but legacy receipt could not be written" >&2
fi
echo "[alpha-deploy] ${ALPHA_RELEASE_VERSION} (${ALPHA_RELEASE_SHA}) is healthy"

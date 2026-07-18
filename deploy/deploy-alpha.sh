#!/usr/bin/env bash

set -Eeuo pipefail

: "${ALPHA_SOURCE_DIR:?ALPHA_SOURCE_DIR is required}"
: "${ALPHA_SHA:?ALPHA_SHA is required}"
: "${ALPHA_RELEASE_VERSION:?ALPHA_RELEASE_VERSION is required}"

if [[ ! "${ALPHA_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "[alpha-deploy] ALPHA_SHA must be a full lowercase commit SHA" >&2
  exit 1
fi

if [[ ! "${ALPHA_RELEASE_VERSION}" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-alpha\.[0-9]{8}\.g[0-9a-f]{12}$ ]]; then
  echo "[alpha-deploy] ALPHA_RELEASE_VERSION must be a Teameet alpha SemVer prerelease" >&2
  exit 1
fi

readonly LIVE_DIR="/home/ec2-user/teameet"
readonly STATE_FILE="/home/ec2-user/.teameet-alpha-release"
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
  "${ALPHA_SOURCE_DIR}/deploy/alpha-sanitize.sql" \
  "${ALPHA_SOURCE_DIR}/deploy/docker-compose.alpha.yml" \
  "${ALPHA_SOURCE_DIR}/deploy/nginx.alpha.conf"; do
  if [[ ! -f "${required_path}" ]]; then
    echo "[alpha-deploy] Incomplete release artifact: ${required_path}" >&2
    exit 1
  fi
done

readonly release_version="${ALPHA_RELEASE_VERSION}"

echo "[alpha-deploy] Preparing ${release_version} from ${ALPHA_SHA:0:12}"

set -a
# shellcheck disable=SC1090 -- protected operator-managed runtime configuration.
source "${ENV_FILE}"
set +a

export ALPHA_RELEASE_VERSION="${release_version}"
export COMPOSE_PARALLEL_LIMIT=1

compose=(
  docker compose
  --project-name deploy
  -f "${COMPOSE_PROD}"
  -f "${COMPOSE_ALPHA}"
  --env-file "${ENV_FILE}"
)

cpu_count="$(getconf _NPROCESSORS_ONLN)"
load_average="$(awk '{ print $1 }' /proc/loadavg)"
memory_available_kib="$(awk '$1 == "MemAvailable:" { print $2 }' /proc/meminfo)"
swap_free_kib="$(awk '$1 == "SwapFree:" { print $2 }' /proc/meminfo)"
node_count="$(pgrep -c node 2>/dev/null || true)"
browser_count="$(pgrep -fc 'chrome|chromium|playwright' 2>/dev/null || true)"
container_count="$(docker ps -q | wc -l | tr -d ' ')"

printf '[alpha-deploy] preflight cpu=%s load=%s mem_available_kib=%s swap_free_kib=%s node=%s browser=%s containers=%s\n' \
  "${cpu_count}" \
  "${load_average}" \
  "${memory_available_kib}" \
  "${swap_free_kib}" \
  "${node_count}" \
  "${browser_count}" \
  "${container_count}"

if ! awk -v current_load="${load_average}" -v cpu="${cpu_count}" 'BEGIN { exit !(current_load <= cpu * 1.5) }'; then
  echo "[alpha-deploy] Host load is too high for a sequential image build" >&2
  exit 1
fi

if (( memory_available_kib < 262144 || swap_free_kib < 262144 )); then
  echo "[alpha-deploy] Host memory or swap headroom is too low" >&2
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "[alpha-deploy] Installing missing rsync prerequisite"
  sudo dnf install -y rsync
fi

rsync -a --delete \
  --exclude '/deploy/.env' \
  --exclude '/deploy/certbot/' \
  "${ALPHA_SOURCE_DIR}/" "${LIVE_DIR}/"
chmod 600 "${ENV_FILE}"

metadata_snippet="${LIVE_DIR}/deploy/release-metadata.alpha.conf"
metadata_tmp="$(mktemp)"
printf 'add_header X-Teameet-Release "%s" always;\nadd_header X-Teameet-Commit "%s" always;\n' \
  "${release_version}" \
  "${ALPHA_SHA}" > "${metadata_tmp}"
chmod 644 "${metadata_tmp}"
mv "${metadata_tmp}" "${metadata_snippet}"

docker build \
  -f "${LIVE_DIR}/deploy/Dockerfile.v1-api" \
  -t "teameet-v1-api:${release_version}" \
  "${LIVE_DIR}"

docker build \
  -f "${LIVE_DIR}/deploy/Dockerfile.v1-web" \
  --build-arg NEXT_PUBLIC_API_URL=/api/v1 \
  --build-arg INTERNAL_API_ORIGIN="${V1_INTERNAL_API_ORIGIN:-http://v1_api:8121}" \
  --build-arg NEXT_PUBLIC_KAKAO_CLIENT_ID="${KAKAO_CLIENT_ID:-}" \
  --build-arg NEXT_PUBLIC_KAKAO_REDIRECT_URI="${KAKAO_REDIRECT_URI:-}" \
  -t "teameet-v1-web:${release_version}" \
  "${LIVE_DIR}"

"${compose[@]}" up -d v1_postgres

for attempt in $(seq 1 30); do
  if "${compose[@]}" exec -T v1_postgres \
    pg_isready -U "${V1_DB_USER:-teameet_v1}" -d "${V1_DB_NAME:-teameet_v1}" >/dev/null 2>&1; then
    break
  fi

  if [[ "${attempt}" -eq 30 ]]; then
    echo "[alpha-deploy] PostgreSQL did not become ready" >&2
    exit 1
  fi
  sleep 2
done

"${compose[@]}" run --rm --no-deps -T v1_api sh -c \
  'cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy'
"${compose[@]}" exec -T v1_postgres \
  psql \
  -v ON_ERROR_STOP=1 \
  -U "${V1_DB_USER:-teameet_v1}" \
  -d "${V1_DB_NAME:-teameet_v1}" < "${LIVE_DIR}/deploy/alpha-sanitize.sql"
"${compose[@]}" run --rm --no-deps -T \
  -e V1_ALPHA_QA_SEED=true \
  -e V1_ALPHA_QA_ORIGIN=https://alpha.teameet.co.kr \
  v1_api sh -c \
  'cd /app/apps/v1_api && ./node_modules/.bin/ts-node prisma/seed-alpha-tournament-qa.ts'
"${compose[@]}" up -d
"${compose[@]}" up -d --force-recreate --no-deps nginx

for attempt in $(seq 1 36); do
  if curl -fsS --connect-timeout 3 --max-time 10 \
      http://127.0.0.1:8121/api/v1/health |
      jq -e '.data.checks.db == true' >/dev/null 2>&1 &&
    curl -fsS --connect-timeout 3 --max-time 10 \
      https://alpha.teameet.co.kr/landing >/dev/null 2>&1 &&
    [[ "$(curl -sS --connect-timeout 3 --max-time 10 -o /dev/null -w '%{http_code}' \
      https://alpha.teameet.co.kr/v1/home)" == "404" ]]; then
    break
  fi

  if [[ "${attempt}" -eq 36 ]]; then
    echo "[alpha-deploy] Health contract failed" >&2
    exit 1
  fi
  sleep 5
done

state_tmp="$(mktemp)"
printf 'release=%s\nsha=%s\ndeployed_at=%s\n' \
  "${release_version}" \
  "${ALPHA_SHA}" \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${state_tmp}"
chmod 600 "${state_tmp}"
mv "${state_tmp}" "${STATE_FILE}"

for repository in teameet-v1-api teameet-v1-web; do
  mapfile -t legacy_images < <(
    docker images --format '{{.Repository}}:{{.Tag}}' |
      awk -v repository="${repository}" '$0 ~ ("^" repository ":dev\\.[0-9]+$")'
  )
  for image in "${legacy_images[@]}"; do
    docker image rm "${image}" >/dev/null 2>&1 || true
  done

  mapfile -t stale_images < <(
    docker images --format '{{.Repository}}:{{.Tag}}' |
      awk -v repository="${repository}" '$0 ~ ("^" repository ":[0-9]+\\.[0-9]+\\.[0-9]+-alpha\\.[0-9]{8}\\.g[0-9a-f]{12}$")' |
      sort -V |
      head -n -3
  )
  for image in "${stale_images[@]}"; do
    docker image rm "${image}" >/dev/null 2>&1 || true
  done
done

echo "[alpha-deploy] ${release_version} is healthy"

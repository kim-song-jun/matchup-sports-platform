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
  "${compose[@]}" up -d --force-recreate --no-deps \
    v1_api v1_web v1_game_operations_worker || return 1
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
# 이번 이미지 GC(요구사항 1) 를 넣게 된 원인 사고 그 자체: EC2 루트 볼륨이 배포를 거듭할수록
# 차서(dangling 이미지 방치, 2026-08 실측 28G/30G) 결국 pull 도, 심지어 실패 시 복구용
# restore_active_release 재-pull 조차 "no space left on device" 로 실패했다. GC 를 넣어도
# legacy 태그 이미지처럼 GC 대상이 아닌 것들은 계속 쌓일 수 있으므로, 재발을 배포가 실패로
# 끝나기 전에(사후 로그 뒤지기 전에) 조기에 알 수 있게 여기서 함께 찍는다.
disk_available_kib="$(df -Pk "${LIVE_DIR}" | awk 'NR == 2 { print $4 }')"
printf '[alpha-deploy] preflight cpu=%s load=%s mem_available_kib=%s swap_free_kib=%s containers=%s disk_available_kib=%s\n' \
  "${cpu_count}" "${load_average}" "${memory_available_kib}" "${swap_free_kib}" "${container_count}" "${disk_available_kib}"

if (( memory_available_kib < 131072 || swap_free_kib < 131072 )); then
  echo "[alpha-deploy] Host memory or swap headroom is too low" >&2
  false
fi

# 임계값 3GiB: 이번 배포가 새로 pull 하는 이미지(api ~1.2G + web ~0.3G, 실측치) 두 벌 몫의
# 여유로 삼기엔 넉넉하고, 사고 당시의 여유(2.8G, 28G/30G 사용)보다는 위이며 GC 로 정상
# 회복된 상태(18G~19G 여유)보다는 한참 아래다 — 정상 배포 흐름에서는 거의 걸리지 않고,
# GC 가 실패했거나 태그 있는(legacy) 이미지가 다시 쌓이는 이상 징후일 때만 걸린다.
#
# 여기서 배포를 막기로 판단한 이유: 이 preflight 시점은 이미 activate_alpha_release_source
# 로 소스가 전환된 뒤(runtime_mutated=true)라 ERR 트랩(restore_active_release /
# restore_legacy_runtime)이 정상 동작해 안전하게 되감아진다 — 즉 막아도 롤백 경로 자체가
# 막히지 않는다. 반대로 여기서 통과시키면 디스크가 이미 위험 수준인 채로 이미지 pull ·
# postgres 볼륨 쓰기까지 진행하다 더 나쁜 지점에서 실패할 수 있고, 그 실패 지점이 하필
# 복구용 재-pull 도 실패시켰던 바로 그 사고 패턴이다(디스크 부족은 복구 시도 자체를
# 무력화한다는 게 이 사고의 핵심 교훈). 긴급 배포를 막을 위험은 있지만, 그 대가는
# 운영자가 이 로그를 보고 즉시 수동 정리 후 재실행하면 되는 정도다.
if (( disk_available_kib < 3145728 )); then
  echo "[alpha-deploy] Host disk headroom is too low (available_kib=${disk_available_kib}); GC 또는 legacy 이미지 정리가 필요합니다" >&2
  false
fi

# 위 3GiB 는 "이미 위험하니 막는다" 선이라, 그것만 두면 운영자가 받는 첫 신호가 '배포 실패'다
# — 리드타임이 0 이고, 이번 사고가 정확히 그렇게 났다(아무도 디스크가 차는 걸 보지 못한 채
# 91% 에서 배포와 복구가 동시에 막혔다). 그래서 한 단계 앞에 경고선을 둔다.
#
# 임계값 8GiB: GC 가 정상 동작하는 상태의 여유(18G~19G 실측)에서는 안 걸리고, 거기서 절반
# 넘게 줄어들었을 때만 걸린다 — 즉 "차오르고 있다"를 아직 배포가 성공하는 동안 알려준다.
# 차단선(3GiB)까지는 5GiB 남아 있어 배포 몇 번의 여유가 있다. 경고일 뿐이므로 배포는 계속한다.
if (( disk_available_kib < 8388608 )); then
  echo "[alpha-deploy] WARNING: disk headroom shrinking (available_kib=${disk_available_kib}, warn<8GiB, block<3GiB) — 이미지 GC 상태와 legacy 태그 이미지를 점검하세요" >&2
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

readonly RECORDS_PROFILE_REPAIR_MIGRATION="20260819090000_v1_records_profile_integration_repair"

recover_known_records_profile_migration_failure() {
  local migration_table_exists failed_count failure_logs
  migration_table_exists="$("${compose[@]}" exec -T v1_postgres \
    psql -v ON_ERROR_STOP=1 -At \
    -U "${V1_DB_USER:-teameet_v1}" \
    -d "${V1_DB_NAME:-teameet_v1}" \
    -c "SELECT to_regclass('public.\"_prisma_migrations\"') IS NOT NULL")"
  if [[ "${migration_table_exists}" == "f" ]]; then
    return 0
  fi
  [[ "${migration_table_exists}" == "t" ]] || {
    echo "[alpha-deploy] Could not verify the Prisma migration table" >&2
    return 1
  }

  failed_count="$("${compose[@]}" exec -T v1_postgres \
    psql -v ON_ERROR_STOP=1 -At \
    -U "${V1_DB_USER:-teameet_v1}" \
    -d "${V1_DB_NAME:-teameet_v1}" \
    -c "SELECT COUNT(*) FROM \"_prisma_migrations\" WHERE migration_name = '${RECORDS_PROFILE_REPAIR_MIGRATION}' AND finished_at IS NULL AND rolled_back_at IS NULL")"

  [[ "${failed_count}" =~ ^[0-9]+$ ]] || {
    echo "[alpha-deploy] Could not verify the known migration failure state" >&2
    return 1
  }
  if [[ "${failed_count}" == "0" ]]; then
    return 0
  fi
  if [[ "${failed_count}" != "1" ]]; then
    echo "[alpha-deploy] Refusing to auto-recover ${failed_count} unresolved ${RECORDS_PROFILE_REPAIR_MIGRATION} attempts" >&2
    return 1
  fi

  failure_logs="$("${compose[@]}" exec -T v1_postgres \
    psql -v ON_ERROR_STOP=1 -At \
    -U "${V1_DB_USER:-teameet_v1}" \
    -d "${V1_DB_NAME:-teameet_v1}" \
    -c "SELECT COALESCE(logs, '') FROM \"_prisma_migrations\" WHERE migration_name = '${RECORDS_PROFILE_REPAIR_MIGRATION}' AND finished_at IS NULL AND rolled_back_at IS NULL")"

  if [[ "${failure_logs}" != *'null value in column "goalkeeper"'* ]] ||
    [[ "${failure_logs}" != *'v1_game_result_participants'* ]] ||
    [[ "${failure_logs}" != *'23502'* ]]; then
    echo "[alpha-deploy] Refusing to auto-recover an unrecognized ${RECORDS_PROFILE_REPAIR_MIGRATION} failure" >&2
    return 1
  fi

  echo "[alpha-deploy] Marking the reviewed nullable-goalkeeper failure rolled back before retry"
  "${compose[@]}" run --rm --no-deps -T v1_api sh -c \
    "cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate resolve --rolled-back ${RECORDS_PROFILE_REPAIR_MIGRATION}"
}

recover_known_records_profile_migration_failure
"${compose[@]}" run --rm --no-deps -T v1_api sh -c \
  'cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy'
# 게임 운영 플래그 불변 행 시드. 마이그레이션에 DML 을 넣을 수 없고(expand-contract 게이트)
# GameOperationFlagsService.ensureDefaults() 는 platform_ops 가 플래그 API 를 호출할 때만
# 돌기 때문에, 이걸 안 돌리면 갓 배포된 환경의 대회 운영 보드가 500 GAME_READ_FLAG_MISSING
# 으로 죽는다(실제로 alpha 가 그 상태였다 — v1_game_operation_flags 0행).
# 멱등하며 운영자가 바꾼 값을 되돌리지 않는다.
"${compose[@]}" run --rm --no-deps -T v1_api sh -c \
  'cd /app/apps/v1_api && node dist/src/config/game-operation-flags-seed.cli.js'
"${compose[@]}" exec -T v1_postgres \
  psql -v ON_ERROR_STOP=1 \
  -U "${V1_DB_USER:-teameet_v1}" \
  -d "${V1_DB_NAME:-teameet_v1}" < "${LIVE_DIR}/deploy/alpha-sanitize.sql"
"${compose[@]}" run --rm --no-deps -T \
  -e V1_ALPHA_QA_SEED=true \
  -e V1_ALPHA_QA_ORIGIN=https://alpha.teameet.co.kr \
  v1_api sh -c \
  'cd /app/apps/v1_api && ./node_modules/.bin/ts-node prisma/seed-alpha-tournament-qa.ts'
# QA 시드가 매 배포마다 대회를 리셋하므로, 공개 일정을 채우는 fixture-game 백필은 반드시
# QA 시드 뒤에 돌아야 한다(앞에 두면 QA 시드가 만든 픽스처를 못 보고 무의미하다).
#
# competition-config 백필은 **의도적으로 여기 넣지 않는다.** 그 CLI 는 canonical config 행이
# 현재 코드의 레지스트리 상수와 다르면 COMPETITION_CONFIG_SEED_DRIFT 로 하드 실패하는데,
# 그 가드는 옳지만 이 자리에 두면 드리프트가 존재하는 동안 **모든 alpha 배포가 실패**한다.
# 실제로 2026-08-09 alpha 가 그 상태였다 — #277 이 lineup.positions/formations 를 추가했고
# DB 행은 이전 내용이라 CLI 가 거부했다(실측). 배포 파이프라인이 그런 운영 판단
# ("새 버전 발행 후 repoint" vs "행 복원")을 대신 내릴 수는 없으므로, config 채우기는
# QA 시드가 픽스처 생성 시점에 직접 하고(seed-alpha-tournament-qa.ts) 이 CLI 는 운영자가
# 필요할 때 수동으로 돌린다.
#
# fixture-game 백필은 config 가 없는 픽스처를 **격리(quarantine)만 하고 실패하지 않으므로**
# 배포를 깨뜨리지 않는다 — 그래서 이 자리에 두어도 안전하다.
"${compose[@]}" run --rm --no-deps -T v1_api sh -c \
  'cd /app/apps/v1_api && node dist/src/games/migration/fixture-game-backfill.cli.js'
# QA 시드는 더 이상 V1TournamentStanding 행을 만들지 않는다(과거엔 배열 인덱스만으로
# 승점/득실을 하드코딩해 실제 픽스처 결과와 모순되는 값이 나갔다). fixture-game-backfill
# 뒤에서 돌아야 하는 이유는 순위 재계산이 그 백필이 만드는 V1Game.currentOfficialRevision
# (새 경로)을 참조하기 때문 — backfill 전에 돌리면 아직 아무 결과도 없는 채로 계산된다.
# config 가 없거나 유효하지 않은 대회는 격리(quarantine)만 하고 exit 0 을 유지하므로
# (fixture-game-backfill 과 동일한 격리 패턴) 배포를 막지 않는다.
"${compose[@]}" run --rm --no-deps -T v1_api sh -c \
  'cd /app/apps/v1_api && node dist/src/tournaments/tournament-standings-recalculation.cli.js'

"${compose[@]}" up -d
"${compose[@]}" up -d --force-recreate --no-deps \
  v1_api v1_web v1_game_operations_worker
"${compose[@]}" up -d --force-recreate --no-deps nginx
wait_for_alpha_health_contract
wait_for_alpha_worker_healthy
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
# 디스크 정리. 근거·안전성 판단은 prune_stale_alpha_images() 정의부(alpha-release-common.sh)
# 주석 참조 — 요약하면 alpha 롤백은 로컬 이미지 캐시가 아니라 ECR 재-pull 에 의존하므로
# dangling 전용 정리는 롤백 안전성을 해치지 않는다.
#
# 실패해도 배포를 실패시키지 않는다(deploy-prod.sh:372 와 동일 정책) — 여기는 이미
# assert_running_release_digests 로 새 릴리스가 healthy 임을 확인하고 promote 까지 끝낸
# 뒤라, 디스크 정리 실패가 릴리스 자체의 건전성에 영향을 주지 않는다.
if ! prune_stale_alpha_images >/dev/null 2>&1; then
  echo "[alpha-deploy] WARNING: docker image prune failed (디스크 정리만 실패, 릴리스는 정상)" >&2
fi
echo "[alpha-deploy] ${ALPHA_RELEASE_VERSION} (${ALPHA_RELEASE_SHA}) is healthy"

#!/usr/bin/env bash
# deploy/web-replicas-common.sh 의 웹 컨테이너 개수·교체 순서 계약.
# compose·docker 를 함수로 바꿔 어떤 명령이 어떤 순서로 나가는지를 기록해 단언한다.
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG="$(mktemp)"
trap 'rm -f "${LOG}"' EXIT
failures=0

pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; failures=$((failures + 1)); }
expect_log() {
  local label="$1" expected="$2"
  if [[ "$(cat "${LOG}")" == "${expected}" ]]; then pass "${label}"; else
    fail "${label}"; printf '--- 기대\n%s\n--- 실제\n%s\n' "${expected}" "$(cat "${LOG}")"
  fi
}

# 실제 compose·docker 대신 호출을 기록한다.
FAKE_DEFINED='v1_web'          # `compose config --services` 가 돌려줄 서비스
FAKE_UNHEALTHY=''              # healthy 가 되지 않는 서비스
FAKE_ORPHAN=''                 # 남아 있는 v1_web_b 컨테이너 id
FAKE_WEB_B_IMAGE='img:new'
fake_compose() {
  case "$1" in
    config) printf '%s\n' ${FAKE_DEFINED} ;;
    ps) printf 'cid-%s\n' "$3" ;;
    logs) ;;
    *) echo "compose $*" >> "${LOG}" ;;
  esac
}
fake_docker() {
  case "$1" in
    inspect)
      case "$*" in
        *Health.Status*) [[ " ${FAKE_UNHEALTHY} " == *" ${4#cid-} "* ]] && echo starting || echo healthy ;;
        *Config.Image*) echo "${FAKE_WEB_B_IMAGE}" ;;
      esac ;;
    ps) echo "${FAKE_ORPHAN}" ;;
    rm) echo "docker $*" >> "${LOG}" ;;
  esac
}

# shellcheck source=deploy/web-replicas-common.sh
source "${ROOT_DIR}/deploy/web-replicas-common.sh"
compose=(fake_compose)
WEB_DOCKER=(fake_docker)
WEB_HEALTH_POLL_SECONDS=0
WEB_HEALTH_ATTEMPTS=2
export WEB_REPLICAS_MEM_TOTAL_KIB=4000000

echo '[web-replicas] 설정값 판정'
configure_web_replicas '' 1 3500000 && [[ "${WEB_REPLICAS}" == 1 && ${#WEB_COMPOSE_ARGS[@]} -eq 0 ]] &&
  pass '값이 비면 기본값 1: 프로필 인자 없음' || fail '값이 비면 기본값 1'
configure_web_replicas '' 2 1800000 && [[ "${WEB_REPLICAS}" == 2 && "${WEB_COMPOSE_ARGS[*]}" == '--profile web-pair' ]] &&
  pass '값이 비면 기본값 2(alpha): web-pair 프로필' || fail '값이 비면 기본값 2'
if configure_web_replicas 3 1 3500000 2>/dev/null; then fail '3 은 거절해야 한다'; else pass '1·2 가 아닌 값 거절'; fi
if WEB_REPLICAS_MEM_TOTAL_KIB=1900000 configure_web_replicas 2 1 3500000 2>/dev/null; then
  fail '2GB 호스트에서 개수 2 를 거절해야 한다'; else pass '2GB 호스트에서 개수 2 거절'; fi
configure_web_replicas 1 1 3500000

echo '[web-replicas] 개수 1: 지금과 같은 명령'
: > "${LOG}"; FAKE_DEFINED='v1_web'
up_base_services
up_app_containers --force-recreate
up_app_containers
expect_log '개수 1 은 예전 명령 그대로' 'compose up -d
compose up -d --force-recreate --no-deps v1_api v1_web v1_game_operations_worker
compose up -d --no-deps v1_api v1_web v1_game_operations_worker'

echo '[web-replicas] 개수 1 설정인데 v1_web_b 컨테이너가 남아 있으면 지운다'
: > "${LOG}"; FAKE_ORPHAN='abc123'
up_app_containers
expect_log '남은 v1_web_b 제거' 'compose up -d --no-deps v1_api v1_web v1_game_operations_worker
docker rm -f teameet_v1_web_b'
FAKE_ORPHAN=''

echo '[web-replicas] 개수 2: 웹을 하나씩, healthy 뒤에 다음으로'
configure_web_replicas 2 1 3500000
FAKE_DEFINED='v1_web v1_web_b'
: > "${LOG}"
up_base_services
up_app_containers --force-recreate
expect_log '개수 2 순서' 'compose up -d v1_postgres v1_uploads_init
compose up -d --force-recreate --no-deps v1_api v1_game_operations_worker
compose up -d --force-recreate --no-deps v1_web
compose exec -T nginx nginx -s reload
compose up -d --force-recreate --no-deps v1_web_b
compose exec -T nginx nginx -s reload'

: > "${LOG}"
up_all_services
expect_log 'prod 의 up -d 대체는 웹 둘 다 순서대로' 'compose up -d v1_postgres v1_uploads_init
compose up -d --no-deps v1_api v1_game_operations_worker
compose up -d --no-deps v1_web
compose exec -T nginx nginx -s reload
compose up -d --no-deps v1_web_b
compose exec -T nginx nginx -s reload'

echo '[web-replicas] 첫 웹이 healthy 가 안 되면 둘째를 건드리지 않고 실패'
: > "${LOG}"; FAKE_UNHEALTHY='v1_web'
if up_app_containers 2>/dev/null; then fail 'unhealthy 인데 성공했다'; else pass 'unhealthy 면 실패'; fi
if grep -q 'v1_web_b' "${LOG}"; then fail '실패한 뒤에도 v1_web_b 를 올렸다'; else pass 'v1_web_b 는 그대로'; fi
FAKE_UNHEALTHY=''

echo '[web-replicas] 롤백 대상이 v1_web_b 를 모르는 옛 릴리스면 개수 1 로 처리'
FAKE_DEFINED='v1_web'; FAKE_ORPHAN='abc123'
: > "${LOG}"
up_app_containers --force-recreate
expect_log '옛 소스는 v1_web 만, 남은 v1_web_b 제거' 'compose up -d --force-recreate --no-deps v1_api v1_web v1_game_operations_worker
docker rm -f teameet_v1_web_b'
FAKE_ORPHAN=''

echo '[web-replicas] 둘째 웹 이미지 검사'
FAKE_DEFINED='v1_web v1_web_b'; resolve_web_services
assert_extra_web_images 'img:new' && pass '같은 이미지는 통과' || fail '같은 이미지는 통과해야 한다'
if assert_extra_web_images 'img:old'; then fail '옛 이미지가 남았는데 통과했다'; else pass '옛 이미지 거절'; fi

if (( failures > 0 )); then echo "[web-replicas] ${failures}건 실패" >&2; exit 1; fi
echo '[web-replicas] passed'

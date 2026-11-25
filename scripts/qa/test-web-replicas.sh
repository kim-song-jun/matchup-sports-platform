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
    fail "${label}"; printf -- '--- 기대\n%s\n--- 실제\n%s\n' "${expected}" "$(cat "${LOG}")"
  fi
}

# 실제 compose·docker 대신 호출을 기록한다.
FAKE_DEFINED='v1_web'          # `compose config --services` 가 돌려줄 서비스
FAKE_UNHEALTHY=''              # healthy 가 되지 않는 서비스
FAKE_ORPHAN=''                 # 남아 있는 v1_web_b 컨테이너 id
FAKE_WEB_B_IMAGE='img:new'
FAKE_NGINX_BEFORE='cid-nginx'  # `compose up -d --no-deps nginx` 앞·뒤의 nginx 컨테이너 id
FAKE_NGINX_AFTER='cid-nginx'
FAKE_NGINX_STATUS=running
FAKE_NGINX_SEEN='marker-1'     # 컨테이너 안에서 읽히는 채우기 표식
FAKE_NGINX_TEST_FAILS=false    # nginx -t 실패
fake_compose() {
  case "$1" in
    config) printf '%s\n' ${FAKE_DEFINED} ;;
    ps)
      if [[ "$3" != nginx ]]; then printf 'cid-%s\n' "$3"
      elif grep -qx 'compose up -d --no-deps nginx' "${LOG}"; then echo "${FAKE_NGINX_AFTER}"
      else echo "${FAKE_NGINX_BEFORE}"; fi ;;
    logs) ;;
    exec)
      if [[ "$*" == 'exec -T nginx cat /etc/nginx/conf.d/.teameet-sync-id' ]]; then echo "${FAKE_NGINX_SEEN}"; return 0; fi
      echo "compose $*" >> "${LOG}"
      [[ "$*" != 'exec -T nginx nginx -t' || "${FAKE_NGINX_TEST_FAILS}" != true ]] ;;
    *)
      echo "compose $*" >> "${LOG}"
      [[ "$*" != 'exec -T nginx nginx -t' || "${FAKE_NGINX_TEST_FAILS}" != true ]] ;;
  esac
}
fake_docker() {
  case "$1" in
    inspect)
      case "$*" in
        *Health.Status*) [[ " ${FAKE_UNHEALTHY} " == *" ${4#cid-} "* ]] && echo starting || echo healthy ;;
        *Config.Image*) echo "${FAKE_WEB_B_IMAGE}" ;;
        *State.Status*) echo "${FAKE_NGINX_STATUS}" ;;
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

echo '[web-replicas] 개수 2: API 를 워커와 따로 먼저 바꾸고 nginx 가 새 주소를 읽은 뒤, 웹은 하나씩 healthy 뒤에 다음으로'
configure_web_replicas 2 1 3500000
# alpha: 오버레이가 DB 컨테이너를 정의하므로 앱보다 먼저 올린다.
FAKE_DEFINED='v1_postgres v1_uploads_init v1_api v1_game_operations_worker v1_web v1_web_b nginx'
: > "${LOG}"
up_base_services
up_app_containers --force-recreate
expect_log '개수 2 순서(alpha)' 'compose up -d v1_postgres v1_uploads_init
compose up -d --force-recreate --no-deps v1_api
compose exec -T nginx nginx -s reload
compose up -d --force-recreate --no-deps v1_game_operations_worker
compose up -d --force-recreate --no-deps v1_web
compose exec -T nginx nginx -s reload
compose up -d --force-recreate --no-deps v1_web_b
compose exec -T nginx nginx -s reload'

# 운영: compose 에 DB 컨테이너가 없다(RDS). 없는 서비스를 부르면 compose 가 "no such service" 로 배포를 죽인다.
FAKE_DEFINED='v1_uploads_init v1_api v1_game_operations_worker v1_web v1_web_b nginx'
: > "${LOG}"
up_all_services
expect_log 'prod 의 up -d 대체는 DB 컨테이너 없이 웹 둘 다 순서대로' 'compose up -d v1_uploads_init
compose up -d --no-deps v1_api
compose exec -T nginx nginx -s reload
compose up -d --no-deps v1_game_operations_worker
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

echo '[web-replicas] nginx 설정 적용: 다시 만들지 reload 할지'
for case_ in 'cid-a cid-a running true reload' 'cid-a cid-b running true none' "'' cid-b running true none" \
  "cid-a '' missing false recreate" 'cid-a cid-a exited true recreate' 'cid-a cid-a restarting true recreate' \
  'cid-a cid-a running false recreate'; do
  eval "set -- ${case_}"
  [[ "$(nginx_apply_action "$1" "$2" "$3" "$4")" == "$5" ]] && pass "앞 '$1' 뒤 '$2' $3 표식 $4 → $5" || fail "앞 '$1' 뒤 '$2' $3 표식 $4 → $5 가 아니다"
done
LIVE_DEPLOY="$(mktemp -d)"
LEGACY_DEPLOY="$(mktemp -d)"
trap 'rm -rf "${LOG}" "${LIVE_DEPLOY}" "${LEGACY_DEPLOY}"' EXIT
mkdir -p "${LIVE_DEPLOY}/runtime-nginx/conf.d"
ln -s "${LIVE_DEPLOY}/runtime-nginx" "${LIVE_DEPLOY}/nginx-live"
echo marker-1 > "${LIVE_DEPLOY}/runtime-nginx/conf.d/.teameet-sync-id"

: > "${LOG}"
apply_nginx_config "${LIVE_DEPLOY}" >/dev/null
expect_log '같은 컨테이너가 지금 폴더를 보면 nginx -t 뒤 reload 만 한다' 'compose up -d --no-deps nginx
compose exec -T nginx nginx -t
compose exec -T nginx nginx -s reload'

: > "${LOG}"; FAKE_NGINX_AFTER='cid-new'
apply_nginx_config "${LIVE_DEPLOY}" >/dev/null
expect_log 'compose 가 서비스 정의 변경으로 새로 만들었으면 nginx -t 만 하고 reload 하지 않는다' 'compose up -d --no-deps nginx
compose exec -T nginx nginx -t'
FAKE_NGINX_AFTER='cid-nginx'

: > "${LOG}"; FAKE_NGINX_SEEN='marker-old'
apply_nginx_config "${LIVE_DEPLOY}" >/dev/null
expect_log '컨테이너가 다른 폴더(옛 클론 등)에 묶여 있으면 다시 만든다' 'compose up -d --no-deps nginx
compose up -d --force-recreate --no-deps nginx
compose exec -T nginx nginx -t'
FAKE_NGINX_SEEN='marker-1'

: > "${LOG}"; FAKE_NGINX_STATUS=restarting
apply_nginx_config "${LIVE_DEPLOY}" >/dev/null
expect_log '같은 컨테이너가 재시작 중이면 다시 만든다' 'compose up -d --no-deps nginx
compose up -d --force-recreate --no-deps nginx
compose exec -T nginx nginx -t'
FAKE_NGINX_STATUS=running

: > "${LOG}"; FAKE_NGINX_TEST_FAILS=true
if apply_nginx_config "${LIVE_DEPLOY}" >/dev/null 2>&1; then fail 'nginx -t 가 실패했는데 성공했다'; else pass 'nginx -t 가 실패하면 실패'; fi
if grep -q 'nginx -s reload' "${LOG}"; then fail 'nginx -t 실패 뒤에도 reload 했다'; else pass 'nginx -t 실패면 reload 하지 않는다'; fi
FAKE_NGINX_AFTER='cid-new'
if apply_nginx_config "${LIVE_DEPLOY}" >/dev/null 2>&1; then fail '새로 만든 nginx 가 설정 검사에 실패했는데 성공했다'; else pass '새로 만든 nginx 도 nginx -t 가 실패하면 실패'; fi
FAKE_NGINX_AFTER='cid-nginx'
FAKE_NGINX_TEST_FAILS=false

: > "${LOG}"
apply_nginx_config "${LEGACY_DEPLOY}" >/dev/null
expect_log 'nginx-live 가 없는 옛 릴리스 소스는 예전처럼 다시 만들고 설정을 검사한다' 'compose up -d --force-recreate --no-deps nginx
compose exec -T nginx nginx -t'
FAKE_NGINX_TEST_FAILS=true
if apply_nginx_config "${LEGACY_DEPLOY}" >/dev/null 2>&1; then fail '옛 릴리스 소스로 만든 nginx 가 설정 검사에 실패했는데 성공했다'; else pass '옛 릴리스 소스도 nginx -t 가 실패하면 실패'; fi
FAKE_NGINX_TEST_FAILS=false

if (( failures > 0 )); then echo "[web-replicas] ${failures}건 실패" >&2; exit 1; fi
echo '[web-replicas] passed'

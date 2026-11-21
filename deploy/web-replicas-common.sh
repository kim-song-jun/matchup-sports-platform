#!/usr/bin/env bash

# 웹(v1_web) 컨테이너 개수와 컨테이너 교체 순서. prod·alpha 배포·롤백 스크립트가 함께 쓴다.
# 호출자는 전역 `compose` 배열을 먼저 정의해야 하고, `sudo docker` 를 써야 하는 호스트(prod)는
# WEB_DOCKER 를 덮어쓴다.
#
# 개수가 1 이면 지금까지와 같은 명령을 그대로 낸다. 2 이면 v1_web, v1_web_b 를 하나씩 다시 만들고
# healthy 가 된 뒤에 다음으로 넘어가서 한쪽은 항상 요청을 받는다(nginx 가 죽은 쪽을 건너뛴다).

WEB_DOCKER=(docker)
WEB_REPLICAS=1
WEB_SERVICES=(v1_web)
WEB_COMPOSE_ARGS=()
# 이번 compose 프로젝트(활성 릴리스 소스)에 실제로 정의된 웹 서비스. resolve_web_services 가 채운다.
WEB_ACTIVE=(v1_web)
WEB_HEALTH_POLL_SECONDS="${WEB_HEALTH_POLL_SECONDS:-5}"
WEB_HEALTH_ATTEMPTS="${WEB_HEALTH_ATTEMPTS:-36}"

# configure_web_replicas <값> <기본값> <개수 2 에 필요한 최소 MemTotal(KiB)>
# 값은 런타임 .env 의 V1_WEB_REPLICAS 다. 비어 있으면 기본값(prod 1, alpha 2)을 쓴다.
configure_web_replicas() {
  local value="${1:-}"
  local default_value="$2"
  local min_mem_kib="$3"
  local mem_total_kib

  [[ -n "${value}" ]] || value="${default_value}"
  case "${value}" in
    1)
      WEB_REPLICAS=1
      WEB_SERVICES=(v1_web)
      WEB_COMPOSE_ARGS=()
      ;;
    2)
      mem_total_kib="${WEB_REPLICAS_MEM_TOTAL_KIB:-$(awk '$1 == "MemTotal:" { print $2 }' /proc/meminfo)}"
      if [[ ! "${mem_total_kib}" =~ ^[0-9]+$ ]] || (( mem_total_kib < min_mem_kib )); then
        echo "[${0##*/}] V1_WEB_REPLICAS=2 는 메모리 ${min_mem_kib}KiB 이상 호스트에서만 켤 수 있습니다 (이 호스트: ${mem_total_kib:-알 수 없음}KiB)" >&2
        return 1
      fi
      WEB_REPLICAS=2
      WEB_SERVICES=(v1_web v1_web_b)
      WEB_COMPOSE_ARGS=(--profile web-pair)
      ;;
    *)
      echo "[${0##*/}] V1_WEB_REPLICAS 는 1 또는 2 여야 합니다 (실제: '${value}')" >&2
      return 1
      ;;
  esac
  WEB_ACTIVE=("${WEB_SERVICES[@]}")
}

# 롤백이 개수 2 를 모르는 옛 릴리스 소스(v1_web_b 가 없는 compose)로 돌아가면 v1_web_b 를 올릴 수 없다.
# 그때는 그 소스가 아는 서비스만 다루고, 남은 v1_web_b 컨테이너는 옛 nginx 설정이 쓰지 않으므로 치운다.
resolve_web_services() {
  local defined
  local service

  defined="$("${compose[@]}" config --services)" || return 1
  WEB_ACTIVE=()
  for service in "${WEB_SERVICES[@]}"; do
    if grep -qx -- "${service}" <<<"${defined}"; then
      WEB_ACTIVE+=("${service}")
    fi
  done
  if [[ "${WEB_ACTIVE[0]:-}" != v1_web ]]; then
    echo "[${0##*/}] compose 프로젝트에 v1_web 서비스가 없습니다" >&2
    return 1
  fi
}

remove_web_pair_orphan() {
  local orphan

  orphan="$("${WEB_DOCKER[@]}" ps -aq --filter 'name=^teameet_v1_web_b$')" || return 1
  if [[ -n "${orphan}" ]]; then
    echo "[${0##*/}] 개수 1 설정이라 남아 있는 v1_web_b 컨테이너를 지웁니다"
    "${WEB_DOCKER[@]}" rm -f teameet_v1_web_b >/dev/null || return 1
  fi
}

wait_for_service_healthy() {
  local service="$1"
  local attempt
  local container
  local health=''

  for attempt in $(seq 1 "${WEB_HEALTH_ATTEMPTS}"); do
    container="$("${compose[@]}" ps -q "${service}")" || return 1
    if [[ -n "${container}" ]]; then
      health="$("${WEB_DOCKER[@]}" inspect --format '{{.State.Health.Status}}' "${container}" 2>/dev/null || true)"
      if [[ "${health}" == healthy ]]; then
        return 0
      fi
    fi
    sleep "${WEB_HEALTH_POLL_SECONDS}"
  done
  echo "[${0##*/}] ${service} 가 healthy 가 되지 않았습니다 (last=${health:-<none>})" >&2
  "${compose[@]}" logs --tail 30 "${service}" >&2 || true
  return 1
}

# 컨테이너를 다시 만들면 IP 가 바뀔 수 있고 nginx 는 upstream 이름을 시작·reload 때만 해석한다.
# reload 가 실패해도(점검 중 등) 옛 설정이 계속 돌고 재시도가 다른 쪽으로 넘기므로 배포를 멈추지 않는다.
# 이어지는 nginx 재생성이 이름을 다시 해석한다.
reload_nginx_upstreams() {
  if ! "${compose[@]}" exec -T nginx nginx -s reload; then
    echo "[${0##*/}] WARNING: nginx reload 에 실패했습니다 — 다음 nginx 재생성이 upstream 을 다시 해석합니다" >&2
  fi
}

# 웹 컨테이너를 하나씩 올린다. 추가 인자(--force-recreate 등)는 compose up 에 그대로 넘긴다.
roll_web_services() {
  local service

  for service in "${WEB_ACTIVE[@]}"; do
    "${compose[@]}" up -d "$@" --no-deps "${service}" || return 1
    wait_for_service_healthy "${service}" || return 1
    reload_nginx_upstreams
  done
}

# 배포 첫 단계: 앱 컨테이너를 뺀 나머지 스택. 개수 1 이면 예전 그대로 `up -d` 한 번이다.
up_base_services() {
  resolve_web_services || return 1
  if (( ${#WEB_ACTIVE[@]} == 1 )); then
    "${compose[@]}" up -d || return 1
    remove_web_pair_orphan || return 1
  else
    "${compose[@]}" up -d v1_postgres v1_uploads_init
  fi
}

# api·web·worker 를 다시 만든다. 개수 1 이면 예전 그대로 한 명령이다.
up_app_containers() {
  resolve_web_services || return 1
  if (( ${#WEB_ACTIVE[@]} == 1 )); then
    "${compose[@]}" up -d "$@" --no-deps v1_api v1_web v1_game_operations_worker || return 1
    remove_web_pair_orphan || return 1
    return 0
  fi
  "${compose[@]}" up -d "$@" --no-deps v1_api v1_game_operations_worker || return 1
  wait_for_service_healthy v1_api || return 1
  roll_web_services "$@"
}

# prod 의 `up -d`(이미지가 바뀐 서비스를 compose 가 알아서 다시 만든다)를 대신한다.
up_all_services() {
  up_base_services || return 1
  if (( ${#WEB_ACTIVE[@]} > 1 )); then
    up_app_containers
  fi
}

# v1_web 은 각 release-common 이 이미 검사한다 — 둘째 이후 웹 컨테이너가 같은 이미지인지 본다.
assert_extra_web_images() {
  local expected_image="$1"
  local service
  local container
  local running_image

  for service in "${WEB_ACTIVE[@]:1}"; do
    container="$("${compose[@]}" ps -q "${service}")" || return 1
    [[ -n "${container}" ]] || return 1
    running_image="$("${WEB_DOCKER[@]}" inspect --format '{{.Config.Image}}' "${container}")" || return 1
    [[ "${running_image}" == "${expected_image}" ]] || return 1
  done
}

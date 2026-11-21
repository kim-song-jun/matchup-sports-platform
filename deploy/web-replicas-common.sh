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

# 개수 1 이면 compose 에 묻지 않는다. 개수 2 일 때 롤백이 v1_web_b 를 모르는 옛 릴리스 소스(compose)로 돌아가면 v1_web_b 를 올릴 수 없다.
# 그때는 그 소스가 아는 서비스만 다루고, 남은 v1_web_b 컨테이너는 옛 nginx 설정이 쓰지 않으므로 치운다.
resolve_web_services() {
  local defined
  local service

  if (( WEB_REPLICAS == 1 )); then
    WEB_ACTIVE=(v1_web)
    return 0
  fi
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
# 이어지는 apply_nginx_config 가 이름을 다시 해석한다.
reload_nginx_upstreams() {
  if ! "${compose[@]}" exec -T nginx nginx -s reload; then
    echo "[${0##*/}] WARNING: nginx reload 에 실패했습니다 — 이어지는 nginx 설정 적용이 upstream 을 다시 해석합니다" >&2
  fi
}

# nginx 가 읽는 설정·정적 파일은 릴리스 소스의 deploy/nginx-live 에 둔다. 이 링크는 릴리스마다 바뀌지 않는
# 런타임 폴더를 가리키고, compose 는 그 하위 폴더를 마운트한다. 파일을 직접 마운트하면 컨테이너를 만들 때의
# 파일(옛 릴리스 소스)에 묶여 reload 로는 새 릴리스를 읽지 못한다. 그래서 폴더째 마운트하고, 마운트된 폴더는
# 그대로 둔 채 안의 파일만 바꾼다(폴더를 바꿔 끼우면 컨테이너는 옛 폴더를 계속 본다).
#
# 이 링크가 없는 릴리스 소스(이 방식 전에 만든 것 — 복구·롤백 대상일 수 있다)는 파일을 직접 마운트하므로,
# 그때는 예전처럼 nginx 를 다시 만들어야 새 파일을 읽는다.
NGINX_SYNC_MARKER=.teameet-sync-id

nginx_live_layout() {
  [[ -L "$1/nginx-live" ]]
}

# sync_nginx_live_config <seed|full> <deploy 폴더> <대상=원본>...
# 대상의 첫 경로 조각이 마운트되는 하위 폴더다. 원본이 폴더면 그 안의 파일을, 파일이면 그 파일을 대상 이름으로
# 둔다(링크는 따라가 내용을 복사한다).
# - full: 하위 폴더마다 원본과 같게 맞추고(없는 파일은 지운다) conf.d 에 이번 채우기 표식을 남긴다. 적용 직전에 부른다.
# - seed: 아직 비어 있는 하위 폴더만 채운다. 앱 컨테이너를 바꾸기 전에 부른다 — 서비스 정의가 바뀐 배포에서는
#   `compose up -d` 가 nginx 를 이 폴더로 먼저 만들 수 있다. 채워진 폴더는 지금 설정 그대로 둔다: 웹 교체 중의
#   reload 가 새 upstream(예: 아직 없는 v1_web_b)을 읽으면 설정이 거부돼 옛 IP 로 남는다.
sync_nginx_live_config() {
  local mode="$1" deploy_dir="$2"
  shift 2
  local live="${deploy_dir}/nginx-live"
  local stage pair dest src sub

  [[ "${mode}" == seed || "${mode}" == full ]] || { echo "[${0##*/}] sync_nginx_live_config: 모드는 seed 또는 full" >&2; return 1; }
  if ! nginx_live_layout "${deploy_dir}"; then
    echo "[${0##*/}] 이 릴리스 소스는 nginx-live 를 쓰지 않아 nginx 설정 폴더를 채우지 않습니다"
    return 0
  fi
  stage="$(mktemp -d)" || return 1
  for pair in "$@"; do
    dest="${pair%%=*}"
    src="${deploy_dir}/${pair#*=}"
    if [[ "${dest}" == "${pair}" || -z "${dest}" || "${dest}" == /* || "${dest}" == *..* ]]; then
      echo "[${0##*/}] nginx 설정 대상 '${pair}' 이 올바르지 않습니다" >&2
      rm -rf "${stage}"
      return 1
    fi
    if [[ -d "${src}" ]]; then
      mkdir -p "${stage}/${dest}" && cp -RL "${src}/." "${stage}/${dest}/"
    else
      mkdir -p "$(dirname "${stage}/${dest}")" && cp -L "${src}" "${stage}/${dest}"
    fi || { rm -rf "${stage}"; return 1; }
  done
  if [[ "${mode}" == full ]]; then
    mkdir -p "${stage}/conf.d" && printf '%s-%s-%s\n' "$(date -u +%Y%m%dT%H%M%SZ)" "$$" "${RANDOM}" > "${stage}/conf.d/${NGINX_SYNC_MARKER}" ||
      { rm -rf "${stage}"; return 1; }
  fi
  chmod -R u=rwX,go=rX "${stage}" || { rm -rf "${stage}"; return 1; }
  for sub in "${stage}"/*; do
    sub="${sub##*/}"
    if [[ "${mode}" == seed && -d "${live}/${sub}" && -n "$(\ls -A "${live}/${sub}")" ]]; then
      continue
    fi
    install -d -m 755 "${live}/${sub}" &&
      rsync -rpt --delete "${stage}/${sub}/" "${live}/${sub}/" || { rm -rf "${stage}"; return 1; }
  done
  rm -rf "${stage}"
}

# nginx_apply_action <앞 컨테이너 id> <뒤 컨테이너 id> <뒤 컨테이너 상태> <컨테이너가 이번 표식을 보는가(true|false)>
# `compose up -d` 가 새로 만들었으면 시작할 때 지금 폴더를 읽었으므로 none, 같은 컨테이너가 돌고 있고 지금 폴더를
# 보면 reload 다. 멈췄거나 재시작 중이거나, 다른 폴더(이 방식 전에 만든 폴더 등)에 묶여 있으면 recreate 다.
nginx_apply_action() {
  if [[ -z "$2" ]]; then
    echo recreate
  elif [[ "$1" != "$2" ]]; then
    echo none
  elif [[ "$3" == running && "$4" == true ]]; then
    echo reload
  else
    echo recreate
  fi
}

# nginx 에 지금 nginx-live 설정을 적용한다(호출 전에 full 로 채운다). 컨테이너는 compose 가 서비스 정의(이미지·
# 마운트·포트)가 바뀌었다고 볼 때와 위 recreate 경우에만 다시 만들고, 그 밖에는 nginx -t 로 확인한 뒤 reload 한다.
apply_nginx_config() {
  local deploy_dir="$1"
  local before after status=missing marker seen_marker seen=false action

  if ! nginx_live_layout "${deploy_dir}"; then
    "${compose[@]}" up -d --force-recreate --no-deps nginx || return 1
    return 0
  fi
  marker="$(cat "${deploy_dir}/nginx-live/conf.d/${NGINX_SYNC_MARKER}")" || return 1
  before="$("${compose[@]}" ps -q nginx)" || return 1
  "${compose[@]}" up -d --no-deps nginx || return 1
  after="$("${compose[@]}" ps -q nginx)" || return 1
  if [[ -n "${after}" ]]; then
    status="$("${WEB_DOCKER[@]}" inspect --format '{{.State.Status}}' "${after}")" || return 1
  fi
  # 표식을 못 읽는 것(옛 폴더에 묶인 컨테이너, 멈춘 컨테이너)도 "지금 폴더를 보지 않는다"는 답이라 실패로 다루지 않는다.
  if [[ "${status}" == running ]]; then
    seen_marker="$("${compose[@]}" exec -T nginx cat "/etc/nginx/conf.d/${NGINX_SYNC_MARKER}" 2>/dev/null || true)"
    [[ "${seen_marker}" != "${marker}" ]] || seen=true
  fi
  action="$(nginx_apply_action "${before}" "${after}" "${status}" "${seen}")"
  echo "[${0##*/}] nginx 설정 적용: ${action} (컨테이너 ${status}, 지금 폴더를 봄: ${seen})"
  case "${action}" in
    reload)
      "${compose[@]}" exec -T nginx nginx -t || return 1
      "${compose[@]}" exec -T nginx nginx -s reload || return 1
      ;;
    recreate)
      "${compose[@]}" up -d --force-recreate --no-deps nginx || return 1
      ;;
  esac
  return 0
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

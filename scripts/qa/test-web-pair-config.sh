#!/usr/bin/env bash
# 웹 컨테이너 개수(V1_WEB_REPLICAS) 설정이 실제 도구에서 해석되는지 본다.
#  - compose: 기본(개수 1)은 v1_web_b 를 내지 않고 `--profile web-pair` 일 때만 낸다. nginx 웹 설정 마운트는 개수와 무관한 nginx-live/web 이다.
#  - nginx: prod·alpha 설정 × 개수 1·2 모두 `nginx -t` 를 통과하고, 개수 1 의 upstream 은 v1_web 하나다.
# docker(compose v2)가 필요하다. nginx 는 compose 에 고정된 이미지를 쓴다(NGINX_TEST_IMAGE 로 바꿀 수 있다).
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}/deploy"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
failures=0
pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; failures=$((failures + 1)); }

printf 'DB_PASSWORD=x\nJWT_SECRET=y\n' > "${WORK}/env"
export V1_API_IMAGE=api@sha256:aaa V1_WEB_IMAGE=web@sha256:bbb ALPHA_API_IMAGE=api@sha256:aaa ALPHA_WEB_IMAGE=web@sha256:bbb

echo '[web-pair-config] compose'
prod=(docker compose -f docker-compose.prod.yml --env-file "${WORK}/env")
alpha=(docker compose -f docker-compose.prod.yml -f docker-compose.alpha.yml --env-file "${WORK}/env")

services_of() { "$@" config --services | sort | tr '\n' ' '; }
if [[ "$(services_of "${prod[@]}")" != *v1_web_b* ]]; then pass 'prod 기본은 v1_web_b 를 내지 않는다'; else fail 'prod 기본에 v1_web_b 가 있다'; fi
if [[ "$(services_of "${prod[@]}" --profile web-pair)" == *v1_web_b* ]]; then pass 'prod --profile web-pair 는 v1_web_b 를 낸다'; else fail 'prod 프로필에 v1_web_b 가 없다'; fi
if [[ "$(services_of "${alpha[@]}")" != *v1_web_b* ]]; then pass 'alpha 도 프로필 없이는 v1_web_b 를 내지 않는다'; else fail 'alpha 기본에 v1_web_b 가 있다'; fi

mount_source() { "$@" config | awk '/target: \/etc\/nginx\/teameet-web/ { print prev } { if ($1 == "source:") prev = $2 }'; }
# 개수에 맞는 nginx-web/<개수> 는 배포가 nginx-live/web 에 채운다(test-nginx-live-reload.sh). 마운트는 개수와 무관하다.
for v in '' 1 2; do
  [[ "$(V1_WEB_REPLICAS="${v}" mount_source "${prod[@]}")" == */nginx-live/web ]] && pass "prod 개수 '${v}': 마운트는 nginx-live/web" || fail "prod 개수 '${v}': 마운트가 nginx-live/web 이 아니다"
  [[ "$(V1_WEB_REPLICAS="${v}" mount_source "${alpha[@]}")" == */nginx-live/web ]] && pass "alpha 개수 '${v}': 마운트는 nginx-live/web" || fail "alpha 개수 '${v}': 마운트가 nginx-live/web 이 아니다"
done

web_b_mounts="$("${prod[@]}" --profile web-pair config | awk '/^  v1_web_b:/ { in_b = 1; next } /^  [a-z_0-9]+:/ { in_b = 0 } in_b && /source: v1_web_b_image_cache|ports:|published:/ { print $0 }')"
if grep -q 'v1_web_b_image_cache' <<<"${web_b_mounts}" && ! grep -qE 'ports:|published:' <<<"${web_b_mounts}"; then
  pass 'v1_web_b 는 자기 이미지 캐시 볼륨을 쓰고 호스트 포트를 열지 않는다'
else
  fail 'v1_web_b 의 볼륨·포트가 기대와 다르다'
fi

echo '[web-pair-config] 종료 유예 · 배포 건강 대기'
duration_seconds() { # compose 가 쓰는 30s · 1m0s 같은 길이를 초로 바꾼다
  awk -v d="$1" 'BEGIN { s = 0; while (match(d, /^[0-9]+[hms]/)) { n = substr(d, 1, RLENGTH - 1) + 0; u = substr(d, RLENGTH, 1); s += n * (u == "h" ? 3600 : u == "m" ? 60 : 1); d = substr(d, RLENGTH + 1) } if (d != "") exit 1; print s }' ||
    { echo "[web-pair-config] compose 에서 길이 값을 읽지 못했습니다: '$1'" >&2; return 1; }
}
web_config="$("${prod[@]}" --profile web-pair config --format json)"
for service in v1_web v1_web_b; do
  grace="$(duration_seconds "$(jq -r ".services.${service}.stop_grace_period // \"10s\"" <<<"${web_config}")")"
  if (( grace > 10 )); then
    pass "${service}: 종료 유예 ${grace}초 — Docker 기본 10초보다 길다"
  else
    fail "${service}: 종료 유예가 Docker 기본 10초 이하다(${grace}초) — 느린 서버 렌더가 잘린다"
  fi
done
# 산술식 안의 명령 치환은 실패해도 set -e 가 잡지 못해 값이 빈 채로 계산된다 — 변수로 먼저 받는다.
start_period="$(duration_seconds "$(jq -r '.services.v1_web.healthcheck.start_period' <<<"${web_config}")")"
check_interval="$(duration_seconds "$(jq -r '.services.v1_web.healthcheck.interval' <<<"${web_config}")")"
check_retries="$(jq -er '.services.v1_web.healthcheck.retries' <<<"${web_config}")"
health_window=$(( start_period + check_interval * check_retries ))
wait_budget="$(env -u WEB_HEALTH_ATTEMPTS -u WEB_HEALTH_POLL_SECONDS bash -c 'source ./web-replicas-common.sh && echo $(( WEB_HEALTH_ATTEMPTS * WEB_HEALTH_POLL_SECONDS ))')"
if (( wait_budget > health_window )); then
  pass "배포의 웹 healthy 대기 ${wait_budget}초가 healthcheck 가 실패를 확정하는 창 ${health_window}초보다 길다"
else
  fail "배포의 웹 healthy 대기 ${wait_budget}초가 healthcheck 실패 확정 창 ${health_window}초 이하다 — 늦게 뜨는 정상 컨테이너에서 배포가 먼저 실패한다"
fi
if grep -rq 'non_idempotent' nginx-web/; then
  fail 'nginx-web 재시도 설정에 non_idempotent 가 있다 — 보낸 POST 가 다른 웹으로 다시 가 두 번 처리된다'
else
  pass 'nginx-web 재시도 설정은 non_idempotent 를 켜지 않는다'
fi

echo '[web-pair-config] nginx -t'
image="${NGINX_TEST_IMAGE:-$(awk '/^  nginx:/ { in_n = 1; next } in_n && $1 == "image:" { print $2; exit }' docker-compose.prod.yml)}"
[[ -n "${image}" ]] || { echo '[web-pair-config] nginx 이미지를 읽지 못했습니다' >&2; exit 1; }
for host in teameet.co.kr alpha.teameet.co.kr; do
  mkdir -p "${WORK}/le/live/${host}"
  openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=${host}" \
    -keyout "${WORK}/le/live/${host}/privkey.pem" -out "${WORK}/le/live/${host}/fullchain.pem" 2>/dev/null
done
mkdir -p "${WORK}/maint" "${WORK}/www"
printf 'add_header X-Teameet-Release "t" always;\n' > "${WORK}/meta.conf"

nginx_run() { # <conf> <개수> <nginx 인자...>
  local conf="$1" replicas="$2"
  shift 2
  docker run --rm --add-host v1_web:127.0.0.1 --add-host v1_web_b:127.0.0.1 --add-host v1_api:127.0.0.1 \
    -v "${PWD}/${conf}:/etc/nginx/conf.d/default.conf:ro" \
    -v "${PWD}/aasa:/etc/nginx/teameet-aasa:ro" \
    -v "${PWD}/maintenance:/etc/nginx/teameet-maintenance:ro" \
    -v "${WORK}/maint:/etc/nginx/maintenance:ro" \
    -v "${WORK}/meta.conf:/etc/nginx/snippets/teameet-release-metadata.conf:ro" \
    -v "${PWD}/nginx.security-headers.conf:/etc/nginx/snippets/teameet-security-headers.conf:ro" \
    -v "${PWD}/nginx.proxy-hide-security-headers.conf:/etc/nginx/snippets/teameet-proxy-hide-security-headers.conf:ro" \
    -v "${PWD}/robots.alpha.txt:/etc/nginx/teameet-robots/robots.txt:ro" \
    -v "${WORK}/le:/etc/letsencrypt" -v "${WORK}/www:/var/www/certbot" \
    -v "${PWD}/nginx-web/${replicas}:/etc/nginx/teameet-web:ro" \
    "${image}" nginx "$@" 2>&1
}
for conf in nginx.conf nginx.alpha.conf; do
  for replicas in 1 2; do
    result="$(nginx_run "${conf}" "${replicas}" -t || true)"
    if grep -q 'test is successful' <<<"${result}"; then
      pass "${conf} 개수 ${replicas}: nginx -t 통과"
    else
      fail "${conf} 개수 ${replicas}: nginx -t 실패"
    fi
  done
  one="$(nginx_run "${conf}" 1 -T | awk '/^upstream v1_web \{/ { in_u = 1 } in_u { print } in_u && /^\}/ { in_u = 0 }')"
  two="$(nginx_run "${conf}" 2 -T | awk '/^upstream v1_web \{/ { in_u = 1 } in_u { print } in_u && /^\}/ { in_u = 0 }')"
  if [[ "$(grep -c 'server ' <<<"${one}")" == 1 && "$(grep -c 'server ' <<<"${two}")" == 2 ]]; then
    pass "${conf}: upstream 서버가 개수 1 은 하나, 개수 2 는 둘"
  else
    fail "${conf}: upstream 서버 수가 기대와 다르다"
  fi
  # nginx -T 는 include 한 파일을 한 번만 보여 주므로, 웹으로 가는 위치마다 재시도 설정을 include 하는지는 원본으로 센다.
  web_locations="$(grep -c 'proxy_pass http://v1_web;' "${conf}")"
  failover_includes="$(grep -cE 'include /etc/nginx/teameet-web/(static-)?failover\.conf;' "${conf}")"
  retry_one="$(nginx_run "${conf}" 1 -T | grep -c 'proxy_next_upstream ' || true)"
  retry_two="$(nginx_run "${conf}" 2 -T | grep -c 'proxy_next_upstream ' || true)"
  if [[ "${web_locations}" -ge 1 && "${web_locations}" == "${failover_includes}" ]]; then
    pass "${conf}: 웹으로 가는 위치 ${web_locations}곳 모두 재시도 설정을 include"
  else
    fail "${conf}: 웹 위치 ${web_locations}곳 중 ${failover_includes}곳만 재시도 설정을 include"
  fi
  if [[ "${retry_one}" == 0 && "${retry_two}" -ge 1 ]]; then
    pass "${conf}: 재시도 설정은 개수 2 에만 있다"
  else
    fail "${conf}: 재시도 설정이 기대와 다르다 (개수 1: ${retry_one}, 개수 2: ${retry_two})"
  fi
  # 웹이 폴링 POST·WebSocket 을 쥐면 종료 신호 뒤에도 닫히지 못하고, 보낸 POST 는 다른 웹으로 재시도되지 않는다.
  socket_block="$(nginx_run "${conf}" 2 -T | awk '/^[[:space:]]*location \^~ \/socket\.io\/ \{/ { in_b = 1 } in_b { print } in_b && /^    \}/ { in_b = 0 }')"
  if grep -q 'proxy_pass http://v1_api;' <<<"${socket_block}" && grep -q 'proxy_set_header Upgrade \$http_upgrade;' <<<"${socket_block}"; then
    pass "${conf}: /socket.io/ 는 웹이 아니라 v1_api 로 간다(Upgrade 전달)"
  else
    fail "${conf}: /socket.io/ 위치가 없거나 v1_api 로 가지 않는다 — Socket.IO 가 웹 컨테이너를 거친다"
  fi
done

if (( failures > 0 )); then echo "[web-pair-config] ${failures}건 실패" >&2; exit 1; fi
echo '[web-pair-config] passed'

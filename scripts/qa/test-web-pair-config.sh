#!/usr/bin/env bash
# 웹 컨테이너 개수(V1_WEB_REPLICAS) 설정이 실제 도구에서 해석되는지 본다.
#  - compose: 기본(개수 1)은 v1_web_b 를 내지 않고 `--profile web-pair` 일 때만 낸다. nginx 마운트는 개수를 따른다.
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
[[ "$(mount_source "${prod[@]}")" == */nginx-web/1 ]] && pass 'prod 기본 마운트는 nginx-web/1' || fail 'prod 기본 마운트가 nginx-web/1 이 아니다'
[[ "$(V1_WEB_REPLICAS=2 mount_source "${prod[@]}")" == */nginx-web/2 ]] && pass 'V1_WEB_REPLICAS=2 면 nginx-web/2' || fail 'V1_WEB_REPLICAS=2 인데 nginx-web/2 가 아니다'
[[ "$(mount_source "${alpha[@]}")" == */nginx-web/2 ]] && pass 'alpha 기본 마운트는 nginx-web/2' || fail 'alpha 기본 마운트가 nginx-web/2 가 아니다'
[[ "$(V1_WEB_REPLICAS=1 mount_source "${alpha[@]}")" == */nginx-web/1 ]] && pass 'alpha 도 1 로 줄일 수 있다' || fail 'alpha 를 1 로 줄일 수 없다'

web_b_mounts="$("${prod[@]}" --profile web-pair config | awk '/^  v1_web_b:/ { in_b = 1; next } /^  [a-z_0-9]+:/ { in_b = 0 } in_b && /source: v1_web_b_image_cache|ports:|published:/ { print $0 }')"
if grep -q 'v1_web_b_image_cache' <<<"${web_b_mounts}" && ! grep -qE 'ports:|published:' <<<"${web_b_mounts}"; then
  pass 'v1_web_b 는 자기 이미지 캐시 볼륨을 쓰고 호스트 포트를 열지 않는다'
else
  fail 'v1_web_b 의 볼륨·포트가 기대와 다르다'
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
done

if (( failures > 0 )); then echo "[web-pair-config] ${failures}건 실패" >&2; exit 1; fi
echo '[web-pair-config] passed'

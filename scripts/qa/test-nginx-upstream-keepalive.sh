#!/usr/bin/env bash
# deploy/nginx.conf · nginx.alpha.conf 가 upstream 연결을 재사용하면서 웹소켓은 그대로 올리는지 실제 nginx 로 확인한다.
#  - 일반 요청: upstream 에는 HTTP/1.1 로 가고 Connection·Upgrade 헤더가 붙지 않는다(전 proxy location).
#  - 순차 요청 20건이 upstream 연결 1~2개로 처리된다(연결 재사용).
#  - 웹소켓 업그레이드 요청(/socket.io/ 등): Upgrade: websocket · Connection: upgrade 가 upstream 까지 간다.
#  - upstream 의 keepalive_timeout 은 Node 기본 keep-alive(5초)보다 짧다(upstream 이 먼저 닫은 연결에 요청을 보내 502 가 나지 않게).
# 가짜 웹·API 를 같은 컨테이너의 3013·8121 에 띄워 요청 헤더·연결 번호를 기록한다. docker 가 필요하다.
# nginx 이미지는 compose 에 고정된 것을 쓴다(NGINX_TEST_IMAGE 로 바꿀 수 있다).
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}/deploy"
WORK="$(mktemp -d)"
NAME="${NGINX_TEST_NAME_PREFIX:-teameet-nginx-keepalive-test}-$$"
cleanup() {
  docker rm -f "${NAME}" >/dev/null 2>&1 </dev/null || true
  rm -rf "${WORK}"
}
trap cleanup EXIT
failures=0
pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; failures=$((failures + 1)); }

image="${NGINX_TEST_IMAGE:-$(awk '/^  nginx:/ { in_n = 1; next } in_n && $1 == "image:" { print $2; exit }' docker-compose.prod.yml)}"
[[ -n "${image}" ]] || { echo '[nginx-keepalive] nginx 이미지를 읽지 못했습니다' >&2; exit 1; }

for host in teameet.co.kr alpha.teameet.co.kr; do
  mkdir -p "${WORK}/le/live/${host}"
  openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=${host}" \
    -keyout "${WORK}/le/live/${host}/privkey.pem" -out "${WORK}/le/live/${host}/fullchain.pem" 2>/dev/null
done
mkdir -p "${WORK}/maint" "${WORK}/www"
printf 'add_header X-Teameet-Release "t" always;\n' > "${WORK}/meta.conf"
cat > "${WORK}/stub.conf" <<'STUB'
pid /tmp/stub.pid;
events {}
http {
  log_format seen 'port=$server_port uri=$uri proto=$server_protocol conn=$connection n=$connection_requests connhdr="$http_connection" upgrade="$http_upgrade"';
  access_log /tmp/stub.log seen;
  error_log /dev/null;
  server { listen 3013; listen 8121; location / { return 200 "ok"; } }
}
STUB

# 워커를 1개로 줄여 순차 요청이 모두 같은 워커(같은 upstream 연결 풀)를 쓰게 한다.
docker_exec() { docker exec "${NAME}" "$@" </dev/null; }
seen() { docker_exec cat /tmp/stub.log; }
reset_seen() { docker_exec sh -c ': > /tmp/stub.log'; }

start_nginx() { # <conf> <웹 개수>
  local conf="$1" replicas="$2"
  docker run -d --rm --name "${NAME}" --add-host v1_web:127.0.0.1 --add-host v1_web_b:127.0.0.1 --add-host v1_api:127.0.0.1 \
    -p 127.0.0.1::443 \
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
    -v "${WORK}/stub.conf:/stub.conf:ro" \
    --entrypoint sh "${image}" -c \
    'sed -i "s/^worker_processes .*/worker_processes 1;/" /etc/nginx/nginx.conf && nginx -c /stub.conf && exec nginx -g "daemon off;"' </dev/null >/dev/null
  PORT=""
  for _ in $(seq 1 50); do
    PORT="$(docker port "${NAME}" 443/tcp 2>/dev/null </dev/null | head -1 | awk -F: '{ print $NF }')"
    if [[ -n "${PORT}" ]] && curl -sk -o /dev/null -H "Host: ${HOST_NAME}" "https://127.0.0.1:${PORT}/landing"; then return 0; fi
    sleep 0.2
  done
  return 1
}

req() { curl -sk --http1.1 --no-keepalive -o /dev/null -H "Host: ${HOST_NAME}" "$@"; }
ws_headers=(-H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGVhbWVldC10ZXN0')

# <포트> <경로>... — 각 경로를 3번 보내 upstream 이 본 요청 헤더가 연결 재사용에 맞는지 본다.
check_plain() {
  local port="$1" path lines bad
  shift
  for path in "$@"; do
    reset_seen
    for _ in 1 2 3; do req "https://127.0.0.1:${PORT}${path}"; done
    lines="$(seen | grep -F "port=${port} " || true)"
    bad="$(grep -vE 'proto=HTTP/1\.1 conn=[0-9]+ n=[0-9]+ connhdr="-" upgrade="-"$' <<<"${lines}" || true)"
    if [[ "$(grep -c . <<<"${lines}")" -ge 3 && -z "${bad}" ]]; then
      pass "${path} → :${port} HTTP/1.1, Connection·Upgrade 없음"
    else
      fail "${path} → :${port} upstream 이 본 요청: ${bad:-<기록 없음>}"
    fi
  done
}

# <포트> <경로> — 웹소켓 업그레이드 요청이 헤더 그대로 upstream 에 닿는지 본다.
check_upgrade() {
  local port="$1" path="$2" line
  reset_seen
  req "${ws_headers[@]}" "https://127.0.0.1:${PORT}${path}"
  line="$(seen | grep -F "port=${port} " | head -1 || true)"
  if grep -qE 'proto=HTTP/1\.1 .*connhdr="[Uu]pgrade" upgrade="websocket"$' <<<"${line}"; then
    pass "웹소켓 ${path} → :${port} 업그레이드 헤더 전달"
  else
    fail "웹소켓 ${path} → :${port} upstream 이 본 요청: ${line:-<기록 없음>}"
  fi
}

# <포트> <경로> — 순차 요청 20건이 upstream 연결 2개 이하로 처리되는지 본다.
check_reuse() {
  local port="$1" path="$2" distinct
  reset_seen
  for _ in $(seq 1 20); do req "https://127.0.0.1:${PORT}${path}"; done
  distinct="$(seen | grep -F "port=${port} " | grep -oE 'conn=[0-9]+' | sort -u | wc -l | tr -d ' ')"
  if [[ "${distinct}" -ge 1 && "${distinct}" -le 2 ]]; then
    pass "${path} 20건 → upstream 연결 ${distinct}개"
  else
    fail "${path} 20건 → upstream 연결 ${distinct}개(재사용되지 않는다)"
  fi
}

for conf in nginx.conf nginx.alpha.conf; do
  HOST_NAME="teameet.co.kr"
  [[ "${conf}" == nginx.alpha.conf ]] && HOST_NAME="alpha.teameet.co.kr"
  for replicas in 1 2; do
    echo "[nginx-keepalive] ${conf} 웹 ${replicas}개"
    if ! start_nginx "${conf}" "${replicas}"; then
      fail "${conf} 웹 ${replicas}개: nginx 가 뜨지 않았다"
      docker logs "${NAME}" 2>&1 </dev/null | tail -5
      docker rm -f "${NAME}" >/dev/null 2>&1 </dev/null || true
      continue
    fi
    # location 마다의 헤더는 웹 개수와 무관하므로 첫 번째 개수에서만 본다. 개수는 upstream 블록(연결 재사용·keepalive_timeout)만 바꾼다.
    if [[ "${replicas}" == 1 ]]; then
      check_plain 3013 /landing /_next/static/x.js '/_next/image?url=x' /images/a.png /fonts/a.woff2
      check_plain 8121 /api/v1/health /api/v1/auth/me /api/v1/auth/login /uploads/a.png /api/v1/calendar/feed/tok
      check_upgrade 3013 '/socket.io/?EIO=4&transport=websocket'
      check_upgrade 3013 /admin-content-preview/x
      check_upgrade 8121 /api/v1/health
    fi
    check_reuse 3013 /landing
    check_reuse 8121 /api/v1/health

    # 모든 upstream 의 keepalive_timeout 이 Node 기본 keep-alive(5초)보다 짧아야 한다.
    declared="$(docker_exec nginx -T 2>/dev/null | awk '/^upstream / { name = $2; in_u = 1; next } in_u && /^}/ { in_u = 0 } in_u && $1 == "keepalive_timeout" { gsub(";", "", $2); print name "=" $2 }')"
    for upstream in v1_api v1_web; do
      value="$(grep -E "^${upstream}=" <<<"${declared}" | head -1 | cut -d= -f2 || true)"
      if [[ "${value}" =~ ^[1-4]s?$ ]]; then
        pass "upstream ${upstream} keepalive_timeout ${value} (< 5s)"
      else
        fail "upstream ${upstream} keepalive_timeout 이 5초 미만으로 선언되지 않았다(${value:-없음})"
      fi
    done
    docker rm -f "${NAME}" >/dev/null 2>&1 </dev/null || true
  done
done

if [[ "${failures}" -ne 0 ]]; then
  echo "[nginx-keepalive] ${failures} 건 실패" >&2
  exit 1
fi
echo '[nginx-keepalive] passed'

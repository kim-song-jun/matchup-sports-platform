#!/usr/bin/env bash
# deploy/nginx.conf · nginx.alpha.conf 의 AI 수집기 속도 제한을 실제 nginx 로 확인한다.
#  - 수집기 UA(GPTBot 등)는 화면(/)과 /_next/image 에서 한도를 넘기면 429 를 받는다.
#  - 사람 UA 와 검색 엔진 UA(Googlebot)는 같은 양을 보내도 전부 통과한다.
#  - 수집기 종류마다 한도가 따로다(GPTBot 이 소진돼도 ClaudeBot 은 통과).
# 가짜 웹(응답 200)을 같은 컨테이너의 3013 에 띄워 실제 설정을 그대로 올린다. docker 가 필요하다.
# nginx 이미지는 compose 에 고정된 것을 쓴다(NGINX_TEST_IMAGE 로 바꿀 수 있다).
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}/deploy"
WORK="$(mktemp -d)"
cid=""
cleanup() {
  [[ -z "${cid}" ]] || docker rm -f "${cid}" >/dev/null 2>&1 || true
  rm -rf "${WORK}"
}
trap cleanup EXIT
failures=0
pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; failures=$((failures + 1)); }

image="${NGINX_TEST_IMAGE:-$(awk '/^  nginx:/ { in_n = 1; next } in_n && $1 == "image:" { print $2; exit }' docker-compose.prod.yml)}"
[[ -n "${image}" ]] || { echo '[nginx-crawler-limit] nginx 이미지를 읽지 못했습니다' >&2; exit 1; }

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
  access_log off;
  error_log /dev/null;
  server { listen 3013; listen 8121; location / { return 200 "ok"; } }
}
STUB

# <URL 패턴> <UA> <횟수> → 상태 코드별 개수를 "200=3 429=7" 로 돌려준다.
codes() {
  local path="$1" ua="$2" count="$3"
  curl -sk -o /dev/null -w '%{http_code}\n' -H "Host: ${HOST_NAME}" -A "${ua}" \
    "https://127.0.0.1:${PORT}${path}?n=[1-${count}]" | sort | uniq -c | awk '{ printf "%s=%s ", $2, $1 }'
}
count_of() { # <결과> <코드>
  local value
  value="$(printf '%s' "$1" | tr ' ' '\n' | awk -F= -v c="$2" '$1 == c { print $2 }')"
  printf '%s' "${value:-0}"
}

run_conf() {
  local conf="$1"
  HOST_NAME="teameet.co.kr"
  [[ "${conf}" == nginx.alpha.conf ]] && HOST_NAME="alpha.teameet.co.kr"
  echo "[nginx-crawler-limit] ${conf}"
  cid="$(docker run -d --rm --add-host v1_web:127.0.0.1 --add-host v1_web_b:127.0.0.1 --add-host v1_api:127.0.0.1 \
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
    -v "${PWD}/nginx-web/1:/etc/nginx/teameet-web:ro" \
    -v "${WORK}/stub.conf:/stub.conf:ro" \
    --entrypoint sh "${image}" -c 'nginx -c /stub.conf && exec nginx -g "daemon off;"' </dev/null)"
  PORT=""
  for _ in $(seq 1 50); do
    PORT="$(docker port "${cid}" 443/tcp 2>/dev/null | head -1 | awk -F: '{ print $NF }')"
    if [[ -n "${PORT}" ]] && curl -sk -o /dev/null -H "Host: ${HOST_NAME}" "https://127.0.0.1:${PORT}/landing"; then break; fi
    sleep 0.2
  done
  [[ -n "${PORT}" ]] || { fail "${conf}: nginx 가 뜨지 않았다"; docker logs "${cid}" 2>&1 | tail -5; return; }

  local result
  result="$(codes /landing GPTBot/1.2 150)"
  if (($(count_of "${result}" 429) >= 60 && $(count_of "${result}" 200) >= 55)); then
    pass "화면: GPTBot 150건 → ${result}"
  else
    fail "화면: GPTBot 150건이 한도를 넘기고도 429 가 부족하다 → ${result}"
  fi
  result="$(codes /landing 'Mozilla/5.0 (compatible; ClaudeBot/1.0)' 5)"
  [[ "$(count_of "${result}" 200)" == 5 ]] && pass "화면: GPTBot 이 소진돼도 ClaudeBot 은 따로 센다 → ${result}" || fail "화면: ClaudeBot 이 GPTBot 한도에 같이 걸렸다 → ${result}"
  result="$(codes /landing 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' 150)"
  [[ "$(count_of "${result}" 200)" == 150 ]] && pass "화면: Googlebot 150건 전부 통과" || fail "화면: 검색 엔진 UA 가 제한됐다 → ${result}"
  result="$(codes /landing 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15' 150)"
  [[ "$(count_of "${result}" 200)" == 150 ]] && pass "화면: 사람 UA 150건 전부 통과" || fail "화면: 사람 UA 가 제한됐다 → ${result}"

  result="$(codes /_next/image Bytespider 300)"
  if (($(count_of "${result}" 429) >= 20)); then
    pass "이미지: Bytespider 300건 → ${result}"
  else
    fail "이미지: Bytespider 300건이 한도를 넘기고도 429 가 부족하다 → ${result}"
  fi
  result="$(codes /_next/image 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15' 300)"
  [[ "$(count_of "${result}" 200)" == 300 ]] && pass "이미지: 사람 UA 300건 전부 통과" || fail "이미지: 사람 UA 가 제한됐다 → ${result}"

  docker rm -f "${cid}" >/dev/null 2>&1 || true
  cid=""
}

for conf in nginx.conf nginx.alpha.conf; do run_conf "${conf}"; done

# 두 설정의 수집기 목록은 같아야 한다(한쪽만 고치면 alpha 에서 보이지 않던 차이가 운영에 간다).
list_of() { awk '/^map \$http_user_agent \$teameet_ai_crawler/ { in_m = 1; next } in_m && /^}/ { exit } in_m { print }' "$1"; }
[[ -n "$(list_of nginx.conf)" && "$(list_of nginx.conf)" == "$(list_of nginx.alpha.conf)" ]] && pass '운영·alpha 수집기 목록이 같다' || fail '운영·alpha 수집기 목록이 다르다'

if [[ "${failures}" -ne 0 ]]; then
  echo "[nginx-crawler-limit] ${failures} 건 실패" >&2
  exit 1
fi
echo '[nginx-crawler-limit] passed'

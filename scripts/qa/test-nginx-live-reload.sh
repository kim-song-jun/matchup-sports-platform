#!/usr/bin/env bash
# 배포가 nginx 를 다시 만들지 않고 설정만 다시 읽히는 계약(deploy/web-replicas-common.sh 의 nginx-live)을 실제 nginx 로 본다.
# - sync_prod_nginx_config · sync_alpha_nginx_config 가 채우는 폴더가 compose 의 nginx-live 마운트와 정확히 맞고 nginx -t 를 통과한다.
# - 같은 컨테이너에 새 릴리스 파일을 채우고 reload 하면 새 헤더·새 upstream 을 읽고, 그동안 요청이 끊기지 않으며 컨테이너는 그대로다.
# - nginx-live 링크가 없는 옛 릴리스 소스는 건드리지 않는다.
# docker(compose v2)·jq 가 필요하다. nginx 는 compose 에 고정된 이미지를 쓴다(NGINX_TEST_IMAGE 로 바꿀 수 있다).
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
NAME="teameet-nginx-live-test-$$"
cleanup() {
  docker rm -f "${NAME}" >/dev/null 2>&1 || true
  rm -rf "${WORK}"
}
trap cleanup EXIT
failures=0
pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; failures=$((failures + 1)); }

# 서버와 같은 모양: ~/teameet 링크 → 릴리스 소스, 릴리스 소스의 deploy/nginx-live 링크 → 런타임 폴더.
release="${WORK}/sources/release-a"
mkdir -p "${release}" "${WORK}/runtime/nginx"
cp -R "${ROOT_DIR}/deploy" "${release}/deploy"
ln -s "${WORK}/runtime/nginx" "${release}/deploy/nginx-live"
ln -s "${release}" "${WORK}/teameet"
write_meta() { # <커밋>
  printf 'add_header X-Teameet-Release "t" always;\nadd_header X-Teameet-Commit "%s" always;\n' "$1" |
    tee "${release}/deploy/release-metadata.prod.conf" > "${release}/deploy/release-metadata.alpha.conf"
}
write_meta c1

export ALPHA_HOME_DIR="${WORK}" ALPHA_LIVE_DIR="${WORK}/teameet" PROD_HOME_DIR="${WORK}" PROD_LIVE_DIR="${WORK}/teameet"
# shellcheck source=deploy/prod-release-common.sh
source "${ROOT_DIR}/deploy/prod-release-common.sh"
# shellcheck source=deploy/alpha-release-common.sh
source "${ROOT_DIR}/deploy/alpha-release-common.sh"
WEB_DOCKER=(docker)
export WEB_REPLICAS_MEM_TOTAL_KIB=4000000

printf 'DB_PASSWORD=x\nJWT_SECRET=y\n' > "${WORK}/env"
export V1_API_IMAGE=api@sha256:aaa V1_WEB_IMAGE=web@sha256:bbb ALPHA_API_IMAGE=api@sha256:aaa ALPHA_WEB_IMAGE=web@sha256:bbb
image="${NGINX_TEST_IMAGE:-$(awk '/^  nginx:/ { in_n = 1; next } in_n && $1 == "image:" { print $2; exit }' "${ROOT_DIR}/deploy/docker-compose.prod.yml")}"
[[ -n "${image}" ]] || { echo '[nginx-live] nginx 이미지를 읽지 못했습니다' >&2; exit 1; }

for host in teameet.co.kr alpha.teameet.co.kr; do
  mkdir -p "${WORK}/le/live/${host}"
  openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=${host}" \
    -keyout "${WORK}/le/live/${host}/privkey.pem" -out "${WORK}/le/live/${host}/fullchain.pem" 2>/dev/null
done
mkdir -p "${WORK}/maint" "${WORK}/www"
cat > "${WORK}/stub.conf" <<'STUB'
pid /tmp/stub.pid;
events {}
http {
  access_log off;
  error_log /dev/null;
  server { listen 3013; listen 8121; location / { return 200 "ok"; } }
}
STUB

compose_files() { # <prod|alpha>
  if [[ "$1" == alpha ]]; then
    printf '%s\n' -f "${WORK}/teameet/deploy/docker-compose.prod.yml" -f "${WORK}/teameet/deploy/docker-compose.alpha.yml"
  else
    printf '%s\n' -f "${WORK}/teameet/deploy/docker-compose.prod.yml"
  fi
}

# compose 가 실제로 만드는 nginx 마운트를 docker run -v 인자로 바꾼다. 서버 전용 경로(인증서·점검 플래그)만 시험 폴더로 돌린다.
MOUNTS=()
nginx_mounts() { # <prod|alpha>
  local files=() line source target
  while IFS= read -r line; do files+=("${line}"); done < <(compose_files "$1")
  MOUNTS=()
  while IFS=$'\t' read -r source target; do
    case "${target}" in
      /etc/letsencrypt) source="${WORK}/le" ;;
      /var/www/certbot) source="${WORK}/www" ;;
      /etc/nginx/maintenance) source="${WORK}/maint" ;;
    esac
    MOUNTS+=(-v "${source}:${target}:ro")
  done < <(docker compose "${files[@]}" --env-file "${WORK}/env" config --format json |
    jq -r '.services.nginx.volumes[] | [.source, .target] | @tsv')
}

mounted_live_dirs() { # <prod|alpha> — compose 가 마운트하는 nginx-live 하위 폴더 이름
  local files=() line
  while IFS= read -r line; do files+=("${line}"); done < <(compose_files "$1")
  docker compose "${files[@]}" --env-file "${WORK}/env" config --format json |
    jq -r '.services.nginx.volumes[].source | select(test("/nginx-live/")) | sub(".*/nginx-live/"; "")' | sort | tr '\n' ' '
}

echo '[nginx-live] 채우는 폴더 = compose 마운트, nginx -t'
for env in prod alpha; do
  for replicas in 1 2; do
    rm -rf "${WORK}/runtime/nginx" && mkdir -p "${WORK}/runtime/nginx"
    configure_web_replicas "${replicas}" 1 1800000
    "sync_${env}_nginx_config" >/dev/null
    synced="$(cd "${WORK}/runtime/nginx" && \ls -1 | sort | tr '\n' ' ')"
    mounted="$(mounted_live_dirs "${env}")"
    if [[ -n "${synced}" && "${synced}" == "${mounted}" ]]; then
      pass "${env} 개수 ${replicas}: 채운 폴더(${synced% })와 compose 마운트가 같다"
    else
      fail "${env} 개수 ${replicas}: 채운 폴더 '${synced}' ≠ 마운트 '${mounted}'"
    fi
    if cmp -s "${WORK}/runtime/nginx/web/upstream.conf" "${ROOT_DIR}/deploy/nginx-web/${replicas}/upstream.conf"; then
      pass "${env} 개수 ${replicas}: web 폴더는 nginx-web/${replicas}"
    else
      fail "${env} 개수 ${replicas}: web 폴더가 nginx-web/${replicas} 가 아니다"
    fi
    nginx_mounts "${env}"
    result="$(docker run --rm --add-host v1_web:127.0.0.1 --add-host v1_web_b:127.0.0.1 --add-host v1_api:127.0.0.1 \
      "${MOUNTS[@]}" "${image}" nginx -t 2>&1 </dev/null || true)"
    if grep -q 'test is successful' <<<"${result}"; then
      pass "${env} 개수 ${replicas}: compose 마운트 그대로 nginx -t 통과"
    else
      fail "${env} 개수 ${replicas}: nginx -t 실패"; printf '%s\n' "${result}" | tail -3
    fi
  done
done

echo '[nginx-live] 파일 권한·옛 파일 정리·마운트 폴더 유지'
configure_web_replicas 1 1 1800000
rm -rf "${WORK}/runtime/nginx" && mkdir -p "${WORK}/runtime/nginx"
sync_prod_nginx_config >/dev/null
inode_before="$(\ls -di "${WORK}/runtime/nginx/conf.d" | awk '{ print $1 }')"
touch "${WORK}/runtime/nginx/conf.d/stale.conf"
sync_prod_nginx_config >/dev/null
inode_after="$(\ls -di "${WORK}/runtime/nginx/conf.d" | awk '{ print $1 }')"
[[ "${inode_before}" == "${inode_after}" ]] && pass '다시 채워도 마운트되는 폴더는 같은 폴더다' || fail '다시 채우자 conf.d 폴더가 바뀌었다'
[[ ! -e "${WORK}/runtime/nginx/conf.d/stale.conf" ]] && pass '원본에 없는 파일은 지운다' || fail '옛 파일이 남았다'
mode="$(stat -c '%a' "${WORK}/runtime/nginx/aasa/apple-app-site-association" 2>/dev/null ||
  stat -f '%Lp' "${WORK}/runtime/nginx/aasa/apple-app-site-association")"
[[ "${mode}" == 644 ]] && pass '정적 파일은 nginx 작업자가 읽을 수 있다(644)' || fail "정적 파일 권한이 ${mode} 다"
if sync_nginx_live_config "${WORK}/teameet/deploy" 'conf.d/../../x=nginx.conf' 2>/dev/null; then
  fail '폴더 밖을 가리키는 대상을 받아들였다'
else
  pass '폴더 밖을 가리키는 대상은 거절한다'
fi

echo '[nginx-live] 같은 컨테이너에서 reload 로 새 릴리스를 읽는다'
write_meta c1
sync_prod_nginx_config >/dev/null
nginx_mounts prod
docker run -d --name "${NAME}" --add-host v1_web:127.0.0.1 --add-host v1_web_b:127.0.0.1 --add-host v1_api:127.0.0.1 \
  -p 127.0.0.1::443 "${MOUNTS[@]}" -v "${WORK}/stub.conf:/stub.conf:ro" \
  --entrypoint sh "${image}" -c 'nginx -c /stub.conf && exec nginx -g "daemon off;"' >/dev/null </dev/null
port=""
commit_of() { curl -sk -D - -o /dev/null -H 'Host: teameet.co.kr' "https://127.0.0.1:${port}/landing" | tr -d '\r' | awk -F': ' 'tolower($1) == "x-teameet-commit" { print $2 }'; }
for _ in $(seq 1 50); do
  port="$(docker port "${NAME}" 443/tcp 2>/dev/null | head -1 | awk -F: '{ print $NF }')"
  [[ -n "${port}" && "$(commit_of 2>/dev/null)" == c1 ]] && break
  sleep 0.2
done
if [[ "$(commit_of)" == c1 ]]; then pass '처음 띄운 nginx 는 c1 헤더'; else fail 'nginx 가 c1 으로 뜨지 않았다'; docker logs "${NAME}" 2>&1 | tail -5; fi
started_before="$(docker inspect --format '{{.State.StartedAt}}' "${NAME}")"

# 새 릴리스: 헤더 c2, 웹 2개 upstream. 채우는 동안과 reload 동안 요청을 계속 보낸다.
codes="${WORK}/codes"
( for _ in $(seq 1 80); do
    curl -sk -o /dev/null -w '%{http_code}\n' -H 'Host: teameet.co.kr' "https://127.0.0.1:${port}/landing" || echo 000
    sleep 0.05
  done > "${codes}" ) &
load_pid=$!
write_meta c2
configure_web_replicas 2 1 1800000
sync_prod_nginx_config >/dev/null
docker exec "${NAME}" nginx -t >/dev/null 2>&1 && docker exec "${NAME}" nginx -s reload >/dev/null 2>&1
for _ in $(seq 1 25); do [[ "$(commit_of)" == c2 ]] && break; sleep 0.2; done
wait "${load_pid}"
[[ "$(commit_of)" == c2 ]] && pass 'reload 뒤 c2 헤더' || fail 'reload 뒤에도 c2 헤더가 아니다'
servers="$(docker exec "${NAME}" nginx -T 2>/dev/null | awk '/^upstream v1_web \{/ { u = 1 } u && /server / { n++ } u && /^\}/ { u = 0 } END { print n + 0 }')"
[[ "${servers}" == 2 ]] && pass 'reload 뒤 upstream 은 웹 2개' || fail "reload 뒤 upstream 서버 ${servers}개"
[[ "$(docker inspect --format '{{.State.StartedAt}}' "${NAME}")" == "${started_before}" ]] &&
  pass '컨테이너는 다시 시작하지 않았다' || fail '컨테이너가 다시 시작됐다'
bad="$(grep -vc '^200$' "${codes}" || true)"
total="$(wc -l < "${codes}" | tr -d ' ')"
[[ "${total}" -gt 0 && "${bad}" -eq 0 ]] && pass "채우기·reload 동안 요청 ${total}개 모두 200" || fail "요청 ${total}개 중 200 아님 ${bad}개"

echo '[nginx-live] 옛 릴리스 소스(링크 없음)'
legacy="${WORK}/legacy"
mkdir -p "${legacy}/runtime-untouched"
cp -R "${ROOT_DIR}/deploy" "${legacy}/deploy"
if nginx_live_layout "${legacy}/deploy"; then fail '링크 없는 소스를 새 방식으로 봤다'; else pass '링크 없는 소스는 옛 방식'; fi
sync_nginx_live_config "${legacy}/deploy" conf.d/default.conf=nginx.conf >/dev/null &&
  [[ ! -e "${legacy}/deploy/nginx-live" ]] && pass '옛 소스에는 아무것도 만들지 않는다' || fail '옛 소스에 nginx-live 를 만들었다'

if (( failures > 0 )); then echo "[nginx-live] ${failures}건 실패" >&2; exit 1; fi
echo '[nginx-live] passed'

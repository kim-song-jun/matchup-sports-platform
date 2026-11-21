#!/usr/bin/env bash
#
# deploy/restart-unhealthy.sh 계약 검증. 가짜 docker 가 컨테이너별 상태를 돌려주고 `restart` 호출을 기록한다.
# 시각은 NOW_EPOCH 로 고정해 유예·쿨다운을 실제 시간 없이 확인한다.
#
# 검증 못 하는 것: 실제 Docker 데몬의 unhealthy 판정과 `docker restart` 의 효과. 서버 설치 뒤 한 번 관찰해야 한다.

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${ROOT}/deploy/restart-unhealthy.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

mkdir -p "${WORK}/bin" "${WORK}/status" "${WORK}/fail"
cat > "${WORK}/bin/docker" <<'STUB'
#!/usr/bin/env bash
case "$1" in
  inspect)
    name="${@: -1}"
    [[ -f "${STUB_DIR}/status/${name}" ]] || exit 1
    cat "${STUB_DIR}/status/${name}"
    ;;
  restart)
    echo "$2" >> "${STUB_DIR}/restarts.log"
    # 재시작하는 동안 다른 프로세스(배포·롤백)가 `flock -n` 으로 잠금을 잡을 수 있는지 기록한다.
    if [[ -n "${STUB_PROBE_LOCK:-}" ]]; then
      if flock -n "${STUB_PROBE_LOCK}" true; then echo free >> "${STUB_DIR}/probe.log"; else echo held >> "${STUB_DIR}/probe.log"; fi
    fi
    [[ ! -f "${STUB_DIR}/fail/$2" ]]
    ;;
  *) echo "unexpected: $*" >&2; exit 2 ;;
esac
STUB
chmod +x "${WORK}/bin/docker"

failures=0
fail() { echo "  FAIL  $1" >&2; failures=$((failures + 1)); }

reset() {
  rm -rf "${WORK}/state" "${WORK}/restarts.log" "${WORK}/probe.log" "${WORK}/status/"* "${WORK}/fail/"*
  : > "${WORK}/restarts.log"
}
set_status() { printf '%s' "$2" > "${WORK}/status/$1"; }
# run <now> [환경 변수...] — 종료 코드는 RC 에 남긴다.
run() {
  local now="$1"; shift
  RC=0
  env STUB_DIR="${WORK}" DOCKER_BIN="${WORK}/bin/docker" STATE_DIR="${WORK}/state" \
    DEPLOY_LOCK_FILE="${WORK}/no-such-lock" NOW_EPOCH="${now}" "$@" bash "${SCRIPT}" > "${WORK}/out.log" 2>&1 || RC=$?
}
restarts() { paste -sd, "${WORK}/restarts.log"; }
expect_restarts() {
  local want="$1" label="$2" got
  got="$(restarts)"
  [[ "${got}" == "${want}" ]] || fail "${label}: 기대 [${want}] 실제 [${got}]"
}

echo "restart-unhealthy.sh:"

reset
set_status teameet_v1_web healthy
run 1000
expect_restarts "" "healthy 는 건드리지 않는다"
[[ "${RC}" == 0 ]] || fail "healthy: 종료 코드 ${RC}"

reset
set_status teameet_v1_web unhealthy
run 1000
expect_restarts "" "처음 본 unhealthy 는 기록만 한다"
run 1100
expect_restarts "" "유예(120초) 안에서는 다시 띄우지 않는다"
run 1120
expect_restarts "teameet_v1_web" "유예가 지나면 다시 띄운다"

reset
set_status teameet_v1_web unhealthy
run 1000
run 1130
expect_restarts "teameet_v1_web" "첫 재시작"
run 1140
run 1300
expect_restarts "teameet_v1_web" "재시작 뒤 다시 unhealthy 라도 쿨다운(600초) 안이면 건너뛴다"
run 1740
expect_restarts "teameet_v1_web,teameet_v1_web" "쿨다운이 지나면 다시 띄운다"

reset
set_status teameet_v1_web unhealthy
run 1000
set_status teameet_v1_web healthy
run 1060
set_status teameet_v1_web unhealthy
run 1200
expect_restarts "" "중간에 healthy 가 되면 유예를 처음부터 센다(1000 이 아니라 1200 부터)"
run 1320
expect_restarts "teameet_v1_web" "새 유예가 지나면 다시 띄운다"

reset
set_status teameet_v1_web starting
set_status teameet_v1_api stopped
run 1000
run 5000
expect_restarts "" "starting · stopped 는 다시 띄우지 않는다"

reset
for name in teameet_v1_web teameet_v1_web_b teameet_v1_api teameet_v1_game_operations_worker teameet_nginx teameet_v1_postgres; do
  set_status "${name}" unhealthy
done
run 1000
run 1200
expect_restarts "teameet_v1_web,teameet_v1_web_b,teameet_v1_api,teameet_v1_game_operations_worker" "앱 컨테이너 4개만 대상이다(nginx · postgres 제외)"

reset
set_status teameet_v1_web unhealthy
set_status teameet_v1_api unhealthy
run 1000
touch "${WORK}/fail/teameet_v1_web"
run 1200
expect_restarts "teameet_v1_web,teameet_v1_api" "한 컨테이너 재시작이 실패해도 나머지는 이어서 처리한다"
[[ "${RC}" == 1 ]] || fail "재시작 실패: 종료 코드 기대 1 실제 ${RC}"

reset
set_status teameet_v1_web unhealthy
run 1000 DEPLOY_LOCK_FILE=
run 1200 DEPLOY_LOCK_FILE=
expect_restarts "" "DEPLOY_LOCK_FILE 이 없으면 아무것도 다시 띄우지 않는다(서버별 잠금 경로를 추측하지 않는다)"
[[ "${RC}" == 1 ]] || fail "DEPLOY_LOCK_FILE 없음: 종료 코드 기대 1 실제 ${RC}"
grep -q "DEPLOY_LOCK_FILE" "${WORK}/out.log" || fail "DEPLOY_LOCK_FILE 없음: 원인을 로그에 남기지 않았다"

reset
set_status teameet_v1_web unhealthy
run 1000
run 1200
expect_restarts "teameet_v1_web" "잠금 파일이 없으면 평소처럼 동작한다"
grep -q "배포 잠금 파일" "${WORK}/out.log" || fail "잠금 파일 없음: 확인하지 못했다는 로그를 남기지 않았다"

reset
set_status teameet_v1_web unhealthy
run 1000
[[ ! -e "${WORK}/no-such-lock" ]] || fail "배포 잠금 파일을 만들면 안 된다(root 소유 파일은 배포 스크립트를 막는다)"

# 배포 잠금: 잠금 파일이 있고 다른 프로세스가 쥐고 있으면(flock -n 실패) 상태도 만들지 않고 아무것도 하지 않는다.
reset
set_status teameet_v1_web unhealthy
: > "${WORK}/deploy.lock"
run 1000 DEPLOY_LOCK_FILE="${WORK}/deploy.lock" FLOCK_BIN=false
run 9000 DEPLOY_LOCK_FILE="${WORK}/deploy.lock" FLOCK_BIN=false
expect_restarts "" "배포 중이면 다시 띄우지 않는다"
[[ ! -e "${WORK}/state" ]] || fail "배포 중에 상태 파일을 만들었다"
[[ "${RC}" == 0 ]] || fail "배포 중: 종료 코드 ${RC}"
run 9000 DEPLOY_LOCK_FILE="${WORK}/deploy.lock" FLOCK_BIN=true
run 9200 DEPLOY_LOCK_FILE="${WORK}/deploy.lock" FLOCK_BIN=true
expect_restarts "teameet_v1_web" "잠금이 비어 있으면 평소처럼 동작한다"

if command -v flock >/dev/null 2>&1; then
  reset
  set_status teameet_v1_web unhealthy
  lock="${WORK}/real.lock"
  : > "${lock}"
  (
    exec 9>"${lock}"
    flock -n 9
    run 1000 DEPLOY_LOCK_FILE="${lock}"
    run 5000 DEPLOY_LOCK_FILE="${lock}"
  )
  expect_restarts "" "실제 flock: 배포 잠금을 쥐고 있는 동안 다시 띄우지 않는다"
  [[ ! -e "${WORK}/state" ]] || fail "실제 flock: 배포 중에 상태 파일을 만들었다"

  # 재시작이 오래 걸리는 동안 배포·롤백이 `flock -n` 으로 잠금을 잡을 수 있어야 한다.
  reset
  set_status teameet_v1_web unhealthy
  : > "${WORK}/probe.lock"
  run 1000 DEPLOY_LOCK_FILE="${WORK}/probe.lock" STUB_PROBE_LOCK="${WORK}/probe.lock"
  run 1200 DEPLOY_LOCK_FILE="${WORK}/probe.lock" STUB_PROBE_LOCK="${WORK}/probe.lock"
  expect_restarts "teameet_v1_web" "재시작 시험 전제: 잠금이 비어 있으면 다시 띄운다"
  [[ "$(paste -sd, "${WORK}/probe.log")" == "free" ]] || fail "재시작하는 동안 배포 잠금을 쥐고 있다: $(paste -sd, "${WORK}/probe.log")"
else
  echo "  SKIP  flock 이 없는 환경 — 실제 flock 시나리오는 CI 에서 확인한다"
fi

if [[ "${failures}" -ne 0 ]]; then
  echo "restart-unhealthy: ${failures} 건 실패" >&2
  exit 1
fi
echo "restart-unhealthy: passed"

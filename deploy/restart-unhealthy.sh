#!/usr/bin/env bash

set -Eeuo pipefail

# unhealthy 로 굳은 앱 컨테이너를 다시 띄운다.
#
# `restart: always` 는 프로세스가 끝났을 때만 컨테이너를 되살린다. 건강검사가 계속 실패해도 Docker 는
# 컨테이너를 `unhealthy` 로 표시만 하고 그대로 둔다. 웹이 heap 한계 근처에서 GC 만 도는 동안은
# 프로세스가 살아 있어서, 죽기 전 수십 분 동안 504 가 났다.
#
# 규칙:
#   - 대상은 앱 컨테이너(웹·API·워커)만이다. nginx 와 postgres 는 건드리지 않는다.
#   - unhealthy 가 UNHEALTHY_GRACE_SECONDS 이상 이어진 컨테이너만 `docker restart` 한다.
#     처음 본 시각을 STATE_DIR 에 적어 두고, 다시 healthy/starting 이 되면 지운다.
#   - 같은 컨테이너는 RESTART_COOLDOWN_SECONDS 안에 두 번 다시 띄우지 않는다. DB 가 죽어서 API 가
#     unhealthy 인 때처럼 재시작이 해결책이 아닌 경우에 재시작 폭풍이 되지 않게 한다.
#   - 배포가 진행 중이면(배포 잠금을 다른 프로세스가 쥐고 있으면) 아무것도 하지 않는다. 잠금 파일을
#     새로 만들지 않는다 — root 가 만든 파일은 ec2-user 의 배포 스크립트가 열 수 없게 된다.

DOCKER_BIN="${DOCKER_BIN:-docker}"
FLOCK_BIN="${FLOCK_BIN:-flock}"
CONTAINERS="${CONTAINERS:-teameet_v1_web teameet_v1_web_b teameet_v1_api teameet_v1_game_operations_worker}"
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-/home/ec2-user/.teameet-prod-deploy.lock}"
STATE_DIR="${STATE_DIR:-/run/teameet-restart-unhealthy}"
UNHEALTHY_GRACE_SECONDS="${UNHEALTHY_GRACE_SECONDS:-120}"
RESTART_COOLDOWN_SECONDS="${RESTART_COOLDOWN_SECONDS:-600}"
NOW_EPOCH="${NOW_EPOCH:-$(date +%s)}"

log() { echo "[restart-unhealthy] $*"; }

# 건강검사가 없으면 `none`, 컨테이너가 없으면 빈 문자열.
health_status() {
  "${DOCKER_BIN}" inspect -f '{{if .State.Running}}{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}{{else}}stopped{{end}}' "$1" 2>/dev/null || true
}

read_epoch() {
  local file="$1"
  [[ -f "${file}" ]] || return 1
  local value
  value="$(<"${file}")"
  [[ "${value}" =~ ^[0-9]+$ ]] || return 1
  printf '%s' "${value}"
}

if [[ -e "${DEPLOY_LOCK_FILE}" ]]; then
  exec 8<"${DEPLOY_LOCK_FILE}"
  if ! "${FLOCK_BIN}" -n 8; then
    log "배포가 진행 중이에요 — 이번 확인은 건너뛰어요"
    exit 0
  fi
fi

mkdir -p "${STATE_DIR}"

failed=0
for name in ${CONTAINERS}; do
  status="$(health_status "${name}")"
  seen_file="${STATE_DIR}/${name}.unhealthy-since"
  restarted_file="${STATE_DIR}/${name}.restarted-at"

  if [[ "${status}" != "unhealthy" ]]; then
    rm -f "${seen_file}"
    continue
  fi

  since="$(read_epoch "${seen_file}" || true)"
  if [[ -z "${since}" ]]; then
    echo "${NOW_EPOCH}" > "${seen_file}"
    log "${name}: unhealthy 를 처음 봤어요 — ${UNHEALTHY_GRACE_SECONDS}초 더 이어지면 다시 띄워요"
    continue
  fi

  elapsed=$((NOW_EPOCH - since))
  if ((elapsed < UNHEALTHY_GRACE_SECONDS)); then
    continue
  fi

  last_restart="$(read_epoch "${restarted_file}" || true)"
  if [[ -n "${last_restart}" ]] && ((NOW_EPOCH - last_restart < RESTART_COOLDOWN_SECONDS)); then
    log "${name}: ${elapsed}초째 unhealthy 지만 ${RESTART_COOLDOWN_SECONDS}초 안에 이미 다시 띄웠어요 — 건너뛰어요"
    continue
  fi

  log "${name}: ${elapsed}초째 unhealthy — 다시 띄워요"
  echo "${NOW_EPOCH}" > "${restarted_file}"
  rm -f "${seen_file}"
  if ! "${DOCKER_BIN}" restart "${name}" >/dev/null; then
    log "${name}: docker restart 가 실패했어요"
    failed=1
  fi
done
exit "${failed}"

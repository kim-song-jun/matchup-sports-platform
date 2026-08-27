#!/usr/bin/env bash

# 불변(immutable) prod 릴리스 상태 기계장치. deploy/alpha-release-common.sh 를 prod 용으로
# 일반화한 것 — 호출자는 `set -Eeuo pipefail` 을 직접 설정하고, 런타임 헬퍼를 부르기 전에
# 전역 `compose` 명령 배열을 정의해야 한다.
#
# 이 파일은 이전에는 `prune_stale_release_tags`(로컬 docker 이미지 SHA 태그 정리) 하나만
# 담고 있었다(#220). 이번 변경으로 EC2 가 더 이상 로컬에서 `docker build`를 하지 않고
# ECR digest 를 그대로 pull 만 하므로(요구사항 1·2), 로컬 SHA 태그가 쌓이는 문제 자체가
# 구조적으로 사라진다 — 그래서 그 함수와 회귀 테스트(scripts/qa/test-prod-release-prune.sh)
# 를 이번 변경에서 완전히 제거했다(CLAUDE.md 기술부채 원칙: 변경으로 인해 죽는 코드는 같은
# 변경에서 청소한다). 대신 이 파일은 alpha 와 동일한 candidate→promote 원자 승격 상태
# 기계장치를 담당한다.

# Compose 를 어떻게 부를지는 **호스트마다 다르다**. 이 계열 스크립트는 v2 플러그인 문법
# (`docker compose`)을 하드코딩하고 있었는데, 프로덕션 인스턴스에는 그 플러그인이 없고
# standalone 바이너리(`/usr/local/bin/docker-compose`)만 있다 — cli-plugins 에는
# docker-buildx 뿐이다(2026-08-02 실측). 그래서 첫 실배포에서 docker 가 `compose` 를
# 서브커맨드로 인식하지 못해 `--project-name` 을 **docker 전역 플래그**로 파싱했고,
# `unknown flag: --project-name` 으로 죽었다. 더 나쁜 건 레거시 복구 경로도 같은 배열을
# 써서 함께 실패했다는 점이다("CRITICAL: legacy runtime restore failed").
#
# alpha 인스턴스에는 플러그인이 있어서 alpha 검증으로는 절대 잡히지 않는다 — 두 호스트가
# 다르다는 사실 자체가 이 결함의 원인이다. deploy/setup-ec2.sh 는 이미 같은 분기를 갖고
# 있었으므로(118-121행) 그 판정을 여기로 끌어와 공유한다.
#
# 판정은 **실제로 실행할 형태 그대로**(sudo 포함) 해야 한다. 플러그인은 사용자별
# ~/.docker/cli-plugins 에 설치될 수 있어 root 와 일반 사용자가 다를 수 있다.
resolve_compose_binary() {
  if sudo docker compose version >/dev/null 2>&1; then
    printf 'docker\ncompose\n'
    return 0
  fi
  if sudo docker-compose version >/dev/null 2>&1; then
    printf 'docker-compose\n'
    return 0
  fi
  echo "[${0##*/}] 이 호스트에서 docker compose 도 docker-compose 도 실행할 수 없습니다" >&2
  return 1
}

# compose 는 값을 못 찾은 변수를 **빈 문자열로 조용히 치환**하고 경고만 남긴다. 그래서
# 런타임 .env 에 키가 빠져 있어도 배포가 그대로 진행된다 — 2026-08-02 배포에서 DB_PASSWORD 와
# JWT_SECRET 이 빠진 채로 컨테이너가 떴고, DB 인증 실패(P1000)로 죽었다. 더 위험한 건 그
# 인증 실패가 없었다면 API 가 **빈 JWT 서명 비밀키와 빈 세션 비밀키**로 프로덕션에 떴으리라는
# 점이다(JWT_SECRET: ${V1_JWT_SECRET:-${JWT_SECRET}} 형태의 중첩 기본값 때문에 뿌리 변수가
# 비면 전부 빈 문자열이 된다).
#
# 변수 해석 규칙을 여기서 다시 구현하면 compose 와 어긋난다 — `config` 로 compose 자신에게
# 물어보고 미설정 경고가 하나라도 있으면 **컨테이너를 건드리기 전에** 멈춘다.
assert_compose_variables_resolve() {
  local stderr_file status unset_vars
  stderr_file="$(mktemp)"
  # `config` 의 **종료 상태**를 먼저 본다. 첫 버전은 stderr 를 grep 에 바로 물려서, 경고
  # 문구가 없는 실패(YAML 문법 오류, `${VAR:?}` 미충족, compose 파일 부재)는 grep 이 빈
  # 결과를 내고 `|| true` 가 실패를 삼켜 **성공으로 통과**했다. 실측(2026-08-03): 문법이
  # 깨진 파일과 필수 변수 미충족 파일이 정상 파일과 똑같이 return 0 을 받았다.
  # 빈 값을 막으려고 만든 가드가 정작 compose 가 통째로 깨진 경우를 놓치고 있었다.
  if ! "$@" config >/dev/null 2>"${stderr_file}"; then
    echo "[${0##*/}] compose 설정을 해석할 수 없어 배포를 중단합니다:" >&2
    cat "${stderr_file}" >&2
    rm -f "${stderr_file}"
    return 1
  fi
  unset_vars="$(grep -F 'variable is not set' "${stderr_file}" | sort -u || true)"
  rm -f "${stderr_file}"
  if [[ -n "${unset_vars}" ]]; then
    echo "[${0##*/}] 런타임 .env 에 값이 없는 변수가 있어 배포를 중단합니다:" >&2
    echo "${unset_vars}" >&2
    echo "[${0##*/}] compose 는 이런 변수를 빈 문자열로 치환합니다 — 빈 비밀키로 배포되는 것을 막기 위해 여기서 멈춥니다." >&2
    return 1
  fi
}

PROD_HOME_DIR="${PROD_HOME_DIR:-/home/ec2-user}"
PROD_LIVE_DIR="${PROD_LIVE_DIR:-${PROD_HOME_DIR}/teameet}"
PROD_RELEASE_STATE_DIR="${PROD_RELEASE_STATE_DIR:-${PROD_HOME_DIR}/.teameet-prod-releases}"
PROD_RELEASE_STATE_FILE="${PROD_RELEASE_STATE_FILE:-${PROD_RELEASE_STATE_DIR}/state.json}"
PROD_CANDIDATE_MANIFEST="${PROD_CANDIDATE_MANIFEST:-${PROD_RELEASE_STATE_DIR}/candidate.json}"
PROD_FAILED_RELEASE_DIR="${PROD_FAILED_RELEASE_DIR:-${PROD_RELEASE_STATE_DIR}/failed}"
PROD_LEGACY_STATE_FILE="${PROD_LEGACY_STATE_FILE:-${PROD_HOME_DIR}/.teameet-prod-release}"
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/prod-source-common.sh"
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/prod-manifest-common.sh"

write_candidate_manifest() {
  local manifest_file="$1"
  local candidate_tmp

  install -d -m 700 "${PROD_RELEASE_STATE_DIR}" "${PROD_FAILED_RELEASE_DIR}"
  candidate_tmp="$(mktemp "${PROD_RELEASE_STATE_DIR}/candidate.XXXXXX")"
  install -m 600 "${manifest_file}" "${candidate_tmp}"
  mv "${candidate_tmp}" "${PROD_CANDIDATE_MANIFEST}"
}

promote_candidate_manifest() {
  local previous_json='null'
  local previous_checksum_json='null'
  local candidate_checksum
  local state_tmp

  candidate_checksum="$(sha256sum "${PROD_CANDIDATE_MANIFEST}" | awk '{print $1}')"
  if [[ -f "${PROD_RELEASE_STATE_FILE}" ]]; then
    previous_json="$(jq -c '.active' "${PROD_RELEASE_STATE_FILE}")"
    previous_checksum_json="$(jq -c '.activeManifestSha256' "${PROD_RELEASE_STATE_FILE}")"
  fi

  state_tmp="$(mktemp "${PROD_RELEASE_STATE_DIR}/state.XXXXXX")"
  jq -n \
    --slurpfile candidate "${PROD_CANDIDATE_MANIFEST}" \
    --arg candidateChecksum "${candidate_checksum}" \
    --argjson previous "${previous_json}" \
    --argjson previousChecksum "${previous_checksum_json}" \
    --arg updatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{schemaVersion: 1, active: $candidate[0], activeManifestSha256: $candidateChecksum, previous: $previous, previousManifestSha256: $previousChecksum, updatedAt: $updatedAt}' \
    > "${state_tmp}"
  chmod 600 "${state_tmp}"
  mv "${state_tmp}" "${PROD_RELEASE_STATE_FILE}"
  rm -f "${PROD_CANDIDATE_MANIFEST}"
}

extract_active_manifest() {
  local output_file="$1"
  jq -e '.active' "${PROD_RELEASE_STATE_FILE}" > "${output_file}"
  chmod 600 "${output_file}"
}

extract_previous_manifest() {
  local output_file="$1"
  jq -e '.previous | select(. != null)' "${PROD_RELEASE_STATE_FILE}" > "${output_file}"
  chmod 600 "${output_file}"
}

swap_active_previous_manifests() {
  local previous_tmp

  previous_tmp="$(mktemp "${PROD_RELEASE_STATE_DIR}/previous.XXXXXX")"
  extract_previous_manifest "${previous_tmp}"
  write_candidate_manifest "${previous_tmp}"
  rm -f "${previous_tmp}"
  promote_candidate_manifest
}

archive_failed_candidate() {
  local failed_sha='unknown'
  local failed_path

  if [[ ! -f "${PROD_CANDIDATE_MANIFEST}" ]]; then
    return
  fi
  failed_sha="$(jq -r '.release.sha // "unknown"' "${PROD_CANDIDATE_MANIFEST}")"
  failed_path="${PROD_FAILED_RELEASE_DIR}/${failed_sha}-$(date -u +%Y%m%dT%H%M%SZ).json"
  mv "${PROD_CANDIDATE_MANIFEST}" "${failed_path}"
  chmod 600 "${failed_path}"
}

write_release_metadata() {
  local manifest_file="$1"
  local metadata_snippet="${PROD_RUNTIME_METADATA_FILE}"
  local metadata_tmp
  local release_version
  local release_sha

  release_version="$(jq -er '.release.version' "${manifest_file}")"
  release_sha="$(jq -er '.release.sha' "${manifest_file}")"
  metadata_tmp="$(mktemp)"
  printf 'add_header X-Teameet-Release "%s" always;\nadd_header X-Teameet-Commit "%s" always;\n' \
    "${release_version}" \
    "${release_sha}" > "${metadata_tmp}"
  chmod 644 "${metadata_tmp}"
  mv "${metadata_tmp}" "${metadata_snippet}"
}

pull_release_images() {
  sudo docker pull "${V1_API_IMAGE}" || return 1
  sudo docker pull "${V1_WEB_IMAGE}" || return 1
}

assert_running_release_digests() {
  local api_container
  local worker_container
  local web_container
  local running_api_image
  local running_worker_image
  local running_web_image

  api_container="$("${compose[@]}" ps -q v1_api)" || return 1
  worker_container="$("${compose[@]}" ps -q v1_game_operations_worker)" || return 1
  web_container="$("${compose[@]}" ps -q v1_web)" || return 1
  [[ -n "${api_container}" && -n "${worker_container}" && -n "${web_container}" ]] || return 1
  running_api_image="$(sudo docker inspect --format '{{.Config.Image}}' "${api_container}")" || return 1
  running_worker_image="$(sudo docker inspect --format '{{.Config.Image}}' "${worker_container}")" || return 1
  running_web_image="$(sudo docker inspect --format '{{.Config.Image}}' "${web_container}")" || return 1
  [[ "${running_api_image}" == "${V1_API_IMAGE}" ]] || return 1
  [[ "${running_worker_image}" == "${V1_API_IMAGE}" ]] || return 1
  [[ "${running_web_image}" == "${V1_WEB_IMAGE}" ]] || return 1
}

check_prod_health_contract() {
  local headers
  local deployed_release
  local deployed_sha
  local worker_container
  local worker_health

  if ! curl -fsS --connect-timeout 3 --max-time 10 \
    http://127.0.0.1:8121/api/v1/health |
    jq -e '.data.checks.db == true' >/dev/null; then
    return 1
  fi
  worker_container="$("${compose[@]}" ps -q v1_game_operations_worker)" || return 1
  [[ -n "${worker_container}" ]] || return 1
  # docker inspect 가 읽는 Health.Status 는 docker-compose.prod.yml 의 healthcheck 스크립트가
  # 정한다. 그 스크립트는 워커 /health 응답의 status(운영 알람용, POISONED 잡이 하나라도
  # 남아 있으면 영구히 'degraded')가 아니라 deploymentStatus(새 잡을 받을 수 있는지만 보는
  # 배포 전용 지표)를 본다 — 그래야 알려진 정상 경로(녹아웃 무승부 등)로 생긴 POISONED
  # 잡 1건이 이 배포 게이트와, 실패한 배포를 되돌리는 restore_active_release() 의 롤백까지
  # 영구히 막는 사고를 반복하지 않는다(2026-08-27, C-poisoned-outbox-deploy-gate).
  worker_health="$(sudo docker inspect --format '{{.State.Health.Status}}' "${worker_container}")" || return 1
  [[ "${worker_health}" == "healthy" ]] || return 1
  headers="$(curl -fsSI --connect-timeout 3 --max-time 10 \
    https://teameet.co.kr/landing)" || return 1
  deployed_release="$(awk -F': ' 'tolower($1) == "x-teameet-release" { gsub("\r", "", $2); print $2 }' <<< "${headers}")"
  deployed_sha="$(awk -F': ' 'tolower($1) == "x-teameet-commit" { gsub("\r", "", $2); print $2 }' <<< "${headers}")"
  [[ "${deployed_release}" == "${PROD_RELEASE_VERSION}" ]] || return 1
  [[ "${deployed_sha}" == "${PROD_RELEASE_SHA}" ]] || return 1
  [[ "$(curl -sS --connect-timeout 3 --max-time 10 -o /dev/null -w '%{http_code}' \
    https://teameet.co.kr/v1/home)" == "308" ]] || return 1
  [[ "$(curl -sS --connect-timeout 3 --max-time 10 -o /dev/null -w '%{http_code}' \
    https://teameet.co.kr/landing)" == "200" ]] || return 1
}

wait_for_prod_health_contract() {
  for attempt in $(seq 1 36); do
    if check_prod_health_contract; then
      return
    fi
    if [[ "${attempt}" -eq 36 ]]; then
      echo "[prod-release] Health contract failed" >&2
      return 1
    fi
    sleep 5
  done
}

restore_active_release() {
  local active_tmp
  local active_sha
  local active_checksum

  active_tmp="$(mktemp "${PROD_RELEASE_STATE_DIR}/active.XXXXXX")"
  extract_active_manifest "${active_tmp}" || return 1
  active_checksum="$(jq -er '.activeManifestSha256' "${PROD_RELEASE_STATE_FILE}")" || return 1
  validate_stored_prod_manifest "${active_tmp}" "${PROD_ECR_REGISTRY}" "${active_checksum}" || return 1
  active_sha="$(jq -er '.release.sha' "${active_tmp}")" || return 1
  activate_prod_release_source "${active_sha}" || return 1
  load_prod_release_manifest "${active_tmp}" || return 1
  pull_release_images || return 1
  write_release_metadata "${active_tmp}" || return 1
  "${compose[@]}" up -d --no-deps v1_api v1_web v1_game_operations_worker || return 1
  "${compose[@]}" up -d --force-recreate --no-deps nginx || return 1
  wait_for_prod_health_contract || return 1
  assert_running_release_digests || return 1
  rm -f "${active_tmp}" || return 1
}

write_legacy_release_state() {
  local state_tmp

  state_tmp="$(mktemp)"
  printf 'release=%s\nsha=%s\ndeployed_at=%s\n' \
    "${PROD_RELEASE_VERSION}" \
    "${PROD_RELEASE_SHA}" \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${state_tmp}"
  chmod 600 "${state_tmp}"
  mv "${state_tmp}" "${PROD_LEGACY_STATE_FILE}"
}

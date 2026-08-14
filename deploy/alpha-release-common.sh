#!/usr/bin/env bash

# Shared immutable alpha release-state helpers. Callers own `set -Eeuo pipefail`
# and define the global `compose` command array before invoking runtime helpers.

ALPHA_HOME_DIR="${ALPHA_HOME_DIR:-/home/ec2-user}"
ALPHA_LIVE_DIR="${ALPHA_LIVE_DIR:-${ALPHA_HOME_DIR}/teameet}"
ALPHA_RELEASE_STATE_DIR="${ALPHA_RELEASE_STATE_DIR:-${ALPHA_HOME_DIR}/.teameet-alpha-releases}"
ALPHA_RELEASE_STATE_FILE="${ALPHA_RELEASE_STATE_FILE:-${ALPHA_RELEASE_STATE_DIR}/state.json}"
ALPHA_CANDIDATE_MANIFEST="${ALPHA_CANDIDATE_MANIFEST:-${ALPHA_RELEASE_STATE_DIR}/candidate.json}"
ALPHA_FAILED_RELEASE_DIR="${ALPHA_FAILED_RELEASE_DIR:-${ALPHA_RELEASE_STATE_DIR}/failed}"
ALPHA_LEGACY_STATE_FILE="${ALPHA_LEGACY_STATE_FILE:-${ALPHA_HOME_DIR}/.teameet-alpha-release}"
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/alpha-source-common.sh"
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/alpha-manifest-common.sh"

write_candidate_manifest() {
  local manifest_file="$1"
  local candidate_tmp

  install -d -m 700 "${ALPHA_RELEASE_STATE_DIR}" "${ALPHA_FAILED_RELEASE_DIR}"
  candidate_tmp="$(mktemp "${ALPHA_RELEASE_STATE_DIR}/candidate.XXXXXX")"
  install -m 600 "${manifest_file}" "${candidate_tmp}"
  mv "${candidate_tmp}" "${ALPHA_CANDIDATE_MANIFEST}"
}

promote_candidate_manifest() {
  local previous_json='null'
  local previous_checksum_json='null'
  local candidate_checksum
  local state_tmp

  candidate_checksum="$(sha256sum "${ALPHA_CANDIDATE_MANIFEST}" | awk '{print $1}')"
  if [[ -f "${ALPHA_RELEASE_STATE_FILE}" ]]; then
    previous_json="$(jq -c '.active' "${ALPHA_RELEASE_STATE_FILE}")"
    previous_checksum_json="$(jq -c '.activeManifestSha256' "${ALPHA_RELEASE_STATE_FILE}")"
  fi

  state_tmp="$(mktemp "${ALPHA_RELEASE_STATE_DIR}/state.XXXXXX")"
  jq -n \
    --slurpfile candidate "${ALPHA_CANDIDATE_MANIFEST}" \
    --arg candidateChecksum "${candidate_checksum}" \
    --argjson previous "${previous_json}" \
    --argjson previousChecksum "${previous_checksum_json}" \
    --arg updatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{schemaVersion: 1, active: $candidate[0], activeManifestSha256: $candidateChecksum, previous: $previous, previousManifestSha256: $previousChecksum, updatedAt: $updatedAt}' \
    > "${state_tmp}"
  chmod 600 "${state_tmp}"
  mv "${state_tmp}" "${ALPHA_RELEASE_STATE_FILE}"
  rm -f "${ALPHA_CANDIDATE_MANIFEST}"
}

extract_active_manifest() {
  local output_file="$1"
  jq -e '.active' "${ALPHA_RELEASE_STATE_FILE}" > "${output_file}"
  chmod 600 "${output_file}"
}

extract_previous_manifest() {
  local output_file="$1"
  jq -e '.previous | select(. != null)' "${ALPHA_RELEASE_STATE_FILE}" > "${output_file}"
  chmod 600 "${output_file}"
}

swap_active_previous_manifests() {
  local previous_tmp

  previous_tmp="$(mktemp "${ALPHA_RELEASE_STATE_DIR}/previous.XXXXXX")"
  extract_previous_manifest "${previous_tmp}"
  write_candidate_manifest "${previous_tmp}"
  rm -f "${previous_tmp}"
  promote_candidate_manifest
}

archive_failed_candidate() {
  local failed_sha='unknown'
  local failed_path

  if [[ ! -f "${ALPHA_CANDIDATE_MANIFEST}" ]]; then
    return
  fi
  failed_sha="$(jq -r '.release.sha // "unknown"' "${ALPHA_CANDIDATE_MANIFEST}")"
  failed_path="${ALPHA_FAILED_RELEASE_DIR}/${failed_sha}-$(date -u +%Y%m%dT%H%M%SZ).json"
  mv "${ALPHA_CANDIDATE_MANIFEST}" "${failed_path}"
  chmod 600 "${failed_path}"
}

write_release_metadata() {
  local manifest_file="$1"
  local metadata_snippet="${ALPHA_RUNTIME_METADATA_FILE}"
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
  docker pull "${ALPHA_API_IMAGE}" || return 1
  docker pull "${ALPHA_WEB_IMAGE}" || return 1
}

assert_running_release_digests() {
  local api_container
  local web_container
  local worker_container
  local running_api_image
  local running_web_image
  local running_worker_image

  api_container="$("${compose[@]}" ps -q v1_api)" || return 1
  web_container="$("${compose[@]}" ps -q v1_web)" || return 1
  worker_container="$("${compose[@]}" ps -q v1_game_operations_worker)" || return 1
  [[ -n "${api_container}" && -n "${web_container}" && -n "${worker_container}" ]] || return 1
  running_api_image="$(docker inspect --format '{{.Config.Image}}' "${api_container}")" || return 1
  running_web_image="$(docker inspect --format '{{.Config.Image}}' "${web_container}")" || return 1
  running_worker_image="$(docker inspect --format '{{.Config.Image}}' "${worker_container}")" || return 1
  [[ "${running_api_image}" == "${ALPHA_API_IMAGE}" ]] || return 1
  [[ "${running_web_image}" == "${ALPHA_WEB_IMAGE}" ]] || return 1
  [[ "${running_worker_image}" == "${ALPHA_API_IMAGE}" ]] || return 1
}

check_alpha_health_contract() {
  local headers
  local deployed_release
  local deployed_sha

  if ! curl -fsS --connect-timeout 3 --max-time 10 \
    http://127.0.0.1:8121/api/v1/health |
    jq -e '.data.checks.db == true' >/dev/null; then
    return 1
  fi
  headers="$(curl -fsSI --connect-timeout 3 --max-time 10 \
    https://alpha.teameet.co.kr/landing)" || return 1
  deployed_release="$(awk -F': ' 'tolower($1) == "x-teameet-release" { gsub("\r", "", $2); print $2 }' <<< "${headers}")"
  deployed_sha="$(awk -F': ' 'tolower($1) == "x-teameet-commit" { gsub("\r", "", $2); print $2 }' <<< "${headers}")"
  [[ "${deployed_release}" == "${ALPHA_RELEASE_VERSION}" ]] || return 1
  [[ "${deployed_sha}" == "${ALPHA_RELEASE_SHA}" ]] || return 1
  [[ "$(curl -sS --connect-timeout 3 --max-time 10 -o /dev/null -w '%{http_code}' \
    https://alpha.teameet.co.kr/v1/home)" == "308" ]] || return 1
}

wait_for_alpha_health_contract() {
  for attempt in $(seq 1 36); do
    if check_alpha_health_contract; then
      return
    fi
    if [[ "${attempt}" -eq 36 ]]; then
      echo "[alpha-release] Health contract failed" >&2
      return 1
    fi
    sleep 5
  done
}

# 전진 배포 전용 게이트. assert_running_release_digests 는 .Config.Image 만 읽어서
# 재시작 루프에 빠진 컨테이너를 정상으로 통과시킨다 — 실제로 워커가 잘못된
# entrypoint 로 한 번도 뜨지 못한 채 배포가 계속 "성공"으로 보고된 전례가 있다.
# 크래시 루프 컨테이너는 healthcheck 를 통과할 수 없으므로 health 를 직접 본다.
#
# rollback/restore 경로에서는 호출하지 않는다: 워커가 깨진 구버전으로 되돌리는
# 것 자체를 막아버리면 장애 대응 경로가 사라진다.
# 대기 시간은 compose 의 워커 healthcheck 가 스스로 실패를 확정하는 창보다 반드시 길어야 한다.
# docker-compose.alpha.yml 기준: start_period 20s + interval 10s * retries 12 = 140s.
# 그보다 짧으면 늦게 뜨는(그러나 결국 정상인) 워커를 docker 가 아직 'starting' 으로 보고 있는
# 사이에 이 게이트가 먼저 배포를 실패시킨다. 36 * 5s = 180s 로 여유를 둔다.
# compose 의 healthcheck 값을 바꾸면 이 숫자도 함께 올려야 한다.
wait_for_alpha_worker_healthy() {
  local worker_container
  local worker_health

  for attempt in $(seq 1 36); do
    worker_container="$("${compose[@]}" ps -q v1_game_operations_worker)"
    if [[ -n "${worker_container}" ]]; then
      worker_health="$(docker inspect --format '{{.State.Health.Status}}' "${worker_container}" 2>/dev/null || true)"
      if [[ "${worker_health}" == "healthy" ]]; then
        return
      fi
    fi
    if [[ "${attempt}" -eq 36 ]]; then
      echo "[alpha-release] game operations worker never became healthy (last=${worker_health:-<none>})" >&2
      "${compose[@]}" logs --tail 30 v1_game_operations_worker >&2 || true
      return 1
    fi
    sleep 5
  done
}

restore_active_release() {
  local active_tmp
  local active_sha
  local active_checksum

  active_tmp="$(mktemp "${ALPHA_RELEASE_STATE_DIR}/active.XXXXXX")"
  extract_active_manifest "${active_tmp}" || return 1
  active_checksum="$(jq -er '.activeManifestSha256' "${ALPHA_RELEASE_STATE_FILE}")" || return 1
  validate_stored_alpha_manifest "${active_tmp}" "${ALPHA_ECR_REGISTRY}" "${active_checksum}" || return 1
  active_sha="$(jq -er '.release.sha' "${active_tmp}")" || return 1
  activate_alpha_release_source "${active_sha}" || return 1
  load_alpha_release_manifest "${active_tmp}" || return 1
  pull_release_images || return 1
  write_release_metadata "${active_tmp}" || return 1
  "${compose[@]}" up -d --force-recreate --no-deps \
    v1_api v1_web v1_game_operations_worker || return 1
  "${compose[@]}" up -d --force-recreate --no-deps nginx || return 1
  wait_for_alpha_health_contract || return 1
  assert_running_release_digests || return 1
  rm -f "${active_tmp}" || return 1
}

# 배포마다 이전 릴리스의 dangling(태그 없는) 이미지가 로컬에 쌓인다 — alpha 는 ECR 에서
# digest 로 pull 하므로(alpha-manifest-common.sh 의 images.*.uri 가 'repo@sha256:...') 로컬
# 저장소에는 태그가 붙지 않는다. 이 저장소에는 정리 스텝이 없어 EC2 디스크가 배포를 거듭할수록
# 찼다(2026-08 실측: 28G/30G 까지 차서 배포와 롤백 둘 다 "no space left on device" 로 실패).
#
# `docker image prune -f`(비-a, dangling 전용)로 충분히 안전한 이유 — 롤백이 로컬 이미지
# 캐시를 전혀 참조하지 않기 때문이다: 자동 실패 복구 경로(restore_active_release)와 수동
# rollback-alpha.sh 둘 다 첫 스텝으로 pull_release_images() 를 호출해 ECR 에서 해당 digest 를
# 무조건 재-pull 한다. dangling 필터는 태그 유무만 보고 컨테이너 참조 여부는 반영하지 않아
# 지금 running 중인 active 이미지도 목록엔 함께 잡히지만, `docker image prune` 의 실제 삭제
# 로직은 컨테이너가 참조 중인 이미지를 건너뛴다(2026-08-09 alpha 호스트 실측: dangling
# 목록엔 4개가 잡히지만 컨테이너가 물고 있는 active 2개는 생존하고, 참조가 끊긴 previous
# 릴리스 이미지 2개만 실제로 삭제됨 — state.json 의 .previous.images.*.digest 와 일치 확인).
# `-a`(태그 있는 미사용 이미지까지)는 쓰지 않는다 — legacy 태그 이미지(예:
# teameet-v1-web:0.1.0-alpha.*, dangling 아님이라 -f 로는 애초에 안 지워짐) 정리는 이 함수
# 범위 밖의 별도 파괴적 결정이다.
#
# 실패해도 배포를 실패시키지 않는다(deploy-prod.sh 와 동일 정책) — 호출부에서 논-fatal 로
# 감싼다. 이 함수 자체는 성공/실패만 반환한다.
prune_stale_alpha_images() {
  docker image prune -f
}

write_legacy_release_state() {
  local state_tmp

  state_tmp="$(mktemp)"
  printf 'release=%s\nsha=%s\ndeployed_at=%s\n' \
    "${ALPHA_RELEASE_VERSION}" \
    "${ALPHA_RELEASE_SHA}" \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${state_tmp}"
  chmod 600 "${state_tmp}"
  mv "${state_tmp}" "${ALPHA_LEGACY_STATE_FILE}"
}

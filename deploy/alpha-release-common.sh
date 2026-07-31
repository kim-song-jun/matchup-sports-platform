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
    https://alpha.teameet.co.kr/v1/home)" == "404" ]] || return 1
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

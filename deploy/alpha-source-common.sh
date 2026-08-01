#!/usr/bin/env bash

# Versioned alpha source activation helpers. Callers define ALPHA_HOME_DIR and
# ALPHA_LIVE_DIR before sourcing this file.

ALPHA_SOURCE_RELEASES_DIR="${ALPHA_SOURCE_RELEASES_DIR:-${ALPHA_HOME_DIR}/.teameet-alpha-sources}"
ALPHA_RUNTIME_CONFIG_DIR="${ALPHA_RUNTIME_CONFIG_DIR:-${ALPHA_HOME_DIR}/.teameet-alpha-runtime}"
ALPHA_LEGACY_SOURCE_DIR="${ALPHA_LEGACY_SOURCE_DIR:-${ALPHA_SOURCE_RELEASES_DIR}/legacy-pre-immutable}"
ALPHA_RUNTIME_METADATA_FILE="${ALPHA_RUNTIME_METADATA_FILE:-${ALPHA_RUNTIME_CONFIG_DIR}/release-metadata.alpha.conf}"

prepare_alpha_release_source() {
  local source_dir="$1"
  local release_sha="$2"
  local source_sha256="$3"
  local target_dir="${ALPHA_SOURCE_RELEASES_DIR}/${release_sha}"
  local target_tmp="${target_dir}.tmp.$$"
  local drift

  install -d -m 700 "${ALPHA_SOURCE_RELEASES_DIR}" "${ALPHA_RUNTIME_CONFIG_DIR}"
  if [[ ! -f "${ALPHA_RUNTIME_CONFIG_DIR}/.env" ]]; then
    install -m 600 "${ALPHA_LIVE_DIR}/deploy/.env" "${ALPHA_RUNTIME_CONFIG_DIR}/.env"
  fi
  if [[ ! -d "${ALPHA_RUNTIME_CONFIG_DIR}/certbot" ]]; then
    install -d -m 700 "${ALPHA_RUNTIME_CONFIG_DIR}/certbot"
    if [[ -d "${ALPHA_LIVE_DIR}/deploy/certbot" ]]; then
      sudo rsync -a "${ALPHA_LIVE_DIR}/deploy/certbot/" "${ALPHA_RUNTIME_CONFIG_DIR}/certbot/"
    fi
  fi
  if [[ ! -f "${ALPHA_RUNTIME_METADATA_FILE}" ]]; then
    install -m 600 \
      "${ALPHA_LIVE_DIR}/deploy/release-metadata.alpha.conf" \
      "${ALPHA_RUNTIME_METADATA_FILE}"
  fi
  if [[ -d "${target_dir}" ]]; then
    if [[ "$(cat "${target_dir}/.source-sha256" 2>/dev/null)" != "${source_sha256}" ]]; then
      echo "[alpha-release] Stored source ${release_sha} has a different .source-sha256" >&2
      return 1
    fi
    if [[ ! -f "${target_dir}/deploy/deploy-alpha.sh" ]]; then
      echo "[alpha-release] Stored source ${release_sha} is missing deploy/deploy-alpha.sh" >&2
      return 1
    fi
    # --omit-dir-times 가 없으면 이 검사는 자기가 만든 mtime 을 드리프트로 오판한다.
    # 아래 생성 경로는 rsync -a 로 복사한 뒤 deploy/ 안의 심볼릭 링크 3개와 루트의
    # .source-sha256 을 만든다 — 그 쓰기가 target 의 ./ 와 deploy/ mtime 을 "그때"로
    # 바꿔 버려서, 원본의 디렉토리 mtime 과 영구히 달라진다. 그 상태로 rsync -ani(-a 는
    # -t 포함)를 돌리면 내용이 완전히 같아도 `.d..t......  ./` 두 줄이 나와 드리프트로
    # 판정됐다. 같은 SHA 를 재배포할 때(전송 실패 후 재시도 등) 반드시 밟는 경로다.
    # 파일 시각은 그대로 비교하므로 실제 내용 변조 탐지는 약해지지 않는다.
    drift="$(rsync -ani --delete --omit-dir-times \
      --exclude '/.source-sha256' \
      --exclude '/deploy/.env' \
      --exclude '/deploy/certbot' \
      --exclude '/deploy/release-metadata.alpha.conf' \
      "${source_dir}/" "${target_dir}/")"
    if [[ -n "${drift}" ]]; then
      echo "[alpha-release] Stored source ${release_sha} drifted from the packaged source:" >&2
      printf '%s\n' "${drift}" >&2
      return 1
    fi
    return
  fi

  install -d -m 700 "${target_tmp}"
  if ! rsync -a --delete "${source_dir}/" "${target_tmp}/"; then
    rm -rf "${target_tmp}"
    return 1
  fi
  rm -rf "${target_tmp}/deploy/certbot"
  rm -f "${target_tmp}/deploy/.env"
  rm -f "${target_tmp}/deploy/release-metadata.alpha.conf"
  ln -s "${ALPHA_RUNTIME_CONFIG_DIR}/certbot" "${target_tmp}/deploy/certbot"
  ln -s "${ALPHA_RUNTIME_CONFIG_DIR}/.env" "${target_tmp}/deploy/.env"
  ln -s "${ALPHA_RUNTIME_METADATA_FILE}" \
    "${target_tmp}/deploy/release-metadata.alpha.conf"
  printf '%s\n' "${source_sha256}" > "${target_tmp}/.source-sha256"
  chmod 600 "${target_tmp}/.source-sha256"
  mv "${target_tmp}" "${target_dir}"
}

activate_alpha_release_source() {
  local release_sha="$1"
  local target_dir="${ALPHA_SOURCE_RELEASES_DIR}/${release_sha}"
  local next_link="${ALPHA_HOME_DIR}/.teameet-alpha-live.$$"

  [[ -d "${target_dir}" ]] || return 1
  ln -s "${target_dir}" "${next_link}"
  if [[ -L "${ALPHA_LIVE_DIR}" ]]; then
    if mv --help 2>&1 | grep -q -- '--no-target-directory'; then
      mv -Tf "${next_link}" "${ALPHA_LIVE_DIR}"
    else
      mv -fh "${next_link}" "${ALPHA_LIVE_DIR}"
    fi
    [[ "$(cd -P "${ALPHA_LIVE_DIR}" && pwd)" == "$(cd -P "${target_dir}" && pwd)" ]]
    return
  fi
  if [[ -e "${ALPHA_LEGACY_SOURCE_DIR}" ]]; then
    rm -f "${next_link}"
    return 1
  fi
  mv "${ALPHA_LIVE_DIR}" "${ALPHA_LEGACY_SOURCE_DIR}"
  if ! mv "${next_link}" "${ALPHA_LIVE_DIR}"; then
    mv "${ALPHA_LEGACY_SOURCE_DIR}" "${ALPHA_LIVE_DIR}"
    return 1
  fi
  [[ "$(cd -P "${ALPHA_LIVE_DIR}" && pwd)" == "$(cd -P "${target_dir}" && pwd)" ]]
}

prune_stale_alpha_release_sources() {
  local keep_active="$1"
  local keep_previous="$2"
  local entry sha pruned=0

  [[ -d "${ALPHA_SOURCE_RELEASES_DIR}" ]] || return 0
  for entry in "${ALPHA_SOURCE_RELEASES_DIR}"/*; do
    [[ -d "${entry}" ]] || continue
    sha="$(basename "${entry}")"
    [[ "${sha}" =~ ^[0-9a-f]{40}$ ]] || continue
    [[ "${sha}" == "${keep_active}" || "${sha}" == "${keep_previous}" ]] && continue
    rm -rf "${entry}"
    pruned=$((pruned + 1))
  done
  (( pruned == 0 )) || echo "[alpha-release] Pruned ${pruned} stale release source directories" >&2
}

restore_legacy_alpha_source() {
  [[ -d "${ALPHA_LEGACY_SOURCE_DIR}" ]] || return 1
  if [[ -L "${ALPHA_LIVE_DIR}" ]]; then
    rm -f "${ALPHA_LIVE_DIR}" || return 1
  fi
  mv "${ALPHA_LEGACY_SOURCE_DIR}" "${ALPHA_LIVE_DIR}" || return 1
}

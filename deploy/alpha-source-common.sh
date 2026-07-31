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
    [[ "$(cat "${target_dir}/.source-sha256" 2>/dev/null)" == "${source_sha256}" ]] || return 1
    [[ -f "${target_dir}/deploy/deploy-alpha.sh" ]] || return 1
    [[ -z "$(rsync -ani --delete \
      --exclude '/.source-sha256' \
      --exclude '/deploy/.env' \
      --exclude '/deploy/certbot' \
      --exclude '/deploy/release-metadata.alpha.conf' \
      "${source_dir}/" "${target_dir}/")" ]] || return 1
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

restore_legacy_alpha_source() {
  [[ -d "${ALPHA_LEGACY_SOURCE_DIR}" ]] || return 1
  if [[ -L "${ALPHA_LIVE_DIR}" ]]; then
    rm -f "${ALPHA_LIVE_DIR}" || return 1
  fi
  mv "${ALPHA_LEGACY_SOURCE_DIR}" "${ALPHA_LIVE_DIR}" || return 1
}

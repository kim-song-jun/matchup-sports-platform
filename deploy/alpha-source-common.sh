#!/usr/bin/env bash

# Versioned alpha source activation helpers. Callers define ALPHA_HOME_DIR and
# ALPHA_LIVE_DIR before sourcing this file.

ALPHA_SOURCE_RELEASES_DIR="${ALPHA_SOURCE_RELEASES_DIR:-${ALPHA_HOME_DIR}/.teameet-alpha-sources}"
ALPHA_RUNTIME_CONFIG_DIR="${ALPHA_RUNTIME_CONFIG_DIR:-${ALPHA_HOME_DIR}/.teameet-alpha-runtime}"
ALPHA_LEGACY_SOURCE_DIR="${ALPHA_LEGACY_SOURCE_DIR:-${ALPHA_SOURCE_RELEASES_DIR}/legacy-pre-immutable}"
ALPHA_RUNTIME_METADATA_FILE="${ALPHA_RUNTIME_METADATA_FILE:-${ALPHA_RUNTIME_CONFIG_DIR}/release-metadata.alpha.conf}"

# A release's source tree lives under a key taken from its manifest's own
# source key, not the bare SHA: StageB packages a different tree (final schema
# and M11 in place) for a SHA the push path has already staged and made live,
# so the two cannot share `<sha>`. Restore and rollback must derive the same
# key, or they would reactivate the pre-M11 tree for a StageB release.
# The sha is checked first because the key becomes a path segment: the stored
# manifest validators derive the expected sha from the manifest itself, so they
# cannot reject one carrying traversal characters.
readonly ALPHA_SOURCE_KEY_JQ='if (.release.sha | type != "string") or (.release.sha | test("^[0-9a-f]{40}$") | not)
    then error("release sha is not a commit sha")
  elif .source.key == ("releases/" + .release.sha + ".tar.gz") then .release.sha
  elif .source.key == ("releases/task168-stage-b/" + .release.sha + ".tar.gz") then "task168-stage-b-" + .release.sha
  else error("unrecognized source key: \(.source.key)") end'

alpha_release_source_key() {
  jq -er "${ALPHA_SOURCE_KEY_JQ}" "$1"
}

prepare_alpha_release_source() {
  local source_dir="$1"
  local source_key="$2"
  local source_sha256="$3"
  local target_dir="${ALPHA_SOURCE_RELEASES_DIR}/${source_key}"
  local target_tmp="${target_dir}.tmp.$$"
  local drift

  # The key becomes a path segment, so refuse anything that is not one of the
  # two release-key shapes even when a caller builds it by hand.
  [[ "${source_key}" =~ ^(task168-stage-b-)?[0-9a-f]{40}$ ]] || {
    echo "[alpha-release] refusing a source key that is not a release key" >&2
    return 1
  }

  # Callers that run this as `prepare_alpha_release_source … || fail`
  # (deploy-alpha-stage-b.sh) turn errexit off inside the function, so each
  # step stops it itself rather than relying on the caller's `set -e`.
  install -d -m 700 "${ALPHA_SOURCE_RELEASES_DIR}" "${ALPHA_RUNTIME_CONFIG_DIR}" || return 1
  if [[ ! -f "${ALPHA_RUNTIME_CONFIG_DIR}/.env" ]]; then
    install -m 600 "${ALPHA_LIVE_DIR}/deploy/.env" "${ALPHA_RUNTIME_CONFIG_DIR}/.env" || return 1
  fi
  if [[ ! -d "${ALPHA_RUNTIME_CONFIG_DIR}/certbot" ]]; then
    install -d -m 700 "${ALPHA_RUNTIME_CONFIG_DIR}/certbot" || return 1
    if [[ -d "${ALPHA_LIVE_DIR}/deploy/certbot" ]]; then
      sudo rsync -a "${ALPHA_LIVE_DIR}/deploy/certbot/" "${ALPHA_RUNTIME_CONFIG_DIR}/certbot/" || return 1
    fi
  fi
  if [[ ! -f "${ALPHA_RUNTIME_METADATA_FILE}" ]]; then
    install -m 600 \
      "${ALPHA_LIVE_DIR}/deploy/release-metadata.alpha.conf" \
      "${ALPHA_RUNTIME_METADATA_FILE}" || return 1
  fi
  if [[ -d "${target_dir}" ]]; then
    if [[ "$(cat "${target_dir}/.source-sha256" 2>/dev/null)" != "${source_sha256}" ]]; then
      echo "[alpha-release] Stored source ${source_key} has a different .source-sha256" >&2
      return 1
    fi
    if [[ ! -f "${target_dir}/deploy/deploy-alpha.sh" ]]; then
      echo "[alpha-release] Stored source ${source_key} is missing deploy/deploy-alpha.sh" >&2
      return 1
    fi
    # --omit-dir-times 가 없으면 이 검사는 자기가 만든 mtime 을 드리프트로 오판한다.
    # 아래 생성 경로는 rsync -a 로 복사한 뒤 deploy/ 안의 심볼릭 링크 3개와 루트의
    # .source-sha256 을 만든다 — 그 쓰기가 target 의 ./ 와 deploy/ mtime 을 "그때"로
    # 바꿔 버려서, 원본의 디렉토리 mtime 과 영구히 달라진다. 그 상태로 rsync -ani(-a 는
    # -t 포함)를 돌리면 내용이 완전히 같아도 `.d..t......  ./` 두 줄이 나와 드리프트로
    # 판정됐다. 같은 SHA 를 재배포할 때(전송 실패 후 재시도 등) 반드시 밟는 경로다.
    # 파일 시각은 그대로 비교하므로 실제 내용 변조 탐지는 약해지지 않는다.
    # Empty output means "no drift", so a failed rsync must not reach that test.
    drift="$(rsync -ani --delete --omit-dir-times \
      --exclude '/.source-sha256' \
      --exclude '/deploy/.env' \
      --exclude '/deploy/certbot' \
      --exclude '/deploy/release-metadata.alpha.conf' \
      "${source_dir}/" "${target_dir}/")" || return 1
    if [[ -n "${drift}" ]]; then
      echo "[alpha-release] Stored source ${source_key} drifted from the packaged source:" >&2
      printf '%s\n' "${drift}" >&2
      return 1
    fi
    return 0
  fi

  install -d -m 700 "${target_tmp}"
  if ! rsync -a --delete "${source_dir}/" "${target_tmp}/"; then
    rm -rf "${target_tmp}"
    return 1
  fi
  if ! {
    rm -rf "${target_tmp}/deploy/certbot" &&
      rm -f "${target_tmp}/deploy/.env" "${target_tmp}/deploy/release-metadata.alpha.conf" &&
      ln -s "${ALPHA_RUNTIME_CONFIG_DIR}/certbot" "${target_tmp}/deploy/certbot" &&
      ln -s "${ALPHA_RUNTIME_CONFIG_DIR}/.env" "${target_tmp}/deploy/.env" &&
      ln -s "${ALPHA_RUNTIME_METADATA_FILE}" "${target_tmp}/deploy/release-metadata.alpha.conf" &&
      printf '%s\n' "${source_sha256}" > "${target_tmp}/.source-sha256" &&
      chmod 600 "${target_tmp}/.source-sha256"
  }; then
    rm -rf "${target_tmp}"
    return 1
  fi
  # A failed move must not leave the half-built tree behind for the next run.
  mv "${target_tmp}" "${target_dir}" || { rm -rf "${target_tmp}"; return 1; }
}

activate_alpha_release_source() {
  # 인자 없는 `return` 금지 — ERR trap 안에서는 trap 을 일으킨 종료코드가 돌아온다(scripts/qa/test-release-restore-in-trap.sh).
  local source_key="$1"
  local target_dir="${ALPHA_SOURCE_RELEASES_DIR}/${source_key}"
  local next_link="${ALPHA_HOME_DIR}/.teameet-alpha-live.$$"

  # The key becomes a path segment, so refuse anything that is not one of the
  # two release-key shapes even when a caller builds it by hand.
  [[ "${source_key}" =~ ^(task168-stage-b-)?[0-9a-f]{40}$ ]] || {
    echo "[alpha-release] refusing a source key that is not a release key" >&2
    return 1
  }
  [[ -d "${target_dir}" ]] || return 1
  ln -s "${target_dir}" "${next_link}" || return 1
  if [[ -L "${ALPHA_LIVE_DIR}" ]]; then
    # A failed swap must not leave ~/.teameet-alpha-live.$$ behind: the link is
    # consumed by a successful mv, so it only survives the failing path.
    if mv --help 2>&1 | grep -q -- '--no-target-directory'; then
      mv -Tf "${next_link}" "${ALPHA_LIVE_DIR}" || { rm -f "${next_link}"; return 1; }
    else
      mv -fh "${next_link}" "${ALPHA_LIVE_DIR}" || { rm -f "${next_link}"; return 1; }
    fi
    [[ "$(cd -P "${ALPHA_LIVE_DIR}" && pwd)" == "$(cd -P "${target_dir}" && pwd)" ]] || return 1
    return 0
  fi
  if [[ -e "${ALPHA_LEGACY_SOURCE_DIR}" ]]; then
    rm -f "${next_link}"
    return 1
  fi
  mv "${ALPHA_LIVE_DIR}" "${ALPHA_LEGACY_SOURCE_DIR}" || { rm -f "${next_link}"; return 1; }
  if ! mv "${next_link}" "${ALPHA_LIVE_DIR}"; then
    rm -f "${next_link}"
    mv "${ALPHA_LEGACY_SOURCE_DIR}" "${ALPHA_LIVE_DIR}"
    return 1
  fi
  [[ "$(cd -P "${ALPHA_LIVE_DIR}" && pwd)" == "$(cd -P "${target_dir}" && pwd)" ]]
}

prune_stale_alpha_release_sources() {
  local keep_active="$1"
  local keep_previous="$2"
  local entry key pruned=0

  # Without an active key every tree would be pruned, the live one included.
  [[ -n "${keep_active}" ]] || return 1
  [[ -d "${ALPHA_SOURCE_RELEASES_DIR}" ]] || return 0
  for entry in "${ALPHA_SOURCE_RELEASES_DIR}"/*; do
    [[ -d "${entry}" ]] || continue
    key="$(basename "${entry}")"
    [[ "${key}" =~ ^(task168-stage-b-)?[0-9a-f]{40}$ ]] || continue
    [[ "${key}" == "${keep_active}" || "${key}" == "${keep_previous}" ]] && continue
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

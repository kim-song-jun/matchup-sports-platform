#!/usr/bin/env bash

# 버전 관리되는 prod 소스 활성화 헬퍼. deploy/alpha-source-common.sh 를 prod 용으로
# 일반화한 것 — 호출자는 이 파일을 source 하기 전에 PROD_HOME_DIR/PROD_LIVE_DIR 을
# 정의해야 한다.
#
# alpha 와의 차이(D2): 러너가 S3 tar.gz 를 EC2 위에서 압축 해제하는 대신, `rsync -e ssh`
# 로 고정된 스테이징 경로(`${PROD_SOURCE_STAGING_DIR}/<sha>`, run_id 접미사 없음)를 직접
# 채운다. `prepare_prod_release_source()`는 이 스테이징 경로를 alpha 의 `source_dir` 인자와
# 동일하게 취급하므로 시그니처는 alpha 와 100% 동일하다 — 스테이징 경로 자체가 이 함수가
# 실행되는 스크립트 파일을 담고 있는 디렉터리이기도 하다는 점이 alpha 와 유일하게 다른
# 부분인데, 이 함수는 그 디렉터리를 rename 하지 않고 rsync 로 별도 불변 저장소
# (`${PROD_SOURCE_RELEASES_DIR}/<sha>`)에 복사만 하므로 실행 중인 스크립트 자신의 경로가
# 사라지는 문제가 없다(자기 디렉터리를 스스로 rename 하면 실행 중이던 ERR trap 이 sibling
# 파일을 다시 열 때 깨질 수 있다 — alpha 는 애초에 이 위험이 없는 구조이고, prod 도 동일
# 구조를 그대로 따른다).

PROD_SOURCE_RELEASES_DIR="${PROD_SOURCE_RELEASES_DIR:-${PROD_HOME_DIR}/.teameet-prod-sources}"
PROD_SOURCE_STAGING_DIR="${PROD_SOURCE_STAGING_DIR:-${PROD_HOME_DIR}/.teameet-prod-staging}"
PROD_RUNTIME_CONFIG_DIR="${PROD_RUNTIME_CONFIG_DIR:-${PROD_HOME_DIR}/.teameet-prod-runtime}"
PROD_LEGACY_SOURCE_DIR="${PROD_LEGACY_SOURCE_DIR:-${PROD_SOURCE_RELEASES_DIR}/legacy-pre-immutable}"
PROD_RUNTIME_METADATA_FILE="${PROD_RUNTIME_METADATA_FILE:-${PROD_RUNTIME_CONFIG_DIR}/release-metadata.prod.conf}"
PROD_RUNTIME_BACKUPS_DIR="${PROD_RUNTIME_BACKUPS_DIR:-${PROD_HOME_DIR}/teameet-backups}"

prepare_prod_release_source() {
  local source_dir="$1"
  local release_sha="$2"
  local source_sha256="$3"
  local target_dir="${PROD_SOURCE_RELEASES_DIR}/${release_sha}"
  local target_tmp="${target_dir}.tmp.$$"
  local drift

  install -d -m 700 "${PROD_SOURCE_RELEASES_DIR}" "${PROD_RUNTIME_CONFIG_DIR}"
  if [[ ! -f "${PROD_RUNTIME_CONFIG_DIR}/.env" ]]; then
    install -m 600 "${PROD_LIVE_DIR}/deploy/.env" "${PROD_RUNTIME_CONFIG_DIR}/.env"
  fi
  if [[ ! -d "${PROD_RUNTIME_CONFIG_DIR}/certbot" ]]; then
    install -d -m 700 "${PROD_RUNTIME_CONFIG_DIR}/certbot"
    if [[ -d "${PROD_LIVE_DIR}/deploy/certbot" ]]; then
      sudo rsync -a "${PROD_LIVE_DIR}/deploy/certbot/" "${PROD_RUNTIME_CONFIG_DIR}/certbot/"
    fi
  fi
  if [[ ! -d "${PROD_RUNTIME_BACKUPS_DIR}" ]]; then
    # D4: backups/ 는 활성 release 심볼릭 링크 밖의 고정 경로로 이전한다 — release 마다
    # 링크 대상이 바뀌므로 상대경로 deploy/backups 에 의존하면 매번 사라진 것처럼 보인다.
    if [[ -d "${PROD_LIVE_DIR}/backups" ]]; then
      install -d -m 700 "${PROD_RUNTIME_BACKUPS_DIR}"
      sudo rsync -a "${PROD_LIVE_DIR}/backups/" "${PROD_RUNTIME_BACKUPS_DIR}/"
    else
      install -d -m 700 "${PROD_RUNTIME_BACKUPS_DIR}"
    fi
  fi
  if [[ ! -f "${PROD_RUNTIME_METADATA_FILE}" ]]; then
    install -m 600 \
      "${PROD_LIVE_DIR}/deploy/release-metadata.prod.conf" \
      "${PROD_RUNTIME_METADATA_FILE}"
  fi
  if [[ -d "${target_dir}" ]]; then
    if [[ "$(cat "${target_dir}/.source-sha256" 2>/dev/null)" != "${source_sha256}" ]]; then
      echo "[prod-release] Stored source ${release_sha} has a different .source-sha256" >&2
      return 1
    fi
    if [[ ! -f "${target_dir}/deploy/deploy-prod.sh" ]]; then
      echo "[prod-release] Stored source ${release_sha} is missing deploy/deploy-prod.sh" >&2
      return 1
    fi
    # --omit-dir-times 가 없으면 이 검사는 자기가 만든 mtime 을 드리프트로 오판한다
    # (alpha-source-common.sh 의 동일 함정 — 자세한 설명은 그 파일 주석 참조).
    drift="$(rsync -ani --delete --omit-dir-times \
      --exclude '/.source-sha256' \
      --exclude '/deploy/.env' \
      --exclude '/deploy/certbot' \
      --exclude '/deploy/release-metadata.prod.conf' \
      "${source_dir}/" "${target_dir}/")"
    if [[ -n "${drift}" ]]; then
      echo "[prod-release] Stored source ${release_sha} drifted from the packaged source:" >&2
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
  rm -f "${target_tmp}/deploy/release-metadata.prod.conf"
  ln -s "${PROD_RUNTIME_CONFIG_DIR}/certbot" "${target_tmp}/deploy/certbot"
  ln -s "${PROD_RUNTIME_CONFIG_DIR}/.env" "${target_tmp}/deploy/.env"
  ln -s "${PROD_RUNTIME_METADATA_FILE}" \
    "${target_tmp}/deploy/release-metadata.prod.conf"
  printf '%s\n' "${source_sha256}" > "${target_tmp}/.source-sha256"
  chmod 600 "${target_tmp}/.source-sha256"
  mv "${target_tmp}" "${target_dir}"
}

activate_prod_release_source() {
  local release_sha="$1"
  local target_dir="${PROD_SOURCE_RELEASES_DIR}/${release_sha}"
  local next_link="${PROD_HOME_DIR}/.teameet-prod-live.$$"

  [[ -d "${target_dir}" ]] || return 1
  ln -s "${target_dir}" "${next_link}"
  if [[ -L "${PROD_LIVE_DIR}" ]]; then
    if mv --help 2>&1 | grep -q -- '--no-target-directory'; then
      mv -Tf "${next_link}" "${PROD_LIVE_DIR}"
    else
      mv -fh "${next_link}" "${PROD_LIVE_DIR}"
    fi
    [[ "$(cd -P "${PROD_LIVE_DIR}" && pwd)" == "$(cd -P "${target_dir}" && pwd)" ]]
    return
  fi
  if [[ -e "${PROD_LEGACY_SOURCE_DIR}" ]]; then
    rm -f "${next_link}"
    return 1
  fi
  mv "${PROD_LIVE_DIR}" "${PROD_LEGACY_SOURCE_DIR}"
  if ! mv "${next_link}" "${PROD_LIVE_DIR}"; then
    mv "${PROD_LEGACY_SOURCE_DIR}" "${PROD_LIVE_DIR}"
    return 1
  fi
  [[ "$(cd -P "${PROD_LIVE_DIR}" && pwd)" == "$(cd -P "${target_dir}" && pwd)" ]]
}

prune_stale_prod_release_sources() {
  local keep_active="$1"
  local keep_previous="$2"
  local entry sha pruned=0

  # 방어적 2중 가드: 호출자가 keep_active 를 빈 문자열/형식오류로 넘기면(예: 인자 위치의
  # 커맨드 치환 실패가 set -e 에 안 잡혀 조용히 빈 문자열이 되는 경우) sha 가 그 어떤
  # 값과도 "" 로 일치하지 않아 모든 release 디렉터리가 삭제된다 — 활성 release 도 예외가
  # 아니다. 그런 인자는 여기서 먼저 거부한다.
  [[ "${keep_active}" =~ ^[0-9a-f]{40}$ ]] || {
    echo "[prod-release] Refusing to prune: keep_active is not a valid 40-hex release sha" >&2
    return 1
  }
  [[ -d "${PROD_SOURCE_RELEASES_DIR}" ]] || return 0
  for entry in "${PROD_SOURCE_RELEASES_DIR}"/*; do
    [[ -d "${entry}" ]] || continue
    sha="$(basename "${entry}")"
    [[ "${sha}" =~ ^[0-9a-f]{40}$ ]] || continue
    [[ "${sha}" == "${keep_active}" || "${sha}" == "${keep_previous}" ]] && continue
    rm -rf "${entry}"
    pruned=$((pruned + 1))
  done
  (( pruned == 0 )) || echo "[prod-release] Pruned ${pruned} stale release source directories" >&2
}

# 러너가 rsync 로 채운 스테이징 디렉터리(`${PROD_SOURCE_STAGING_DIR}/<sha>`)는 이번
# release-sha 하나만 담는 고정 경로라 다음 배포가 같은 sha 를 재시도할 때만 재사용된다.
# 실패한 빌드가 다른 sha 로 쌓이는 걸 막기 위해, 배포 성공 뒤 활성/직전 release 만 남기고
# 나머지 스테이징 디렉터리를 정리한다(불변 저장소 pruning 과 동일한 정책).
prune_stale_prod_staging_dirs() {
  local keep_active="$1"
  local keep_previous="$2"
  local entry sha pruned=0

  # prune_stale_prod_release_sources 와 동일한 방어적 가드 — 자세한 이유는 그 함수의 주석
  # 참조.
  [[ "${keep_active}" =~ ^[0-9a-f]{40}$ ]] || {
    echo "[prod-release] Refusing to prune: keep_active is not a valid 40-hex release sha" >&2
    return 1
  }
  [[ -d "${PROD_SOURCE_STAGING_DIR}" ]] || return 0
  for entry in "${PROD_SOURCE_STAGING_DIR}"/*; do
    [[ -d "${entry}" ]] || continue
    sha="$(basename "${entry}")"
    [[ "${sha}" =~ ^[0-9a-f]{40}$ ]] || continue
    [[ "${sha}" == "${keep_active}" || "${sha}" == "${keep_previous}" ]] && continue
    rm -rf "${entry}"
    pruned=$((pruned + 1))
  done
  (( pruned == 0 )) || echo "[prod-release] Pruned ${pruned} stale release staging directories" >&2
}

restore_legacy_prod_release_source() {
  [[ -d "${PROD_LEGACY_SOURCE_DIR}" ]] || return 1
  if [[ -L "${PROD_LIVE_DIR}" ]]; then
    rm -f "${PROD_LIVE_DIR}" || return 1
  fi
  mv "${PROD_LEGACY_SOURCE_DIR}" "${PROD_LIVE_DIR}" || return 1
}

#!/usr/bin/env bash

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

# prod-source-common.sh 는 certbot 최초 부트스트랩에 `sudo rsync`를 쓴다(prepare_prod_release_source).
# 이 테스트는 격리된 fixture 트리에서만 동작하므로 실제 권한 상승이 필요 없다 — `sudo`를
# 그냥 인자를 그대로 실행하는 passthrough 로 mock 해, passwordless sudo 가 없는 샌드박스/러너
# 에서도 이 테스트가 통과하게 한다. `docker`도 `sudo docker ...` 형태로 호출되므로(§ 아래
# assert_running_release_digests/pull_release_images 검증) 셸 함수가 아니라 PATH 실행 파일로
# mock 해야 한다 — `sudo`는 항상 PATH 에서 실제 실행 파일을 찾아 새 프로세스로 실행하고,
# 셸 함수 정의를 상속하지 않는다.
mock_bin="${TEST_ROOT}/mockbin"
mkdir -p "${mock_bin}"
printf '#!/usr/bin/env bash\nexec "$@"\n' > "${mock_bin}/sudo"
chmod +x "${mock_bin}/sudo"
export PATH="${mock_bin}:${PATH}"

export PROD_HOME_DIR="${TEST_ROOT}/home"
export PROD_LIVE_DIR="${TEST_ROOT}/live"
export PROD_RELEASE_STATE_DIR="${TEST_ROOT}/state"
export PROD_RELEASE_STATE_FILE="${PROD_RELEASE_STATE_DIR}/state.json"
export PROD_CANDIDATE_MANIFEST="${PROD_RELEASE_STATE_DIR}/candidate.json"
export PROD_FAILED_RELEASE_DIR="${PROD_RELEASE_STATE_DIR}/failed"
export PROD_LEGACY_STATE_FILE="${TEST_ROOT}/legacy-state"

source "${ROOT_DIR}/deploy/prod-release-common.sh"

readonly REGISTRY=851725525576.dkr.ecr.ap-northeast-2.amazonaws.com
readonly SHA_A=1111111111111111111111111111111111111111
readonly SHA_B=2222222222222222222222222222222222222222
readonly DIGEST_A="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
readonly DIGEST_B="sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

make_manifest() {
  local sha="$1"
  local version="$2"
  local digest="$3"
  local output="$4"

  jq -Sn \
    --arg sha "${sha}" --arg version "${version}" --arg registry "${REGISTRY}" --arg digest "${digest}" \
    '{schemaVersion:1,environment:"production",release:{sha:$sha,version:$version,createdAt:"2026-07-19T00:00:00Z"},source:{transfer:"ssh-rsync",sha256:"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"},database:{migrationPolicy:"expand-contract",rollbackMode:"application-images-only",compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:null,rollbackCompatibleWith:null},images:{api:{repository:($registry+"/teameet-prod-v1-api"),digest:$digest,uri:($registry+"/teameet-prod-v1-api@"+$digest)},web:{repository:($registry+"/teameet-prod-v1-web"),digest:$digest,uri:($registry+"/teameet-prod-v1-web@"+$digest)}}}' \
    > "${output}"
}

manifest_a="${TEST_ROOT}/manifest-a.json"
manifest_b="${TEST_ROOT}/manifest-b.json"
tampered="${TEST_ROOT}/tampered.json"
make_manifest "${SHA_A}" "0.1.0" "${DIGEST_A}" "${manifest_a}"
make_manifest "${SHA_B}" "0.2.0" "${DIGEST_B}" "${manifest_b}"

checksum_a="$(sha256sum "${manifest_a}" | awk '{print $1}')"
validate_prod_release_manifest "${manifest_a}" "${SHA_A}" "0.1.0" "${checksum_a}" "${REGISTRY}"

export PROD_RELEASE_VERSION=0.1.0
export PROD_RELEASE_SHA="${SHA_A}"
curl() {
  if [[ "$*" == *'/api/v1/health'* ]]; then
    printf '{"data":{"checks":{"db":false}}}\n'
  else
    printf 'HTTP/2 200\r\nx-teameet-release: %s\r\nx-teameet-commit: %s\r\n' \
      "${PROD_RELEASE_VERSION}" "${PROD_RELEASE_SHA}"
  fi
}
if check_prod_health_contract; then
  echo "Failed DB health was accepted from conditional call context" >&2
  exit 1
fi
unset -f curl

export V1_API_IMAGE="${REGISTRY}/teameet-prod-v1-api@${DIGEST_A}"
export V1_WEB_IMAGE="${REGISTRY}/teameet-prod-v1-web@${DIGEST_A}"
# pull_release_images 는 sudo docker pull ... 을 부른다 — sudo 는 셸 함수를 상속하지
# 않으므로 PATH 실행 파일로 mock 한다(위 sudo passthrough 참조).
docker_calls_log="${TEST_ROOT}/docker-pull-calls.log"
: > "${docker_calls_log}"
cat > "${mock_bin}/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "${docker_calls_log}"
exit 1
EOF
chmod +x "${mock_bin}/docker"
if pull_release_images; then
  echo "Failed image pull was accepted from conditional call context" >&2
  exit 1
fi
[[ "$(wc -l < "${docker_calls_log}" | tr -d '[:space:]')" == 1 ]]
rm -f "${mock_bin}/docker"

jq '.release.sha = "bad"' "${manifest_a}" > "${tampered}"
tampered_checksum="$(sha256sum "${tampered}" | awk '{print $1}')"
if validate_prod_release_manifest "${tampered}" "${SHA_A}" "0.1.0" "${tampered_checksum}" "${REGISTRY}"; then
  echo "Tampered release SHA was accepted" >&2
  exit 1
fi

jq '.images.api.digest = "sha256:bad"' "${manifest_a}" > "${tampered}"
tampered_checksum="$(sha256sum "${tampered}" | awk '{print $1}')"
if validate_prod_release_manifest "${tampered}" "${SHA_A}" "0.1.0" "${tampered_checksum}" "${REGISTRY}"; then
  echo "Malformed API digest was accepted" >&2
  exit 1
fi

# Production release parity: API image also owns the outbox worker runtime.
# assert_running_release_digests 는 "${compose[@]}" ps -q <service>) 를 `$(...)` 커맨드
# 치환 안에서 호출한다 — 즉 compose_mock 은 서브셸에서 실행되므로, 셸 배열에 호출 기록을
# 남기면 부모 셸에 반영되지 않는다(bash 서브셸 변수 격리). 파일에 기록해야 값이 살아남는다.
compose_calls_log="${TEST_ROOT}/compose-ps-calls.log"
: > "${compose_calls_log}"
compose_mock() {
  printf '%s\n' "$*" >> "${compose_calls_log}"
  case "$*" in
    'ps -q v1_api') echo container-api ;;
    'ps -q v1_game_operations_worker') echo container-worker ;;
    'ps -q v1_web') echo container-web ;;
    *) echo "unexpected compose invocation: $*" >&2; return 1 ;;
  esac
}
compose=(compose_mock)
# assert_running_release_digests 도 sudo docker inspect ... 를 부른다 — 위와 동일한 이유로
# PATH 실행 파일 mock 이 필요하다.
cat > "${mock_bin}/docker" <<EOF
#!/usr/bin/env bash
case "\$*" in
  'inspect --format {{.Config.Image}} container-api') echo "${V1_API_IMAGE}" ;;
  'inspect --format {{.Config.Image}} container-worker') echo "${V1_API_IMAGE}" ;;
  'inspect --format {{.Config.Image}} container-web') echo "${V1_WEB_IMAGE}" ;;
  *) echo "unexpected docker invocation: \$*" >&2; exit 1 ;;
esac
EOF
chmod +x "${mock_bin}/docker"
if ! assert_running_release_digests; then
  echo "assert_running_release_digests failed against a matching mock" >&2
  exit 1
fi
compose_call_count="$(wc -l < "${compose_calls_log}" | tr -d '[:space:]')"
if [[ "${compose_call_count}" != 3 ]]; then
  echo "assert_running_release_digests did not query the complete API/Web/worker release unit" >&2
  cat "${compose_calls_log}" >&2
  exit 1
fi
if grep -qv -E '^ps -q (v1_api|v1_web|v1_game_operations_worker)$' "${compose_calls_log}"; then
  echo "assert_running_release_digests queried an unexpected service:" >&2
  cat "${compose_calls_log}" >&2
  exit 1
fi
unset -f compose_mock
unset compose
rm -f "${mock_bin}/docker"

# D6: history depth = 2 (active/previous). 첫 promote 는 previous=null, 두 번째 promote
# 부터 previous 가 채워진다.
write_candidate_manifest "${manifest_a}"
promote_candidate_manifest
jq -e --arg sha "${SHA_A}" --arg checksum "${checksum_a}" '.active.release.sha == $sha and .activeManifestSha256 == $checksum and .previous == null and .previousManifestSha256 == null' \
  "${PROD_RELEASE_STATE_FILE}" >/dev/null
active_copy="${TEST_ROOT}/active-copy.json"
extract_active_manifest "${active_copy}"
validate_stored_prod_manifest "${active_copy}" "${REGISTRY}" "${checksum_a}"
if validate_stored_prod_manifest "${active_copy}" "${REGISTRY}" \
  dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd; then
  echo "Incorrect stored manifest checksum was accepted" >&2
  exit 1
fi

write_candidate_manifest "${manifest_b}"
promote_candidate_manifest
checksum_b="$(sha256sum "${manifest_b}" | awk '{print $1}')"
jq -e --arg active "${SHA_B}" --arg previous "${SHA_A}" \
  --arg activeChecksum "${checksum_b}" --arg previousChecksum "${checksum_a}" \
  '.active.release.sha == $active and .previous.release.sha == $previous and .activeManifestSha256 == $activeChecksum and .previousManifestSha256 == $previousChecksum' \
  "${PROD_RELEASE_STATE_FILE}" >/dev/null

# 롤백의 최종 상태 갱신 로직: active/previous 가 정확히 뒤바뀐다(3세대 이력은 없다 — D6).
swap_active_previous_manifests
jq -e --arg active "${SHA_A}" --arg previous "${SHA_B}" \
  '.active.release.sha == $active and .previous.release.sha == $previous' \
  "${PROD_RELEASE_STATE_FILE}" >/dev/null

source_a="${TEST_ROOT}/source-a"
source_b="${TEST_ROOT}/source-b"
mkdir -p "${PROD_LIVE_DIR}/deploy/certbot" "${source_a}/deploy" "${source_b}/deploy"
printf 'protected=true\n' > "${PROD_LIVE_DIR}/deploy/.env"
printf 'legacy certificate\n' > "${PROD_LIVE_DIR}/deploy/certbot/cert.pem"
printf 'legacy metadata\n' > "${PROD_LIVE_DIR}/deploy/release-metadata.prod.conf"
printf '#!/usr/bin/env bash\n' > "${source_a}/deploy/deploy-prod.sh"
printf 'release-a\n' > "${source_a}/release.txt"
printf '#!/usr/bin/env bash\n' > "${source_b}/deploy/deploy-prod.sh"
printf 'release-b\n' > "${source_b}/release.txt"

prepare_prod_release_source "${source_a}" "${SHA_A}" "${DIGEST_A#sha256:}"
prepare_prod_release_source "${source_a}" "${SHA_A}" "${DIGEST_A#sha256:}"

# 디렉토리 mtime 이 어긋나도 내용이 같으면 재사용이 성립해야 한다(alpha-source-common.sh 와
# 동일한 --omit-dir-times 함정 — 자세한 설명은 그 파일 주석 참조).
touch -t 202001010000 "${source_a}" "${source_a}/deploy"
if ! prepare_prod_release_source "${source_a}" "${SHA_A}" "${DIGEST_A#sha256:}"; then
  echo "Unchanged source was rejected because directory mtimes differ" >&2
  exit 1
fi

printf 'tampered\n' > "${PROD_SOURCE_RELEASES_DIR}/${SHA_A}/release.txt"
if prepare_prod_release_source "${source_a}" "${SHA_A}" "${DIGEST_A#sha256:}"; then
  echo "Drifted immutable source directory was reused" >&2
  exit 1
fi
printf 'release-a\n' > "${PROD_SOURCE_RELEASES_DIR}/${SHA_A}/release.txt"
activate_prod_release_source "${SHA_A}"
[[ -L "${PROD_LIVE_DIR}" ]]
[[ "$(cat "${PROD_LIVE_DIR}/release.txt")" == 'release-a' ]]
[[ "$(cat "${PROD_LIVE_DIR}/deploy/.env")" == 'protected=true' ]]
[[ "$(cat "${PROD_LIVE_DIR}/deploy/certbot/cert.pem")" == 'legacy certificate' ]]
[[ "$(cat "${PROD_LIVE_DIR}/deploy/release-metadata.prod.conf")" == 'legacy metadata' ]]

prepare_prod_release_source "${source_b}" "${SHA_B}" "${DIGEST_B#sha256:}"
activate_prod_release_source "${SHA_B}"
[[ "$(cat "${PROD_LIVE_DIR}/release.txt")" == 'release-b' ]]
restore_legacy_prod_release_source
[[ ! -L "${PROD_LIVE_DIR}" ]]
[[ "$(cat "${PROD_LIVE_DIR}/deploy/.env")" == 'protected=true' ]]

readonly SHA_C=3333333333333333333333333333333333333333
source_c="${TEST_ROOT}/source-c"
mkdir -p "${source_c}/deploy"
printf '#!/usr/bin/env bash\n' > "${source_c}/deploy/deploy-prod.sh"
printf 'release-c\n' > "${source_c}/release.txt"
prepare_prod_release_source "${source_c}" "${SHA_C}" "${DIGEST_A#sha256:}"
mkdir -p "${PROD_SOURCE_RELEASES_DIR}/not-a-sha"
[[ -d "${PROD_SOURCE_RELEASES_DIR}/${SHA_A}" ]]
[[ -d "${PROD_SOURCE_RELEASES_DIR}/${SHA_B}" ]]
[[ -d "${PROD_SOURCE_RELEASES_DIR}/${SHA_C}" ]]

prune_stale_prod_release_sources "${SHA_B}" "${SHA_A}"
[[ -d "${PROD_SOURCE_RELEASES_DIR}/${SHA_A}" ]]
[[ -d "${PROD_SOURCE_RELEASES_DIR}/${SHA_B}" ]]
if [[ -e "${PROD_SOURCE_RELEASES_DIR}/${SHA_C}" ]]; then
  echo "Stale release source directory survived pruning" >&2
  exit 1
fi
[[ -d "${PROD_SOURCE_RELEASES_DIR}/not-a-sha" ]]

prune_stale_prod_release_sources "${SHA_B}" ""
if [[ -e "${PROD_SOURCE_RELEASES_DIR}/${SHA_A}" ]]; then
  echo "Former previous release directory survived pruning after empty previous" >&2
  exit 1
fi
[[ -d "${PROD_SOURCE_RELEASES_DIR}/${SHA_B}" ]]

# 스테이징 디렉터리 pruning(§2-1 신규) — 불변 저장소 pruning 과 동일한 정책이어야 한다.
mkdir -p "${PROD_SOURCE_STAGING_DIR}/${SHA_A}" "${PROD_SOURCE_STAGING_DIR}/${SHA_B}" "${PROD_SOURCE_STAGING_DIR}/${SHA_C}"
prune_stale_prod_staging_dirs "${SHA_B}" "${SHA_A}"
[[ -d "${PROD_SOURCE_STAGING_DIR}/${SHA_A}" ]]
[[ -d "${PROD_SOURCE_STAGING_DIR}/${SHA_B}" ]]
if [[ -e "${PROD_SOURCE_STAGING_DIR}/${SHA_C}" ]]; then
  echo "Stale release staging directory survived pruning" >&2
  exit 1
fi

echo "[prod-release-state] passed"

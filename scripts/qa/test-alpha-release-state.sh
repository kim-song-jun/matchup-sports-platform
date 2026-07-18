#!/usr/bin/env bash

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

export ALPHA_HOME_DIR="${TEST_ROOT}/home"
export ALPHA_LIVE_DIR="${TEST_ROOT}/live"
export ALPHA_RELEASE_STATE_DIR="${TEST_ROOT}/state"
export ALPHA_RELEASE_STATE_FILE="${ALPHA_RELEASE_STATE_DIR}/state.json"
export ALPHA_CANDIDATE_MANIFEST="${ALPHA_RELEASE_STATE_DIR}/candidate.json"
export ALPHA_FAILED_RELEASE_DIR="${ALPHA_RELEASE_STATE_DIR}/failed"
export ALPHA_LEGACY_STATE_FILE="${TEST_ROOT}/legacy-state"

source "${ROOT_DIR}/deploy/alpha-release-common.sh"

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
    '{schemaVersion:1,environment:"alpha",release:{sha:$sha,version:$version,createdAt:"2026-07-19T00:00:00Z"},source:{bucket:"alpha-bucket",key:("releases/"+$sha+".tar.gz"),versionId:"version-1",sha256:"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"},database:{migrationPolicy:"expand-contract",rollbackMode:"application-images-only",compatibilityCheck:"expand-contract-sql-v1",migrationValidatedFrom:null,rollbackCompatibleWith:null},images:{api:{repository:($registry+"/teameet-alpha-v1-api"),digest:$digest,uri:($registry+"/teameet-alpha-v1-api@"+$digest)},web:{repository:($registry+"/teameet-alpha-v1-web"),digest:$digest,uri:($registry+"/teameet-alpha-v1-web@"+$digest)}}}' \
    > "${output}"
}

manifest_a="${TEST_ROOT}/manifest-a.json"
manifest_b="${TEST_ROOT}/manifest-b.json"
tampered="${TEST_ROOT}/tampered.json"
make_manifest "${SHA_A}" "0.1.0-alpha.20260719.g111111111111" "${DIGEST_A}" "${manifest_a}"
make_manifest "${SHA_B}" "0.1.0-alpha.20260719.g222222222222" "${DIGEST_B}" "${manifest_b}"

checksum_a="$(sha256sum "${manifest_a}" | awk '{print $1}')"
validate_alpha_release_manifest "${manifest_a}" "${SHA_A}" \
  "0.1.0-alpha.20260719.g111111111111" "${checksum_a}" "${REGISTRY}"
export ALPHA_SOURCE_BUCKET=alpha-bucket
export ALPHA_SOURCE_VERSION_ID=version-1
export ALPHA_SOURCE_SHA256=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
validate_alpha_release_source_binding "${manifest_a}"
ALPHA_SOURCE_VERSION_ID=wrong-version
if validate_alpha_release_source_binding "${manifest_a}"; then
  echo "Mismatched source VersionId was accepted" >&2
  exit 1
fi
ALPHA_SOURCE_VERSION_ID=version-1

export ALPHA_RELEASE_VERSION=0.1.0-alpha.20260719.g111111111111
export ALPHA_RELEASE_SHA="${SHA_A}"
curl() {
  if [[ "$*" == *'/api/v1/health'* ]]; then
    printf '{"data":{"checks":{"db":false}}}\n'
  else
    printf 'HTTP/2 200\r\nx-teameet-release: %s\r\nx-teameet-commit: %s\r\n' \
      "${ALPHA_RELEASE_VERSION}" "${ALPHA_RELEASE_SHA}"
  fi
}
if check_alpha_health_contract; then
  echo "Failed DB health was accepted from conditional call context" >&2
  exit 1
fi
unset -f curl

export ALPHA_API_IMAGE="${REGISTRY}/teameet-alpha-v1-api@${DIGEST_A}"
export ALPHA_WEB_IMAGE="${REGISTRY}/teameet-alpha-v1-web@${DIGEST_A}"
docker_calls=0
docker() {
  docker_calls=$((docker_calls + 1))
  return 1
}
if pull_release_images; then
  echo "Failed image pull was accepted from conditional call context" >&2
  exit 1
fi
[[ "${docker_calls}" -eq 1 ]]
unset -f docker

jq '.release.sha = "bad"' "${manifest_a}" > "${tampered}"
tampered_checksum="$(sha256sum "${tampered}" | awk '{print $1}')"
if validate_alpha_release_manifest "${tampered}" "${SHA_A}" \
  "0.1.0-alpha.20260719.g111111111111" "${tampered_checksum}" "${REGISTRY}"; then
  echo "Tampered release SHA was accepted" >&2
  exit 1
fi

jq '.images.api.digest = "sha256:bad"' "${manifest_a}" > "${tampered}"
tampered_checksum="$(sha256sum "${tampered}" | awk '{print $1}')"
if validate_alpha_release_manifest "${tampered}" "${SHA_A}" \
  "0.1.0-alpha.20260719.g111111111111" "${tampered_checksum}" "${REGISTRY}"; then
  echo "Malformed API digest was accepted" >&2
  exit 1
fi

write_candidate_manifest "${manifest_a}"
promote_candidate_manifest
jq -e --arg sha "${SHA_A}" --arg checksum "${checksum_a}" '.active.release.sha == $sha and .activeManifestSha256 == $checksum and .previous == null and .previousManifestSha256 == null' \
  "${ALPHA_RELEASE_STATE_FILE}" >/dev/null
active_copy="${TEST_ROOT}/active-copy.json"
extract_active_manifest "${active_copy}"
validate_stored_alpha_manifest "${active_copy}" "${REGISTRY}" "${checksum_a}"
if validate_stored_alpha_manifest "${active_copy}" "${REGISTRY}" \
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
  "${ALPHA_RELEASE_STATE_FILE}" >/dev/null

swap_active_previous_manifests
jq -e --arg active "${SHA_A}" --arg previous "${SHA_B}" \
  '.active.release.sha == $active and .previous.release.sha == $previous' \
  "${ALPHA_RELEASE_STATE_FILE}" >/dev/null

source_a="${TEST_ROOT}/source-a"
source_b="${TEST_ROOT}/source-b"
mkdir -p "${ALPHA_LIVE_DIR}/deploy/certbot" "${source_a}/deploy" "${source_b}/deploy"
printf 'protected=true\n' > "${ALPHA_LIVE_DIR}/deploy/.env"
printf 'legacy certificate\n' > "${ALPHA_LIVE_DIR}/deploy/certbot/cert.pem"
printf 'legacy metadata\n' > "${ALPHA_LIVE_DIR}/deploy/release-metadata.alpha.conf"
printf '#!/usr/bin/env bash\n' > "${source_a}/deploy/deploy-alpha.sh"
printf 'release-a\n' > "${source_a}/release.txt"
printf '#!/usr/bin/env bash\n' > "${source_b}/deploy/deploy-alpha.sh"
printf 'release-b\n' > "${source_b}/release.txt"

prepare_alpha_release_source "${source_a}" "${SHA_A}" "${DIGEST_A#sha256:}"
prepare_alpha_release_source "${source_a}" "${SHA_A}" "${DIGEST_A#sha256:}"
printf 'tampered\n' > "${ALPHA_SOURCE_RELEASES_DIR}/${SHA_A}/release.txt"
if prepare_alpha_release_source "${source_a}" "${SHA_A}" "${DIGEST_A#sha256:}"; then
  echo "Drifted immutable source directory was reused" >&2
  exit 1
fi
printf 'release-a\n' > "${ALPHA_SOURCE_RELEASES_DIR}/${SHA_A}/release.txt"
activate_alpha_release_source "${SHA_A}"
[[ -L "${ALPHA_LIVE_DIR}" ]]
[[ "$(cat "${ALPHA_LIVE_DIR}/release.txt")" == 'release-a' ]]
[[ "$(cat "${ALPHA_LIVE_DIR}/deploy/.env")" == 'protected=true' ]]
[[ "$(cat "${ALPHA_LIVE_DIR}/deploy/certbot/cert.pem")" == 'legacy certificate' ]]
[[ "$(cat "${ALPHA_LIVE_DIR}/deploy/release-metadata.alpha.conf")" == 'legacy metadata' ]]

prepare_alpha_release_source "${source_b}" "${SHA_B}" "${DIGEST_B#sha256:}"
activate_alpha_release_source "${SHA_B}"
[[ "$(cat "${ALPHA_LIVE_DIR}/release.txt")" == 'release-b' ]]
restore_legacy_alpha_source
[[ ! -L "${ALPHA_LIVE_DIR}" ]]
[[ "$(cat "${ALPHA_LIVE_DIR}/deploy/.env")" == 'protected=true' ]]

echo "[alpha-release-state] passed"

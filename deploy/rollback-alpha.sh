#!/usr/bin/env bash

set -Eeuo pipefail

: "${ALPHA_ECR_REGISTRY:?ALPHA_ECR_REGISTRY is required}"
: "${ALPHA_AWS_REGION:?ALPHA_AWS_REGION is required}"
: "${ALPHA_EXPECTED_ACTIVE_SHA:?ALPHA_EXPECTED_ACTIVE_SHA is required}"

readonly LIVE_DIR="${ALPHA_LIVE_DIR:-/home/ec2-user/teameet}"
readonly ENV_FILE="${LIVE_DIR}/deploy/.env"
readonly COMPOSE_PROD="${LIVE_DIR}/deploy/docker-compose.prod.yml"
readonly COMPOSE_ALPHA="${LIVE_DIR}/deploy/docker-compose.alpha.yml"

source "${LIVE_DIR}/deploy/alpha-release-common.sh"

exec 9>"${ALPHA_HOME_DIR}/.teameet-alpha-deploy.lock"
if ! flock -n 9; then
  echo "[alpha-rollback] Another alpha deployment is active" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" || ! -f "${ALPHA_RELEASE_STATE_FILE}" ]]; then
  echo "[alpha-rollback] Runtime environment or immutable release state is missing" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090 -- protected operator-managed runtime configuration.
source "${ENV_FILE}"
set +a

compose=(
  docker compose
  --project-name deploy
  -f "${COMPOSE_PROD}"
  -f "${COMPOSE_ALPHA}"
  --env-file "${ENV_FILE}"
)

aws ecr get-login-password --region "${ALPHA_AWS_REGION}" |
  docker login --username AWS --password-stdin "${ALPHA_ECR_REGISTRY}"

active_tmp="$(mktemp "${ALPHA_RELEASE_STATE_DIR}/rollback-active.XXXXXX")"
previous_tmp="$(mktemp "${ALPHA_RELEASE_STATE_DIR}/rollback-previous.XXXXXX")"
readonly PREVIOUS_MANIFEST="${previous_tmp}"
trap 'rm -f "${active_tmp}" "${previous_tmp}"' EXIT

extract_active_manifest "${active_tmp}"
extract_previous_manifest "${PREVIOUS_MANIFEST}"
active_checksum="$(jq -er '.activeManifestSha256' "${ALPHA_RELEASE_STATE_FILE}")"
previous_checksum="$(jq -er '.previousManifestSha256' "${ALPHA_RELEASE_STATE_FILE}")"
validate_stored_alpha_manifest "${active_tmp}" "${ALPHA_ECR_REGISTRY}" "${active_checksum}"
validate_stored_alpha_manifest "${PREVIOUS_MANIFEST}" "${ALPHA_ECR_REGISTRY}" "${previous_checksum}"

previous_sha="$(jq -er '.release.sha' "${PREVIOUS_MANIFEST}")"
if [[ "$(jq -r '.database.rollbackCompatibleWith // ""' "${active_tmp}")" != "${previous_sha}" ]]; then
  echo "[alpha-rollback] Active manifest is not proven compatible with the previous release" >&2
  exit 1
fi

active_sha="$(jq -er '.release.sha' "${active_tmp}")"
if [[ "${active_sha}" != "${ALPHA_EXPECTED_ACTIVE_SHA}" ]]; then
  echo "[alpha-rollback] Active SHA changed; refusing stale rollback" >&2
  exit 1
fi

rollback_started=true
restore_current_on_failure() {
  local status="$?"
  trap - ERR
  if [[ "${status}" -ne 0 && "${rollback_started}" == true ]]; then
    echo "[alpha-rollback] Rollback target failed; restoring current active release" >&2
    if ! restore_active_release; then
      echo "[alpha-rollback] CRITICAL: active release restore failed" >&2
    fi
  fi
  exit "${status}"
}
trap 'restore_current_on_failure' ERR

load_alpha_release_manifest "${PREVIOUS_MANIFEST}"
pull_release_images
activate_alpha_release_source "${previous_sha}"
write_release_metadata "${PREVIOUS_MANIFEST}"

"${compose[@]}" up -d --force-recreate --no-deps \
  v1_api v1_web v1_game_operations_worker
"${compose[@]}" up -d --force-recreate --no-deps nginx
wait_for_alpha_health_contract
assert_running_release_digests
swap_active_previous_manifests
rollback_started=false
trap - ERR
rollback_started=false
if ! write_legacy_release_state; then
  echo "[alpha-rollback] WARNING: canonical state swapped but legacy receipt could not be written" >&2
fi
echo "[alpha-rollback] Active release is now ${ALPHA_RELEASE_VERSION} (${ALPHA_RELEASE_SHA})"

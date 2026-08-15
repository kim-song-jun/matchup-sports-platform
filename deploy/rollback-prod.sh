#!/usr/bin/env bash

set -Eeuo pipefail

# deploy/rollback-alpha.sh 를 prod 용으로 일반화한 것. DB 는 절대 건드리지 않는다 —
# `prisma migrate`/sanitize/seed 호출이 이 파일에 전혀 없다(§4). 롤백은 애플리케이션
# 이미지(및 그 이미지가 가리키는 소스 트리)만 이전 릴리스로 되돌린다.

: "${PROD_ECR_REGISTRY:?PROD_ECR_REGISTRY is required}"
: "${PROD_AWS_REGION:?PROD_AWS_REGION is required}"
: "${PROD_EXPECTED_ACTIVE_SHA:?PROD_EXPECTED_ACTIVE_SHA is required}"

readonly LIVE_DIR="${PROD_LIVE_DIR:-/home/ec2-user/teameet}"
readonly ENV_FILE="${LIVE_DIR}/deploy/.env"
readonly COMPOSE_PROD="${LIVE_DIR}/deploy/docker-compose.prod.yml"

source "${LIVE_DIR}/deploy/prod-release-common.sh"

exec 9>"${PROD_HOME_DIR}/.teameet-prod-deploy.lock"
if ! flock -n 9; then
  echo "[prod-rollback] Another prod deployment is active" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" || ! -f "${PROD_RELEASE_STATE_FILE}" ]]; then
  echo "[prod-rollback] Runtime environment or immutable release state is missing" >&2
  exit 1
fi

# 되돌릴 대상이 없다는 건 오류가 아니라 상태다. 이 검사가 없으면 한참 뒤
# extract_previous_manifest 안의 `jq -e` 가 exit 4 로 조용히 죽는데, 그 지점은 ERR trap
# 배선보다도 앞이라 트랩조차 안 잡는다 — 운영자에게는 이유 없는 SSH 실패로만 보인다.
#
# 순수 상태 검사이므로 ECR 로그인·이미지 pull 같은 부수효과를 일으키기 **전에** 한다.
# 되돌릴 게 없다는 걸 알아내려고 프로덕션 자격증명을 쓸 이유가 없다.
if ! jq -e '.previous != null' "${PROD_RELEASE_STATE_FILE}" >/dev/null 2>&1; then
  echo "[prod-rollback] 되돌릴 이전 릴리스가 없습니다 — state.json 의 .previous 가 null 입니다." >&2
  echo "[prod-rollback] (최초 배포 직후이거나 이전 릴리스 기록이 정리된 상태입니다.)" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090 -- protected operator-managed runtime configuration.
source "${ENV_FILE}"
set +a

# --preserve-env 가 필수인 이유는 deploy-prod.sh 의 같은 지점 주석 참조 — 요약하면
# ${V1_API_IMAGE}/${V1_WEB_IMAGE} 는 .env 가 아니라 load_prod_release_manifest() 가
# export 하는데 이 호스트는 `Defaults env_reset` 이라 sudo 가 그걸 떨군다.
# 롤백에서는 특히 중요하다 — 이 배열은 load_prod_release_manifest() 보다 **먼저** 정의되므로
# 배열에 값을 박아 넣으면 항상 빈 문자열이 굳는다.
# compose 호출 형태는 호스트마다 다르다 — 판정 근거는 resolve_compose_binary() 주석 참조.
# 롤백에서 특히 중요하다: 이 배열이 틀리면 되돌릴 수단 자체가 없다.
compose_binary=()
while IFS= read -r compose_token; do
  compose_binary+=("${compose_token}")
done < <(resolve_compose_binary)
[[ ${#compose_binary[@]} -gt 0 ]] || exit 1

compose=(
  sudo --preserve-env=V1_API_IMAGE,V1_WEB_IMAGE "${compose_binary[@]}"
  --project-name deploy
  -f "${COMPOSE_PROD}"
  --env-file "${ENV_FILE}"
)

aws ecr get-login-password --region "${PROD_AWS_REGION}" |
  sudo docker login --username AWS --password-stdin "${PROD_ECR_REGISTRY}"

active_tmp="$(mktemp "${PROD_RELEASE_STATE_DIR}/rollback-active.XXXXXX")"
previous_tmp="$(mktemp "${PROD_RELEASE_STATE_DIR}/rollback-previous.XXXXXX")"
readonly PREVIOUS_MANIFEST="${previous_tmp}"
trap 'rm -f "${active_tmp}" "${previous_tmp}"' EXIT

extract_active_manifest "${active_tmp}"
extract_previous_manifest "${PREVIOUS_MANIFEST}"
active_checksum="$(jq -er '.activeManifestSha256' "${PROD_RELEASE_STATE_FILE}")"
previous_checksum="$(jq -er '.previousManifestSha256' "${PROD_RELEASE_STATE_FILE}")"
validate_stored_prod_manifest "${active_tmp}" "${PROD_ECR_REGISTRY}" "${active_checksum}"
validate_stored_prod_manifest "${PREVIOUS_MANIFEST}" "${PROD_ECR_REGISTRY}" "${previous_checksum}"

previous_sha="$(jq -er '.release.sha' "${PREVIOUS_MANIFEST}")"
if [[ "$(jq -r '.database.rollbackCompatibleWith // ""' "${active_tmp}")" != "${previous_sha}" ]]; then
  echo "[prod-rollback] Active manifest is not proven compatible with the previous release" >&2
  exit 1
fi

active_sha="$(jq -er '.release.sha' "${active_tmp}")"
if [[ "${active_sha}" != "${PROD_EXPECTED_ACTIVE_SHA}" ]]; then
  echo "[prod-rollback] Active SHA changed; refusing stale rollback" >&2
  exit 1
fi

rollback_started=true
restore_current_on_failure() {
  local status="$?"
  trap - ERR
  if [[ "${status}" -ne 0 && "${rollback_started}" == true ]]; then
    echo "[prod-rollback] Rollback target failed; restoring current active release" >&2
    if ! restore_active_release; then
      echo "[prod-rollback] CRITICAL: active release restore failed" >&2
    fi
  fi
  exit "${status}"
}
trap 'restore_current_on_failure' ERR

load_prod_release_manifest "${PREVIOUS_MANIFEST}"
# 매니페스트 로드 뒤에 검사한다 — V1_*_IMAGE 는 여기서 export 되므로 그 전에 부르면
# 이미지 변수까지 미설정으로 잡힌다. 롤백에서 빈 비밀키로 되살아나는 것도 똑같이 막아야 한다.
assert_compose_variables_resolve "${compose[@]}"
pull_release_images
activate_prod_release_source "${previous_sha}"
write_release_metadata "${PREVIOUS_MANIFEST}"

"${compose[@]}" up -d --no-deps v1_api v1_web v1_game_operations_worker
"${compose[@]}" up -d --force-recreate --no-deps nginx
wait_for_prod_health_contract
assert_running_release_digests

# 런타임 컷오버는 여기서 이미 끝나고 확인됐다 — 컨테이너는 previous 릴리스로 전환됐고
# 헬스·digest 검증도 통과했다. 이 아래 swap_active_previous_manifests() 는 순수 상태파일
# (state.json) 부기일 뿐 컨테이너를 건드리지 않는다. rollback_started 를 여기서 먼저
# false 로 내리고 ERR trap 을 해제해야 한다 — 그대로 두면 부기(diskfull 등)만 실패해도
# ERR trap 이 "롤백 실패"로 오인해 방금 성공적으로 벗어난 문제의 active 릴리스로 컨테이너를
# 되돌린다(실제로는 애플리케이션 레벨 롤백이 100% 성공한 상태였는데도).
rollback_started=false
trap - ERR
if ! swap_active_previous_manifests; then
  echo "[prod-rollback] CRITICAL: runtime now serves ${PROD_RELEASE_VERSION} (${PROD_RELEASE_SHA}) but release-state bookkeeping (state.json) failed to swap active/previous — do NOT re-run rollback; repair state.json manually before the next deploy" >&2
  exit 1
fi
if ! write_legacy_release_state; then
  echo "[prod-rollback] WARNING: canonical state swapped but legacy receipt could not be written" >&2
fi
echo "[prod-rollback] Active release is now ${PROD_RELEASE_VERSION} (${PROD_RELEASE_SHA})"

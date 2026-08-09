#!/usr/bin/env bash

set -Eeuo pipefail

# `.github/workflows/deploy.yml` 의 deploy job(승인 게이트 통과 후)이 이 스크립트를
# `~/.teameet-prod-staging/<sha>/deploy/deploy-prod.sh` 경로에서 SSH 로 직접 실행한다.
# deploy/deploy-alpha.sh 를 prod 용으로 일반화한 것 — S3(bucket/versionId) 개념이 없고
# (D2), 승인 게이트가 build-images/deploy 두 job 으로 이미 분리돼 있어 이 스크립트는
# activation + migrate + 컨테이너 교체만 담당한다(D3 — 이미지 push 와 소스 스테이징은
# build-images job 이 승인 전에 이미 끝내 둔다).

: "${PROD_SOURCE_DIR:?PROD_SOURCE_DIR is required}"
: "${PROD_MANIFEST_FILE:?PROD_MANIFEST_FILE is required}"
: "${PROD_MANIFEST_SHA256:?PROD_MANIFEST_SHA256 is required}"
: "${PROD_SHA:?PROD_SHA is required}"
: "${PROD_RELEASE_VERSION:?PROD_RELEASE_VERSION is required}"
: "${PROD_ECR_REGISTRY:?PROD_ECR_REGISTRY is required}"
: "${PROD_AWS_REGION:?PROD_AWS_REGION is required}"
: "${PROD_SOURCE_SHA256:?PROD_SOURCE_SHA256 is required}"

if [[ ! "${PROD_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "[prod-deploy] PROD_SHA must be a full lowercase commit SHA" >&2
  exit 1
fi

if [[ ! "${PROD_RELEASE_VERSION}" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo "[prod-deploy] PROD_RELEASE_VERSION must be a stable Teameet SemVer" >&2
  exit 1
fi

readonly LIVE_DIR="/home/ec2-user/teameet"
readonly ENV_FILE="${LIVE_DIR}/deploy/.env"
readonly COMPOSE_PROD="${LIVE_DIR}/deploy/docker-compose.prod.yml"

exec 9>"/home/ec2-user/.teameet-prod-deploy.lock"
if ! flock -n 9; then
  echo "[prod-deploy] Another prod deployment is active" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[prod-deploy] Missing protected runtime environment file" >&2
  exit 1
fi

for required_path in \
  "${PROD_SOURCE_DIR}/deploy/deploy-prod.sh" \
  "${PROD_SOURCE_DIR}/deploy/prod-release-common.sh" \
  "${PROD_SOURCE_DIR}/deploy/prod-manifest-common.sh" \
  "${PROD_SOURCE_DIR}/deploy/prod-source-common.sh" \
  "${PROD_SOURCE_DIR}/deploy/rollback-prod.sh" \
  "${PROD_MANIFEST_FILE}"; do
  if [[ ! -f "${required_path}" ]]; then
    echo "[prod-deploy] Incomplete release artifact: ${required_path}" >&2
    exit 1
  fi
done

source "${PROD_SOURCE_DIR}/deploy/prod-release-common.sh"
validate_prod_release_manifest \
  "${PROD_MANIFEST_FILE}" \
  "${PROD_SHA}" \
  "${PROD_RELEASE_VERSION}" \
  "${PROD_MANIFEST_SHA256}" \
  "${PROD_ECR_REGISTRY}"
load_prod_release_manifest "${PROD_MANIFEST_FILE}"

had_active=false
if [[ -f "${PROD_RELEASE_STATE_FILE}" ]]; then
  had_active=true
fi
runtime_mutated=false
source_activated=false
legacy_api_image=''
legacy_web_image=''
legacy_metadata_backup=''

# §5: 최초 1회 레거시 전환. alpha 의 fail-closed 게이트(legacy 텍스트 영수증 사전 요구)는
# prod 에 적용할 수 없다 — prod 는 지금까지 한 번도 이 immutable 상태 기계장치를 거친 적이
# 없어 legacy 영수증 파일 자체가 존재하지 않기 때문이다(요구하면 첫 배포가 100% 실패한다).
# 대신 실제로 떠 있는 `:latest` 컨테이너를 런타임 증거로 삼는다.
if [[ "${had_active}" == false ]]; then
  # --filter name= 은 부분일치(정규식)라 teameet_v1_api_backup 같은 동명 포함 컨테이너를
  # 집을 수 있다. 아래 태그 검사가 대부분 방어하지만, 애초에 정확히 일치시키는 게 맞다.
  legacy_api_container="$(sudo docker ps -q --filter 'name=^teameet_v1_api$' | head -n 1)"
  legacy_web_container="$(sudo docker ps -q --filter 'name=^teameet_v1_web$' | head -n 1)"
  if [[ -z "${legacy_api_container}" || -z "${legacy_web_container}" ]]; then
    echo "[prod-deploy] No running legacy containers to convert from" >&2
    exit 1
  fi
  legacy_api_image="$(sudo docker inspect --format '{{.Config.Image}}' "${legacy_api_container}")"
  legacy_web_image="$(sudo docker inspect --format '{{.Config.Image}}' "${legacy_web_container}")"
  if [[ "${legacy_api_image}" != "teameet-v1-api:latest" ]]; then
    echo "[prod-deploy] Running v1_api container is not on the expected legacy tag" >&2
    exit 1
  fi
  if [[ "${legacy_web_image}" != "teameet-v1-web:latest" ]]; then
    echo "[prod-deploy] Running v1_web container is not on the expected legacy tag" >&2
    exit 1
  fi
fi

# 런타임 .env 를 `source` 하지 않는다. `source` 는 파일을 **셸 코드로 실행**하므로, 값에
# `$`·공백·세미콜론·`$(...)` 가 들어가면 원문이 보존되지 않거나 명령이 실제로 실행된다.
# 실측(2026-08-03): 'pa$$word' → PID 로 확장, 'a b' → 뒤 토큰을 명령으로 실행 시도,
# '$(cmd)' 와 'a;cmd' → 실행됨. 값은 Parameter Store 에서 오므로 지금은 무해하지만,
# KAKAO_SCOPE 처럼 공백이 정상인 값 하나만 들어와도 조용히 깨진다.
#
# 따옴표로 감싸는 방법은 쓸 수 없다 — 이 파일은 compose 도 `--env-file` 로 읽는데,
# compose 는 셸의 '\'' 이스케이프를 파싱하지 못하고 **파일 전체를 거부**한다(실측).
# 그래서 파일은 compose 원형(따옴표 없는 KEY=VALUE)으로 두고, 셸 쪽에서 source 를 없앴다.
#
# 시크릿은 compose 가 --env-file 로 직접 읽으므로 셸 환경에 올릴 이유가 없다.
# 이 스크립트가 셸에서 직접 봐야 하는 값만 아래에서 읽는다(셸 해석 없이).
#
# V1_DB_HOST 를 여기서 함께 읽는 것이 중요하다. source 를 없앤 뒤에도 아래 로컬 Postgres
# 분기가 이 변수를 참조하는데, 정작 셸에는 값이 들어오지 않아 **항상 미설정**이었다. 즉
# `${V1_DB_HOST:-v1_postgres}` 가 언제나 기본값으로 떨어져 외부 DB 분기가 죽은 코드였다
# — .env 가 RDS 엔드포인트를 가리켜도 로컬 컨테이너를 띄우고 기다렸다.
# (Copilot 리뷰 지적, 2026-08-03 재현으로 확인.)
env_value() {
  sed -n "s/^$1=//p" "${ENV_FILE}" | head -1
}
V1_DB_USER="$(env_value V1_DB_USER)"
V1_DB_NAME="$(env_value V1_DB_NAME)"
V1_DB_HOST="$(env_value V1_DB_HOST)"

export COMPOSE_PARALLEL_LIMIT=1
# --preserve-env 가 반드시 필요하다. docker-compose.prod.yml 은 이미지를
# ${V1_API_IMAGE}/${V1_WEB_IMAGE} 로 참조하는데 이 값들은 .env 에 없고
# load_prod_release_manifest() 가 export 한다. 그런데 이 호스트의 /etc/sudoers 에는
# `Defaults env_reset` 이 걸려 있어(실측) 그냥 `sudo docker compose` 로 부르면 root 쪽에
# 전달되지 않는다 — compose 는 빈 문자열로 치환하고 배포가 이상하게 깨진다.
#
# `sudo env VAR=...` 대신 --preserve-env 를 쓰는 이유: 이 배열은 값이 확정되기 전에
# 정의될 수 있고(rollback-prod.sh 는 매니페스트 로드보다 먼저 배열을 만든다), 아래
# restore_legacy_runtime() 은 V1_*_IMAGE 를 레거시 태그로 **재할당**한다. 배열에 값을
# 박아 넣으면 그 시점의 값이 굳어 stale 해진다. --preserve-env 는 exec 시점의 환경을
# 넘기므로 두 경우 모두 올바르게 동작한다. (sudo 1.9.15p5 에서 동작 확인)
# compose 호출 형태는 호스트마다 다르다 — 판정 근거는 resolve_compose_binary() 주석 참조.
# 여기서 실패하면 컨테이너를 하나도 건드리기 전에 멈춘다.
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

assert_compose_variables_resolve "${compose[@]}"

restore_legacy_runtime() {
  [[ -n "${legacy_api_image}" && -n "${legacy_web_image}" ]] || return 1
  restore_legacy_prod_release_source || return 1
  # write_release_metadata() 가 이미 새(실패한) candidate 의 X-Teameet-Release/Commit 을
  # 찍어 놓은 뒤이므로, 그대로 두고 nginx 를 force-recreate 하면 실제로는 legacy 컨테이너가
  # 도는데 헤더는 실패한 새 릴리스를 가리키는 상태가 된다 — 다음 배포의
  # resolve-prod-rollback-base.sh 가 이 헤더(public_sha)와 legacy 상태파일의 진짜 sha를
  # 비교해 불일치로 완전히 막힌다. force-recreate 전에 반드시 되돌린다.
  if [[ -n "${legacy_metadata_backup}" && -f "${legacy_metadata_backup}" ]]; then
    install -m 644 "${legacy_metadata_backup}" "${PROD_RUNTIME_METADATA_FILE}" || return 1
  fi
  V1_API_IMAGE="${legacy_api_image}"
  V1_WEB_IMAGE="${legacy_web_image}"
  export V1_API_IMAGE V1_WEB_IMAGE
  "${compose[@]}" up -d --no-deps v1_api v1_web || return 1
  "${compose[@]}" up -d --force-recreate --no-deps nginx || return 1
  local restored_api_container
  local restored_web_container
  restored_api_container="$("${compose[@]}" ps -q v1_api)" || return 1
  restored_web_container="$("${compose[@]}" ps -q v1_web)" || return 1
  [[ -n "${restored_api_container}" && -n "${restored_web_container}" ]] || return 1
  [[ "$(sudo docker inspect --format '{{.Config.Image}} {{.State.Running}}' "${restored_api_container}")" == "${legacy_api_image} true" ]] || return 1
  [[ "$(sudo docker inspect --format '{{.Config.Image}} {{.State.Running}}' "${restored_web_container}")" == "${legacy_web_image} true" ]] || return 1
  curl -fsS --connect-timeout 3 --max-time 10 \
    http://127.0.0.1:8121/api/v1/health | jq -e '.data.checks.db == true' >/dev/null || return 1
}

restore_on_failure() {
  local status="$?"
  trap - ERR
  archive_failed_candidate
  if [[ "${runtime_mutated}" == true && "${had_active}" == true ]]; then
    echo "[prod-deploy] Candidate failed; restoring active release" >&2
    if ! restore_active_release; then
      echo "[prod-deploy] CRITICAL: active release restore failed" >&2
    fi
  elif [[ "${source_activated}" == true && "${had_active}" == false ]]; then
    echo "[prod-deploy] First immutable candidate failed; restoring legacy runtime" >&2
    if ! restore_legacy_runtime; then
      echo "[prod-deploy] CRITICAL: legacy runtime restore failed" >&2
    fi
  fi
  exit "${status}"
}
trap 'restore_on_failure' ERR

if ! command -v rsync >/dev/null 2>&1; then
  echo "[prod-deploy] Installing missing rsync prerequisite"
  sudo dnf install -y rsync
fi

write_candidate_manifest "${PROD_MANIFEST_FILE}"
prepare_prod_release_source "${PROD_SOURCE_DIR}" "${PROD_SHA}" "${PROD_SOURCE_SHA256}"
activate_prod_release_source "${PROD_SHA}"
source_activated=true
runtime_mutated=true
chmod 600 "${ENV_FILE}"

cpu_count="$(getconf _NPROCESSORS_ONLN)"
load_average="$(awk '{ print $1 }' /proc/loadavg)"
memory_available_kib="$(awk '$1 == "MemAvailable:" { print $2 }' /proc/meminfo)"
swap_free_kib="$(awk '$1 == "SwapFree:" { print $2 }' /proc/meminfo)"
container_count="$(sudo docker ps -q | wc -l | tr -d ' ')"
printf '[prod-deploy] preflight cpu=%s load=%s mem_available_kib=%s swap_free_kib=%s containers=%s\n' \
  "${cpu_count}" "${load_average}" "${memory_available_kib}" "${swap_free_kib}" "${container_count}"

if (( memory_available_kib < 131072 || swap_free_kib < 131072 )); then
  echo "[prod-deploy] Host memory or swap headroom is too low" >&2
  false
fi

aws ecr get-login-password --region "${PROD_AWS_REGION}" |
  sudo docker login --username AWS --password-stdin "${PROD_ECR_REGISTRY}"

pull_release_images
# 최초 1회 전환에서만 실패 복구 경로(restore_legacy_runtime)가 legacy 컨테이너로 되돌아갈
# 수 있다 — 그 경로가 nginx 를 force-recreate 하기 전에 되돌릴 수 있도록, 아래
# write_release_metadata() 가 이 파일을 새 candidate 값으로 덮어쓰기 직전의 내용을
# 스냅샷해 둔다(첫 배포 시점엔 prepare_prod_release_source() 가 막 부트스트랩한 legacy
# placeholder 그대로다).
if [[ "${had_active}" == false ]]; then
  legacy_metadata_backup="$(mktemp)"
  cp "${PROD_RUNTIME_METADATA_FILE}" "${legacy_metadata_backup}"
fi
write_release_metadata "${PROD_MANIFEST_FILE}"
# DB 가 인스턴스 밖(RDS)에 있으면 로컬 컨테이너를 띄우고 그것의 준비 상태를 기다리는 것은
# 의미가 없다 — 앱이 접속하는 대상이 아니기 때문이다. V1_DB_HOST 가 기본값(v1_postgres)일
# 때만 로컬 경로를 탄다. 전환 후에도 컨테이너와 볼륨은 남겨 두지만(롤백 창), 기동과 대기는
# 건너뛴다.
if [[ "${V1_DB_HOST:-v1_postgres}" == "v1_postgres" ]]; then
  "${compose[@]}" up -d v1_postgres

  for attempt in $(seq 1 30); do
    if "${compose[@]}" exec -T v1_postgres \
      pg_isready -U "${V1_DB_USER:-teameet_v1}" -d "${V1_DB_NAME:-teameet_v1}" >/dev/null 2>&1; then
      break
    fi
    if [[ "${attempt}" -eq 30 ]]; then
      echo "[prod-deploy] PostgreSQL did not become ready" >&2
      false
    fi
    sleep 2
  done
else
  echo "[prod-deploy] 외부 DB(${V1_DB_HOST}) 사용 — 로컬 v1_postgres 기동을 건너뜁니다"
fi

# D7: prisma migrate deploy 는 이 스크립트 안에서 정확히 1회만 실행한다(구 restart-containers.sh
# 의 이중 실행을 이번 변경에서 제거). alpha 와 달리 sanitize/QA 시드는 절대 이식하지 않는다
# (§6 — prod 는 진짜 사용자 데이터다).
"${compose[@]}" run --rm --no-deps -T v1_api sh -c \
  'cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy'

# restart-containers.sh 의 업로드 백업/복원 왕복을 그대로 흡수한다(D 표에 없던 prod 전용
# 안전장치 — alpha 에는 없지만 기존 prod 배포가 볼륨 마운트에도 불구하고 방어적으로 이
# 절차를 유지해 왔으므로 그대로 보존한다). 컨테이너 교체 방식 자체는 alpha 와 동일하게
# 맨 `up -d`(플래그 없음) 하나로 둔다 — V1_API_IMAGE/V1_WEB_IMAGE 가 이번 release 의 새
# digest 로 바뀌었으므로 compose 가 이미지 변경을 감지해 v1_api/v1_web 을 자동으로
# 재생성한다. 여기서 별도로 --force-recreate 를 걸면 실패 시 restore_active_release() 의
# `up -d --no-deps v1_api v1_web`(force-recreate 없음)과 동작이 갈려, 아직 정상 동작 중인
# 컨테이너까지 복구 경로에서 불필요하게 재생성될 위험이 생긴다.
v1_uploads_backup_dir="$(mktemp -d)"
if sudo docker ps -a --format '{{.Names}}' | grep -qx 'teameet_v1_api'; then
  echo "[prod-deploy] Backing up existing v1 uploads before recreating v1_api..."
  # 실패 원인을 구분한다. 예전에는 stderr 를 버리고 모든 실패를 "업로드 디렉터리 없음"
  # 으로 보고했는데, 디스크 부족·권한 오류·docker 데몬 오류까지 같은 문구로 묻혔다.
  # 그 뒤 [[ -d ... ]] 가 false 가 되어 복원이 조용히 건너뛰어지므로, 진짜 실패였을 때
  # 사용자 업로드가 말없이 사라진다. "없어서 못 받음"과 "받다가 실패"는 다르게 다뤄야 한다.
  cp_stderr="$(mktemp)"
  if ! sudo docker cp teameet_v1_api:/app/apps/v1_api/uploads "${v1_uploads_backup_dir}/" 2>"${cp_stderr}"; then
    if grep -qiE 'no such file or directory|not found' "${cp_stderr}"; then
      echo "[prod-deploy] No existing v1 uploads directory found to back up."
      rm -f "${cp_stderr}"
    else
      echo "[prod-deploy] 기존 업로드 백업에 실패했습니다 — 복원 없이 진행하면 유실됩니다:" >&2
      cat "${cp_stderr}" >&2
      rm -f "${cp_stderr}"
      false
    fi
  else
    rm -f "${cp_stderr}"
  fi
fi

"${compose[@]}" up -d

if [[ -d "${v1_uploads_backup_dir}/uploads" ]]; then
  echo "[prod-deploy] Restoring v1 uploads into the persistent volume..."
  sudo docker exec --user 0:0 teameet_v1_api mkdir -p /app/apps/v1_api/uploads
  sudo docker cp "${v1_uploads_backup_dir}/uploads/." teameet_v1_api:/app/apps/v1_api/uploads/
  echo "[prod-deploy] Re-applying v1 upload ownership after restore..."
  "${compose[@]}" run --rm --no-deps -T v1_uploads_init
fi
rm -rf "${v1_uploads_backup_dir}" 2>/dev/null || true

"${compose[@]}" up -d --force-recreate --no-deps nginx
wait_for_prod_health_contract
assert_running_release_digests

# restart-containers.sh 의 수동 재시드 escape hatch 를 그대로 흡수한다. 기본은 off — CI
# 워크플로는 이 변수를 설정하지 않으므로 정상 배포 경로에는 영향이 없다. 운영자가 EC2 에
# 직접 SSH 해 DEPLOY_SYNC_V1_SEED_DATA=true 로 이 스크립트를 재실행할 때만 동작한다.
if [[ "${DEPLOY_SYNC_V1_SEED_DATA:-false}" == "true" ]]; then
  echo "[prod-deploy] Syncing v1 seed data..."
  "${compose[@]}" exec -T v1_api sh -c "cd /app/apps/v1_api && ./node_modules/.bin/ts-node prisma/seed.ts"
else
  echo "[prod-deploy] Skipping v1 seed data sync because DEPLOY_SYNC_V1_SEED_DATA=false"
fi

# 재배포 스킵 판정은 반드시 release.sha 동일성만으로 한다(manifest 전체 구조적 동등성이
# 아니라) — 같은 sha 를 재배포(예: 새 커밋 없이 workflow_dispatch 재실행)하면
# resolve-prod-rollback-base.sh 가 canonical(=active.release.sha=이 sha 자신)을 그대로
# previousSha 로 돌려주어 candidate.database.rollbackCompatibleWith 이 자기참조가 된다.
# 이 필드만으로 manifest 전체 동등성을 비교하면 항상 달라 보여 promote_candidate_manifest()
# 가 불필요하게 실행되고, 진짜 previous(직전 릴리스)가 active 와 동일한 sha 로 덮여
# 사라진다 — 이후 prune 이 그 진짜 previous 의 온디스크 소스까지 지워 롤백 불능이 된다.
if [[ "${had_active}" == true ]] &&
  jq -e --slurpfile candidate "${PROD_CANDIDATE_MANIFEST}" \
    '.active.release.sha == $candidate[0].release.sha' "${PROD_RELEASE_STATE_FILE}" >/dev/null; then
  rm -f "${PROD_CANDIDATE_MANIFEST}"
else
  promote_candidate_manifest
fi
trap - ERR
# jq 실패를 함수 인자 위치의 커맨드 치환으로 두면 `set -e` 가 잡지 못한다(bash: 커맨드
# 치환이 대입문 전체가 아니라 인자 하나일 때는 그 실패가 상위 커맨드의 종료코드에 반영되지
# 않는다) — keep_active 가 빈 문자열로 조용히 넘어가면 prune 함수가 "일치하는 것 없음"으로
# 해석해 활성 릴리스 디렉터리까지 전부 삭제한다. 반드시 대입문으로 먼저 분리해 실패를 눈에
# 띄게 만든다.
if active_sha_for_prune="$(jq -er '.active.release.sha' "${PROD_RELEASE_STATE_FILE}")"; then
  previous_sha_for_prune="$(jq -r '.previous.release.sha // empty' "${PROD_RELEASE_STATE_FILE}")"
  prune_stale_prod_release_sources \
    "${active_sha_for_prune}" \
    "${previous_sha_for_prune}" ||
    echo "[prod-deploy] WARNING: stale release source prune failed" >&2
  prune_stale_prod_staging_dirs \
    "${active_sha_for_prune}" \
    "${previous_sha_for_prune}" ||
    echo "[prod-deploy] WARNING: stale release staging prune failed" >&2
else
  echo "[prod-deploy] WARNING: could not resolve active release sha from state file; skipping stale release source/staging prune" >&2
fi
if ! write_legacy_release_state; then
  echo "[prod-deploy] WARNING: canonical state is active but legacy receipt could not be written" >&2
fi
# 디스크 정리. 구 restart-containers.sh 가 매 배포 끝에 하던 일을 이어받는다 — 그게 빠지면
# 배포를 거듭할수록 EC2 디스크가 찬다.
#
# `-a`(사용 중이 아닌 이미지 전부)를 쓰지 않는 이유가 아니라, 여기서 dangling 정리만으로
# 충분한 이유: 롤백은 로컬 이미지에 의존하지 않는다. rollback-prod.sh 가 pull_release_images()
# 로 ECR 에서 digest 를 다시 받아온다(ECR 은 IMMUTABLE 이고 릴리스 이미지는 태그가 붙어 있어
# untagged 7일 만료 정책의 대상이 아니다). 그래도 -a 는 쓰지 않는다 — 지금 떠 있지 않은
# 사이드카/보조 이미지까지 지워 다음 배포의 pull 량만 늘린다.
#
# 실패해도 배포를 실패시키지 않는다. 디스크 정리는 릴리스 건전성과 무관한 위생 작업이다.
if ! sudo docker image prune -f >/dev/null 2>&1; then
  echo "[prod-deploy] WARNING: docker image prune failed (디스크 정리만 실패, 릴리스는 정상)" >&2
fi
echo "[prod-deploy] ${PROD_RELEASE_VERSION} (${PROD_RELEASE_SHA}) is healthy"

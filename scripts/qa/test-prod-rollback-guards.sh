#!/usr/bin/env bash
#
# deploy/rollback-prod.sh 의 **진입 가드**를 스크립트 자체를 실행해 검증한다.
#
# 왜 필요한가: 이 스크립트는 지금까지 어떤 CI 에서도 실행된 적이 없고, 유일한 실행처가
# 라이브 프로덕션 EC2 였다. 즉 "처음 롤백이 필요한 순간" 이 이 스크립트의 사실상 첫 실행이다.
# 롤백은 이미 무언가 잘못된 상황에서만 쓰는 경로라, 그때 처음 버그를 만나면 복구 수단이
# 통째로 없는 것과 같다.
#
# 무엇을 검증하는가 (실제 EC2 없이 확인 가능한 범위):
#   1. 필수 환경변수 누락 시 즉시·명확히 실패하는가
#   2. 런타임/상태 파일이 없을 때 사유가 남는가
#   3. previous 릴리스가 없을 때 조용히 exit 4 로 죽지 않고 사람이 읽을 수 있게 알리는가
#      (이게 없으면 운영자에게는 이유 없는 SSH 실패로만 보인다)
#
# 검증 못 하는 것(명시): 컨테이너 컷오버·헬스체크·digest 검증·상태 부기 순서 등 런타임
# 오케스트레이션 전체. 그건 실제 EC2 리허설이 필요하다.

set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${REPO_ROOT}/deploy/rollback-prod.sh"
[[ -f "${SCRIPT}" ]] || { echo "deploy/rollback-prod.sh 가 없습니다" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

# 실제로 실행되면 안 되는 것들을 전부 가짜로 세운다. 가드에 걸려 그 앞에서 멈춰야 정상이라,
# 이 가짜들이 호출되면 그것 자체가 결함 신호다.
mkdir -p "${WORK}/bin"
printf '#!/bin/sh\nexec "$@"\n' > "${WORK}/bin/sudo"
cat > "${WORK}/bin/aws" <<'FAKE'
#!/bin/sh
echo "FAIL: aws 가 호출됐다 — 가드가 그 앞에서 멈췄어야 한다" >&2
exit 90
FAKE
cat > "${WORK}/bin/docker" <<'FAKE'
#!/bin/sh
echo "FAIL: docker 가 호출됐다 — 가드가 그 앞에서 멈췄어야 한다" >&2
exit 91
FAKE
# flock 은 macOS 에 없다(CI ubuntu 에는 있다). 이 테스트의 대상은 배포 락이 아니라 그 뒤의
# 진입 가드이므로, 어디서 돌리든 같은 결과가 나오도록 "락 획득 성공" 스텁을 세운다.
# 스텁이 없으면 rollback-prod.sh 가 flock 부재를 "다른 배포가 진행 중" 으로 잘못 보고하며
# 멈춰서, 정작 검증하려는 가드에 도달하지 못한다.
cat > "${WORK}/bin/flock" <<'FAKE'
#!/bin/sh
exit 0
FAKE
chmod +x "${WORK}/bin/sudo" "${WORK}/bin/aws" "${WORK}/bin/docker" "${WORK}/bin/flock"

failures=0

# LIVE_DIR 을 흉내낸 최소 트리를 만든다. rollback-prod.sh 는 이 경로에서
# deploy/prod-release-common.sh 를 source 한다.
make_live_dir() {
  local home="$1"
  mkdir -p "${home}/teameet/deploy"
  cp "${REPO_ROOT}/deploy/prod-release-common.sh" "${home}/teameet/deploy/"
  cp "${REPO_ROOT}/deploy/prod-source-common.sh" "${home}/teameet/deploy/" 2>/dev/null || true
  cp "${REPO_ROOT}/deploy/prod-manifest-common.sh" "${home}/teameet/deploy/" 2>/dev/null || true
  cp "${REPO_ROOT}/deploy/docker-compose.prod.yml" "${home}/teameet/deploy/" 2>/dev/null || true
}

run_rollback() {
  local home="$1"; shift
  env -i \
    PATH="${WORK}/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
    HOME="${home}" \
    PROD_HOME_DIR="${home}" \
    PROD_LIVE_DIR="${home}/teameet" \
    "$@" \
    bash "${SCRIPT}" 2>&1
}

check() {
  local label="$1" expect_pattern="$2" out rc=0
  shift 2
  out="$("$@")" || rc=$?
  if [[ "${rc}" -eq 0 ]]; then
    echo "  FAIL  ${label} — 가드가 통과시켰다(exit 0). 실제 환경이었다면 그대로 진행했을 것이다." >&2
    failures=$((failures + 1))
    return
  fi
  if grep -qE "${expect_pattern}" <<< "${out}"; then
    echo "  ok    ${label}  (exit ${rc})"
  else
    echo "  FAIL  ${label} — exit ${rc} 이지만 기대한 사유 메시지가 없다." >&2
    echo "        기대 패턴: ${expect_pattern}" >&2
    echo "        실제 출력: $(head -3 <<< "${out}" | tr '\n' ' ')" >&2
    failures=$((failures + 1))
  fi
}

echo "rollback-prod.sh 진입 가드:"

# ① 필수 환경변수 누락 — `: "${VAR:?...}"` 가 사유를 남기고 즉시 죽어야 한다.
H1="${WORK}/case1"; make_live_dir "${H1}"
check "필수 환경변수 누락 시 즉시 실패" "PROD_ECR_REGISTRY is required" \
  run_rollback "${H1}"

# ② 상태 파일 부재 — 락은 잡히지만 런타임/상태 파일이 없다.
H2="${WORK}/case2"; make_live_dir "${H2}"
check "런타임/상태 파일 부재 시 사유 출력" "Runtime environment or immutable release state is missing" \
  run_rollback "${H2}" \
  PROD_ECR_REGISTRY=example.dkr.ecr.ap-northeast-2.amazonaws.com \
  PROD_AWS_REGION=ap-northeast-2 \
  PROD_EXPECTED_ACTIVE_SHA=1111111111111111111111111111111111111111

# ③ previous 부재 — 이게 오늘 고친 가드다. 예전에는 jq -e 가 exit 4 로 조용히 죽어
#    운영자에게는 이유 없는 SSH 실패로만 보였다.
H3="${WORK}/case3"; make_live_dir "${H3}"
printf 'FOO=bar\n' > "${H3}/teameet/deploy/.env"
# 상태 디렉터리 경로를 여기 하드코딩하면 prod-release-common.sh 가 바뀔 때 테스트가 조용히
# 무의미해진다(파일이 없는 다른 이유로 통과). 실제 정의를 그대로 읽어 쓴다.
STATE_DIR="$(
  PROD_HOME_DIR="${H3}" bash -c '
    . "'"${REPO_ROOT}"'/deploy/prod-release-common.sh" >/dev/null 2>&1 || true
    printf "%s" "${PROD_RELEASE_STATE_DIR}"
  '
)"
[[ -n "${STATE_DIR}" ]] || { echo "PROD_RELEASE_STATE_DIR 을 해석하지 못했습니다" >&2; exit 1; }
mkdir -p "${STATE_DIR}"
cat > "${STATE_DIR}/state.json" <<'JSON'
{
  "schemaVersion": 1,
  "active": {
    "schemaVersion": 1,
    "release": { "sha": "1111111111111111111111111111111111111111" }
  },
  "activeManifestSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  "previous": null,
  "previousManifestSha256": null
}
JSON
check "previous 없음을 조용히 죽지 않고 알림" "되돌릴 이전 릴리스가 없습니다|No previous release" \
  run_rollback "${H3}" \
  PROD_ECR_REGISTRY=example.dkr.ecr.ap-northeast-2.amazonaws.com \
  PROD_AWS_REGION=ap-northeast-2 \
  PROD_EXPECTED_ACTIVE_SHA=1111111111111111111111111111111111111111

if [[ "${failures}" -gt 0 ]]; then
  echo "${failures}건 실패" >&2
  exit 1
fi
echo "[prod-rollback-guards] passed"

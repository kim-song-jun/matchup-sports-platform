#!/usr/bin/env bash
#
# deploy/prod-release-common.sh 의 prune_stale_release_tags 회귀 테스트.
#
# 검증 대상은 "지울 태그가 없을 때 함수가 성공으로 끝나는가" 다. 프로덕션 원격
# 스크립트가 `set -euo pipefail` 로 돌기 때문에, 이 함수가 실패를 반환하면 배포 전체가
# 중단된다 — 2026-08-01 에 실제로 그렇게 터졌고, 빌드가 막혀 SHA 태그가 영영 생기지
# 않는 교착이라 이후 모든 프로덕션 배포가 죽는 상태였다.
#
# 그래서 각 케이스를 실제 원격 환경과 동일하게 `set -euo pipefail` 아래에서 돌린다.

set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMMON="${REPO_ROOT}/deploy/prod-release-common.sh"
[[ -f "${COMMON}" ]] || { echo "deploy/prod-release-common.sh 가 없습니다" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

# sudo 와 docker 를 가짜로 세운다. docker images 는 DOCKER_IMAGES_OUTPUT 을 그대로
# 내보내고, docker rmi 는 지운 태그를 RMI_LOG 에 기록한다.
mkdir -p "${WORK}/bin"
printf '#!/bin/sh\nexec "$@"\n' > "${WORK}/bin/sudo"
cat > "${WORK}/bin/docker" <<'FAKE_DOCKER'
#!/bin/sh
case "$1" in
  images) printf '%s' "${DOCKER_IMAGES_OUTPUT}" ;;
  rmi)    shift; printf '%s\n' "$@" >> "${RMI_LOG}" ;;
  *)      echo "unexpected docker invocation: $*" >&2; exit 64 ;;
esac
FAKE_DOCKER
chmod +x "${WORK}/bin/sudo" "${WORK}/bin/docker"
export PATH="${WORK}/bin:${PATH}"
export RMI_LOG="${WORK}/rmi.log"

failures=0

# 함수를 실제 원격 스크립트와 같은 셸 옵션 아래에서 호출한다.
run_prune() {
  export DOCKER_IMAGES_OUTPUT="$1"
  : > "${RMI_LOG}"
  bash -c '
    set -euo pipefail
    . "$1"
    prune_stale_release_tags teameet-v1-api 5
  ' _ "${COMMON}"
}

expect_ok() {
  local label="$1" images="$2" rc=0
  run_prune "${images}" >/dev/null 2>&1 || rc=$?
  if [[ "${rc}" -eq 0 ]]; then
    echo "  ok    ${label}"
  else
    echo "  FAIL  ${label} — 함수가 exit ${rc} 로 끝났습니다. 프로덕션이었다면 배포가 중단됩니다." >&2
    failures=$((failures + 1))
  fi
}

expect_dropped() {
  local label="$1" images="$2" want="$3" rc=0
  run_prune "${images}" >/dev/null 2>&1 || rc=$?
  local got
  got="$(sort "${RMI_LOG}" | tr '\n' ' ' | sed 's/ $//')"
  if [[ "${rc}" -eq 0 && "${got}" == "${want}" ]]; then
    echo "  ok    ${label}"
  else
    echo "  FAIL  ${label} — exit=${rc}, 삭제=[${got}], 기대=[${want}]" >&2
    failures=$((failures + 1))
  fi
}

echo "prune_stale_release_tags (set -euo pipefail 하에서):"

# 이 두 케이스가 2026-08-01 프로덕션 배포를 막았다. grep -v 는 출력이 없으면 exit 1 이다.
expect_ok "이미지가 하나도 없을 때" ""
expect_ok ":latest 만 있을 때" "2026-07-27 09:24:49 +0900 KST|teameet-v1-api:latest
"

# keep 이하라 지울 게 없는 경우도 성공해야 한다.
expect_dropped "keep 이하 — 아무것도 안 지움" \
"2026-07-30 10:00:00 +0900 KST|teameet-v1-api:aaa1
2026-07-29 10:00:00 +0900 KST|teameet-v1-api:bbb2
2026-07-27 09:24:49 +0900 KST|teameet-v1-api:latest
" ""

# keep 초과분만, 오래된 것부터 지운다. :latest 는 아무리 오래돼도 남는다.
expect_dropped "keep 초과 — 오래된 것만 지우고 :latest 는 보존" \
"2026-07-31 10:00:00 +0900 KST|teameet-v1-api:new1
2026-07-30 10:00:00 +0900 KST|teameet-v1-api:new2
2026-07-29 10:00:00 +0900 KST|teameet-v1-api:new3
2026-07-28 10:00:00 +0900 KST|teameet-v1-api:new4
2026-07-27 10:00:00 +0900 KST|teameet-v1-api:new5
2026-07-26 10:00:00 +0900 KST|teameet-v1-api:old6
2026-07-25 10:00:00 +0900 KST|teameet-v1-api:old7
2026-01-01 00:00:00 +0900 KST|teameet-v1-api:latest
" "teameet-v1-api:old6 teameet-v1-api:old7"

if [[ "${failures}" -gt 0 ]]; then
  echo "${failures}건 실패" >&2
  exit 1
fi
echo "전부 통과."

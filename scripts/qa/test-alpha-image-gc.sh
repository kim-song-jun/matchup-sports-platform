#!/usr/bin/env bash
#
# deploy/alpha-release-common.sh 의 prune_stale_alpha_images() 와, deploy/deploy-alpha.sh
# 안에서 그 함수가 호출되는 위치를 검증한다.
#
# 왜 필요한가: alpha EC2 는 ECR 에서 digest 로 이미지를 pull 해(태그 없이 저장됨) 배포를
# 거듭할수록 dangling 이미지가 쌓였고, 정리 스텝이 없어 실제로 디스크가 28G/30G 까지 차서
# 배포와 (재-pull 에 의존하는) 롤백이 함께 실패했다(2026-08). 이 함수는 그 재발을 막는
# 유일한 방어선이라, "무엇이 지워지고 무엇이 살아남는가"를 실제 인자·시나리오로 고정한다.
#
# 검증 범위:
#   1. 정확히 `docker image prune -f` 만 호출한다(`-a` 아님) — 인자가 바뀌면 이 테스트가
#      먼저 깨진다.
#   2. docker 가 실패하면 함수도 실패를 그대로 전파한다 — 호출부(deploy-alpha.sh)가 그걸
#      논-fatal 로 감싸는 책임을 지도록.
#   3. 실제 사고 시나리오를 흉내낸 가짜 docker 로 "어떤 이미지가 지워지고 어떤 게
#      살아남는가"를 검증한다: 컨테이너가 물고 있는 active 이미지(dangling 필터엔 걸리지만
#      실제로는 안 지워짐) / 참조가 끊긴 previous 릴리스 이미지(지워짐) / 태그가 붙어
#      dangling 자체가 아닌 legacy 이미지(안 지워짐).
#   4. deploy-alpha.sh 안에서 prune_stale_alpha_images 호출이 assert_running_release_digests
#      (healthy 확인)보다 뒤에 오는지 — 정적 라인 순서로 확인한다(실제 EC2 없이 전체
#      오케스트레이션을 실행할 수 없어서, 실행 대신 순서를 고정한다).
#
# 검증 못 하는 것(명시): 실제 docker 데몬의 dangling 판정 로직 자체, EC2 상의 실제 디스크
# 회수량. 그건 실제 EC2 리허설이 필요하다.

set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_SCRIPT="${REPO_ROOT}/deploy/deploy-alpha.sh"
[[ -f "${DEPLOY_SCRIPT}" ]] || { echo "deploy/deploy-alpha.sh 가 없습니다" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

failures=0
fail() {
  echo "  FAIL  $1" >&2
  failures=$((failures + 1))
}

echo "prune_stale_alpha_images():"

# ── ① 정확한 인자로만 호출하는가 ────────────────────────────────────────────
export ALPHA_HOME_DIR="${WORK}/home-1"
export ALPHA_LIVE_DIR="${ALPHA_HOME_DIR}/teameet"
mkdir -p "${ALPHA_HOME_DIR}"
CALL_LOG="${WORK}/calls-1.log"
export CALL_LOG
docker() { printf '%s\n' "$*" >> "${CALL_LOG}"; return 0; }
export -f docker
(
  source "${REPO_ROOT}/deploy/alpha-release-common.sh"
  prune_stale_alpha_images
)
if [[ "$(cat "${CALL_LOG}")" == "image prune -f" ]]; then
  echo "  ok    정확히 'docker image prune -f' 만 호출"
else
  fail "호출 인자가 다르다 — 실제: $(cat "${CALL_LOG}")"
fi
unset -f docker

# ── ② docker 실패가 함수 실패로 전파되는가 ──────────────────────────────────
docker() { return 1; }
export -f docker
if (
  source "${REPO_ROOT}/deploy/alpha-release-common.sh"
  prune_stale_alpha_images
); then
  fail "docker 실패인데 함수가 성공(exit 0)으로 보고했다"
else
  echo "  ok    docker 실패를 함수가 그대로 전파(호출부가 논-fatal 처리할 몫)"
fi
unset -f docker

echo
echo "실제 사고 시나리오(가짜 docker 로 삭제 대상 시뮬레이션):"

# ── ③ 무엇이 지워지고 무엇이 살아남는가 ────────────────────────────────────
# 2026-08-09 alpha 호스트 실측 그대로: dangling 필터엔 4개(active 2 + previous 2)가
# 걸리지만, 실제 prune 삭제 로직은 컨테이너 참조를 스킵하므로 previous 2개만 지워진다.
# 태그 붙은 legacy 이미지 4개는 애초에 dangling 이 아니라 prune -f 의 대상이 아니다.
WORLD="${WORK}/world.txt"
cat > "${WORLD}" <<'IMAGES'
active_api|dangling|referenced
active_web|dangling|referenced
previous_api|dangling|unreferenced
previous_web|dangling|unreferenced
legacy_web_1|tagged|unreferenced
legacy_web_2|tagged|unreferenced
legacy_api_1|tagged|unreferenced
legacy_api_2|tagged|unreferenced
IMAGES
REMOVED_LOG="${WORK}/removed.log"
export WORLD REMOVED_LOG
docker() {
  if [[ "$1" == image && "$2" == prune && "$3" == -f ]]; then
    # 실제 docker 의 실제 삭제 로직 근사: dangling(태그 없음) 이면서 컨테이너 미참조인
    # 것만 지운다. -a 였다면 tagged&unreferenced 도 지워야 하지만, 우리가 실제로
    # 넘기는 인자는 -f 뿐이므로 이 분기는 존재하지 않는다(①에서 이미 확인).
    while IFS='|' read -r name tag_state ref_state; do
      [[ "${tag_state}" == dangling && "${ref_state}" == unreferenced ]] || continue
      printf '%s\n' "${name}" >> "${REMOVED_LOG}"
    done < "${WORLD}"
    return 0
  fi
  echo "예상 못한 docker 호출: $*" >&2
  return 99
}
export -f docker
(
  source "${REPO_ROOT}/deploy/alpha-release-common.sh"
  prune_stale_alpha_images
)
unset -f docker

removed="$(sort "${REMOVED_LOG}" 2>/dev/null | tr '\n' ',')"
expected="previous_api,previous_web,"
if [[ "${removed}" == "${expected}" ]]; then
  echo "  ok    지워짐: previous_api, previous_web"
else
  fail "삭제 대상이 다르다 — 기대: ${expected} / 실제: ${removed}"
fi
survivors_ok=true
for survivor in active_api active_web legacy_web_1 legacy_web_2 legacy_api_1 legacy_api_2; do
  if grep -qx "${survivor}" "${REMOVED_LOG}" 2>/dev/null; then
    fail "${survivor} 가 지워지면 안 되는데 지워졌다"
    survivors_ok=false
  fi
done
if [[ "${survivors_ok}" == true ]]; then
  echo "  ok    생존: active_api, active_web (컨테이너 참조로 보호)"
  echo "  ok    생존: legacy_web_1, legacy_web_2, legacy_api_1, legacy_api_2 (태그 있어 dangling 아님)"
fi

echo
echo "deploy-alpha.sh 안에서의 호출 순서:"

# ── ④ prune 호출이 healthy 확인(assert_running_release_digests) 뒤에 오는가 ──
# 실제 호출문만 앵커링한다 — 호출부 위의 설명 주석("근거·안전성 판단은
# prune_stale_alpha_images() 정의부..." 등)도 함수 이름을 언급하므로, 느슨한 grep 은 주석
# 줄을 "호출 위치"로 오인해 실제 순서가 뒤집혀도 통과시킬 수 있다(Copilot 리뷰 지적).
health_line="$(grep -n '^assert_running_release_digests$' "${DEPLOY_SCRIPT}" | head -n1 | cut -d: -f1)"
prune_line="$(grep -nE '^\s*(if\s+!\s+)?prune_stale_alpha_images\b' "${DEPLOY_SCRIPT}" | head -n1 | cut -d: -f1)"
if [[ -z "${health_line}" ]]; then
  fail "deploy-alpha.sh 에서 assert_running_release_digests 호출을 찾지 못했다"
elif [[ -z "${prune_line}" ]]; then
  fail "deploy-alpha.sh 가 prune_stale_alpha_images 를 호출하지 않는다"
elif (( prune_line > health_line )); then
  echo "  ok    prune_stale_alpha_images 호출(${prune_line}번째 줄)이 assert_running_release_digests(${health_line}번째 줄) 뒤에 온다"
else
  fail "prune_stale_alpha_images(${prune_line}번째 줄)가 assert_running_release_digests(${health_line}번째 줄)보다 앞서 있다 — healthy 확인 전에 정리가 돌면 안 된다"
fi

# ── ⑤ prune 실패가 배포를 실패시키지 않는가(논-fatal 로 감싸져 있는가) ──────
if grep -qE 'if ! prune_stale_alpha_images.*(then|$)' "${DEPLOY_SCRIPT}" &&
  grep -qE '^\s*echo\s+"\[alpha-deploy\] WARNING: docker image prune failed' "${DEPLOY_SCRIPT}"; then
  echo "  ok    prune_stale_alpha_images 호출부가 실패를 WARNING 으로만 처리한다(논-fatal)"
else
  fail "prune_stale_alpha_images 호출이 논-fatal 로 감싸져 있지 않다"
fi

if [[ "${failures}" -gt 0 ]]; then
  echo
  echo "${failures}건 실패" >&2
  exit 1
fi
echo
echo "[alpha-image-gc] passed"

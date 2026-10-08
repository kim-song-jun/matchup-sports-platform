#!/usr/bin/env bash
# deploy-prod.sh 일반 배포 분기의 migrate 이후 단계 계약:
# migrate -> award 백필 -> 순위 재계산 순서로 각 1회, 어느 단계든 실패하면 뒤 단계 없이 중단(ERR trap 경로).
# 실제 스크립트의 해당 구간을 앵커로 잘라 스텁 compose 로 실행한다.
set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly DEPLOY_PROD="${ROOT_DIR}/deploy/deploy-prod.sh"
readonly TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

start="$(grep -n "^  'cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy'\$" "${DEPLOY_PROD}" | head -1 | cut -d: -f1)"
end="$(awk -v s="${start}" 'NR>s && /^fi$/ {print NR; exit}' "${DEPLOY_PROD}")"
[[ -n "${start}" && -n "${end}" ]] || { echo "FAILED: anchors not found" >&2; exit 1; }
# migrate 호출의 첫 줄(compose run ...)부터 분기 닫는 fi 직전까지.
sed -n "$((start - 1)),$((end - 1))p" "${DEPLOY_PROD}" > "${TEST_ROOT}/segment.sh"

failures=0
run_segment() {
  local fail_on="$1" log="${TEST_ROOT}/calls.log" rc=0
  : > "${log}"
  FAIL_ON="${fail_on}" LOG="${log}" bash -Eeuo pipefail -c '
    compose_mock() {
      case "$*" in
        *prisma*migrate*) echo migrate >> "$LOG" ;;
        *award-recipient-backfill*) echo award >> "$LOG" ;;
        *standings-recalculation*) echo recalc >> "$LOG" ;;
        *) echo "unexpected: $*" >> "$LOG" ;;
      esac
      [[ "$(tail -n1 "$LOG")" != "$FAIL_ON" ]]
    }
    compose=(compose_mock)
    source "$1"
  ' _ "${TEST_ROOT}/segment.sh" >/dev/null 2>&1 || rc=$?
  RC="${rc}" CALLS="$(paste -sd, "${log}")"
}
check() {
  local label="$1" want_calls="$2" want_fail="$3"
  local rc_ok=0
  if [[ "${want_fail}" == 1 ]]; then [[ "${RC}" -ne 0 ]] && rc_ok=1; else [[ "${RC}" -eq 0 ]] && rc_ok=1; fi
  if [[ "${CALLS}" == "${want_calls}" && "${rc_ok}" == 1 ]]; then
    echo "ok: ${label}"
  else
    echo "FAILED: ${label} (calls=${CALLS} rc=${RC})" >&2; failures=$((failures + 1))
  fi
}

run_segment none;   check "정상: migrate,award,recalc 순서 각 1회" "migrate,award,recalc" 0
run_segment recalc; check "recalc 실패: 배포 실패(rc!=0)" "migrate,award,recalc" 1
run_segment award;  check "award 실패: recalc 로 넘어가지 않음" "migrate,award" 1

[[ "${failures}" -eq 0 ]]

#!/usr/bin/env bash

# assert-prod-internal-api-origin.sh 의 판정 계약 테스트.
#
# 웹 이미지에 구워진 서버측 API origin 과 호스트 .env 값이 다르면 activation 전에 멈춰야 하고,
# 호스트에 값이 없으면(compose 기본값이 같은 상수) 통과해야 한다. SSM 조회 실패를 통과로
# 읽으면 안 된다(예전 build-images 조회는 실패 시 기본값으로 떨어졌지만, 대조는 fail-closed).
# 실제 AWS 는 부르지 않는다 — PATH 앞에 가짜 `aws` 를 놓는다.

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${ROOT}/scripts/release/assert-prod-internal-api-origin.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
mkdir -p "${WORK}/bin"

cat > "${WORK}/bin/aws" <<'EOF'
#!/usr/bin/env bash
case "$1 $2" in
  "ssm send-command") echo "cmd-0001" ;;
  "ssm get-command-invocation")
    args="$*"
    case "${args}" in
      *"--query Status"*) echo "${FAKE_SSM_STATUS:-Success}" ;;
      *"--query StandardOutputContent"*) jq -Rn --arg v "${FAKE_HOST_OUTPUT-}" '$v' ;;
      *) echo '{}' ;;
    esac
    ;;
  *) echo "unexpected aws call: $*" >&2; exit 99 ;;
esac
EOF
chmod +x "${WORK}/bin/aws"

FAILURES=0
EXPECTED=http://v1_api:8121

# usage: run_case <label> <expected rc> <ENV=VALUE ...>
run_case() {
  local label="$1" expected="$2" rc=0
  shift 2
  env -i PATH="${WORK}/bin:${PATH}" INSTANCE_ID=i-0123456789abcdef0 \
    EXPECTED_INTERNAL_API_ORIGIN="${EXPECTED}" "$@" bash "${SCRIPT}" >"${WORK}/out" 2>&1 || rc=$?
  if [[ "${rc}" -ne "${expected}" ]]; then
    echo "FAIL ${label}: expected rc ${expected}, got ${rc}"
    cat "${WORK}/out"
    FAILURES=$((FAILURES + 1))
    return
  fi
  echo "ok   ${label}"
}

run_case "host has no override" 0 FAKE_HOST_OUTPUT=
run_case "host override equals the baked value" 0 "FAKE_HOST_OUTPUT=${EXPECTED}"
run_case "trailing newline and CR are ignored" 0 "FAKE_HOST_OUTPUT=${EXPECTED}"$'\r\n'
run_case "host override differs from the baked value" 1 FAKE_HOST_OUTPUT=http://elsewhere:9000
grep -q 'http://elsewhere:9000' "${WORK}/out" ||
  { echo "FAIL mismatch message must name the host value"; FAILURES=$((FAILURES + 1)); }
run_case "SSM read failure is not treated as no override" 1 FAKE_SSM_STATUS=Failed FAKE_HOST_OUTPUT=
run_case "invalid instance id is rejected" 1 INSTANCE_ID=nope FAKE_HOST_OUTPUT=
run_case "missing expected origin is rejected" 1 EXPECTED_INTERNAL_API_ORIGIN= FAKE_HOST_OUTPUT=

if (( FAILURES > 0 )); then
  echo "[assert-prod-internal-api-origin] FAILED: ${FAILURES} case(s)" >&2
  exit 1
fi
echo "[assert-prod-internal-api-origin] passed"

#!/usr/bin/env bash

# assert-prod-internal-api-origin.sh 의 판정 계약 테스트.
#
# 웹 이미지에 구워진 서버측 API origin 과 호스트 .env 값이 다르면 activation 전에 멈춰야 하고,
# 호스트에 값이 없으면(compose 기본값이 같은 상수) 통과해야 한다. 같은 키가 여러 번이면 마지막
# 값이 이긴다(dotenv). SSM 조회 실패·.env 부재를 통과로 읽으면 안 된다.
# 실제 AWS 는 부르지 않는다 — PATH 앞에 가짜 `aws` 를 놓되, send-command 로 보낸 원격 스크립트
# 를 그대로 로컬 sh 로 실행해(경로만 픽스처 파일로 치환) awk 판정까지 실제로 시험한다.

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${ROOT}/scripts/release/assert-prod-internal-api-origin.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
mkdir -p "${WORK}/bin"

cat > "${WORK}/bin/aws" <<'EOF'
#!/usr/bin/env bash
case "$1 $2" in
  "ssm send-command")
    params=""
    while [[ $# -gt 0 ]]; do
      [[ "$1" == "--parameters" ]] && params="$2"
      shift
    done
    jq -r '.commands[0]' <<< "${params}" |
      sed "s#/home/ec2-user/.teameet-prod-runtime/.env#${FAKE_ENV_FILE}#g" > "${FAKE_DIR}/remote.sh"
    rc=0
    sh "${FAKE_DIR}/remote.sh" > "${FAKE_DIR}/remote.out" 2> "${FAKE_DIR}/remote.err" || rc=$?
    echo "${rc}" > "${FAKE_DIR}/remote.rc"
    echo "cmd-0001"
    ;;
  "ssm get-command-invocation")
    args="$*"
    case "${args}" in
      *"--query Status"*)
        if [[ -n "${FAKE_SSM_STATUS:-}" ]]; then echo "${FAKE_SSM_STATUS}"
        elif [[ "$(cat "${FAKE_DIR}/remote.rc")" == 0 ]]; then echo Success
        else echo Failed; fi
        ;;
      *"--query StandardOutputContent"*) jq -Rs '.' < "${FAKE_DIR}/remote.out" ;;
      *) echo '{}' ;;
    esac
    ;;
  *) echo "unexpected aws call: $*" >&2; exit 99 ;;
esac
EOF
chmod +x "${WORK}/bin/aws"

FAILURES=0
EXPECTED=http://v1_api:8121
ENV_FIXTURE="${WORK}/runtime.env"

# usage: run_case <label> <expected rc> [ENV=VALUE ...]   (host .env content: ${ENV_FIXTURE}, absent if removed)
run_case() {
  local label="$1" expected="$2" rc=0
  shift 2
  env -i PATH="${WORK}/bin:${PATH}" INSTANCE_ID=i-0123456789abcdef0 \
    EXPECTED_INTERNAL_API_ORIGIN="${EXPECTED}" FAKE_DIR="${WORK}" FAKE_ENV_FILE="${ENV_FIXTURE}" \
    "$@" bash "${SCRIPT}" >"${WORK}/out" 2>&1 || rc=$?
  if [[ "${rc}" -ne "${expected}" ]]; then
    echo "FAIL ${label}: expected rc ${expected}, got ${rc}"
    cat "${WORK}/out"
    FAILURES=$((FAILURES + 1))
    return
  fi
  echo "ok   ${label}"
}

assert_output_contains() {
  local label="$1" needle="$2"
  grep -qF -- "${needle}" "${WORK}/out" ||
    { echo "FAIL ${label}: output lacks '${needle}'"; cat "${WORK}/out"; FAILURES=$((FAILURES + 1)); return; }
  echo "ok   ${label}"
}

printf 'DB_HOST=db\nLOG_LEVEL=info\n' > "${ENV_FIXTURE}"
run_case "host has no override" 0

printf 'DB_HOST=db\nV1_INTERNAL_API_ORIGIN=%s\n' "${EXPECTED}" > "${ENV_FIXTURE}"
run_case "host override equals the baked value" 0

printf 'V1_INTERNAL_API_ORIGIN=%s\r\n' "${EXPECTED}" > "${ENV_FIXTURE}"
run_case "CRLF line endings are ignored" 0

printf 'V1_INTERNAL_API_ORIGIN=\n' > "${ENV_FIXTURE}"
run_case "empty override counts as unset" 0

printf 'V1_INTERNAL_API_ORIGIN=http://elsewhere:9000\n' > "${ENV_FIXTURE}"
run_case "host override differs from the baked value" 1
assert_output_contains "mismatch message names the host value" 'http://elsewhere:9000'

printf 'V1_INTERNAL_API_ORIGIN=http://elsewhere:9000\nV1_INTERNAL_API_ORIGIN=%s\n' "${EXPECTED}" > "${ENV_FIXTURE}"
run_case "duplicate key: last value wins (matching)" 0

printf 'V1_INTERNAL_API_ORIGIN=%s\nV1_INTERNAL_API_ORIGIN=http://elsewhere:9000\n' "${EXPECTED}" > "${ENV_FIXTURE}"
run_case "duplicate key: last value wins (differing)" 1
assert_output_contains "duplicate-key mismatch names the last value" 'http://elsewhere:9000'

printf 'V1_INTERNAL_API_ORIGIN=http://elsewhere:9000\nV1_INTERNAL_API_ORIGIN=\n' > "${ENV_FIXTURE}"
run_case "duplicate key: later empty value clears the override" 0

rm -f "${ENV_FIXTURE}"
run_case "missing runtime .env fails closed" 1
assert_output_contains "missing .env message is explicit" '런타임 .env 가 없습니다'

printf 'V1_INTERNAL_API_ORIGIN=%s\n' "${EXPECTED}" > "${ENV_FIXTURE}"
run_case "SSM read failure is not treated as no override" 1 FAKE_SSM_STATUS=Failed
run_case "invalid instance id is rejected" 1 INSTANCE_ID=nope
run_case "missing expected origin is rejected" 1 EXPECTED_INTERNAL_API_ORIGIN=

if (( FAILURES > 0 )); then
  echo "[assert-prod-internal-api-origin] FAILED: ${FAILURES} case(s)" >&2
  exit 1
fi
echo "[assert-prod-internal-api-origin] passed"

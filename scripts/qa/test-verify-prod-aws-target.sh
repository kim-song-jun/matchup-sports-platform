#!/usr/bin/env bash

# verify-prod-registry-target.sh / verify-prod-aws-target.sh 의 범위 계약 테스트.
#
# 승인 전 build-images job 의 빌드 역할에는 ec2:DescribeInstances 가 없다. registry 스크립트가
# 그 호출을 하지 않아야 빌드가 막히지 않고, 전체 스크립트는 인스턴스 확인을 빼먹지 않아야
# 승인된 deploy/rollback job 의 대상 고정이 유지된다. 실제 AWS 는 부르지 않는다 — PATH 앞에
# 가짜 `aws` 를 놓고, 빌드 역할처럼 ec2 를 거부하는 모드를 둔다.

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REGISTRY_SCRIPT="${ROOT}/scripts/release/verify-prod-registry-target.sh"
FULL_SCRIPT="${ROOT}/scripts/release/verify-prod-aws-target.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
mkdir -p "${WORK}/bin"

cat > "${WORK}/bin/aws" <<'EOF'
#!/usr/bin/env bash
echo "$1 $2" >> "${FAKE_AWS_LOG}"
case "$1 $2" in
  "sts get-caller-identity") echo "${FAKE_ACCOUNT:-111111111111}" ;;
  "ec2 describe-instances")
    if [[ "${FAKE_DENY_EC2:-0}" == 1 ]]; then
      echo "An error occurred (UnauthorizedOperation) when calling the DescribeInstances operation" >&2
      exit 254
    fi
    printf '{"State":"%s","Name":"matchup-production","Environment":"production"}\n' "${FAKE_INSTANCE_STATE:-running}"
    ;;
  "ecr describe-repositories")
    printf '{"imageTagMutability":"%s","imageScanningConfiguration":{"scanOnPush":true}}\n' "${FAKE_TAG_MUTABILITY:-IMMUTABLE}"
    ;;
  *) echo "unexpected aws call: $*" >&2; exit 99 ;;
esac
EOF
chmod +x "${WORK}/bin/aws"

FAILURES=0
LOG="${WORK}/aws.log"

# usage: run_case <label> <expected rc: 0|nonzero> <script> <ENV=VALUE ...>
run_case() {
  local label="$1" expected="$2" script="$3" rc=0
  shift 3
  : > "${LOG}"
  env -i PATH="${WORK}/bin:${PATH}" FAKE_AWS_LOG="${LOG}" \
    PROD_AWS_REGION=ap-northeast-2 PROD_EXPECTED_ACCOUNT_ID=111111111111 \
    "$@" bash "${script}" >"${WORK}/out" 2>&1 || rc=$?
  case "${expected}" in
    0) [[ "${rc}" -eq 0 ]] || { echo "FAIL ${label}: expected rc 0, got ${rc}"; cat "${WORK}/out"; FAILURES=$((FAILURES + 1)); return; } ;;
    nonzero) [[ "${rc}" -ne 0 ]] || { echo "FAIL ${label}: expected failure, got rc 0"; FAILURES=$((FAILURES + 1)); return; } ;;
  esac
  echo "ok   ${label}"
}

assert_logged() {
  local label="$1" pattern="$2"
  grep -q "${pattern}" "${LOG}" || { echo "FAIL ${label}: '${pattern}' not called"; FAILURES=$((FAILURES + 1)); return; }
  echo "ok   ${label}"
}
assert_not_logged() {
  local label="$1" pattern="$2"
  if grep -q "${pattern}" "${LOG}"; then echo "FAIL ${label}: '${pattern}' was called"; FAILURES=$((FAILURES + 1)); return; fi
  echo "ok   ${label}"
}

INSTANCE=PROD_EC2_INSTANCE_ID=i-0123456789abcdef0

run_case "registry target passes without an instance id while ec2 is denied" 0 "${REGISTRY_SCRIPT}" FAKE_DENY_EC2=1
assert_not_logged "registry target never calls ec2" '^ec2 '
assert_logged "registry target checks the ECR repositories" '^ecr describe-repositories'
run_case "registry target rejects a mutable ECR repository" nonzero "${REGISTRY_SCRIPT}" FAKE_TAG_MUTABILITY=MUTABLE
run_case "registry target rejects the wrong account" nonzero "${REGISTRY_SCRIPT}" FAKE_ACCOUNT=222222222222

run_case "full target passes and checks the instance" 0 "${FULL_SCRIPT}" "${INSTANCE}"
assert_logged "full target calls ec2 describe-instances" '^ec2 describe-instances'
assert_logged "full target also checks the ECR repositories" '^ecr describe-repositories'
run_case "full target rejects a stopped instance" nonzero "${FULL_SCRIPT}" "${INSTANCE}" FAKE_INSTANCE_STATE=stopped
run_case "full target requires the instance id" nonzero "${FULL_SCRIPT}"
run_case "full target fails when ec2 is denied" nonzero "${FULL_SCRIPT}" "${INSTANCE}" FAKE_DENY_EC2=1
run_case "full target rejects the wrong account" nonzero "${FULL_SCRIPT}" "${INSTANCE}" FAKE_ACCOUNT=222222222222
run_case "full target rejects a mutable ECR repository" nonzero "${FULL_SCRIPT}" "${INSTANCE}" FAKE_TAG_MUTABILITY=MUTABLE

if (( FAILURES > 0 )); then
  echo "[verify-prod-aws-target] FAILED: ${FAILURES} case(s)" >&2
  exit 1
fi
echo "[verify-prod-aws-target] passed"

#!/usr/bin/env bash

# ECR 이미지 스캔 게이트의 계약 테스트.
#
# 실제 AWS 를 부르지 않는다 — PATH 앞에 가짜 `aws` 를 놓고 시나리오별 응답을 흉내 낸다.
# 검증하는 계약은 두 가지이고, 둘 다 실제로 라이브에서 터졌던 것이다.
#
# 1) 일시적 AWS CLI 내부 오류('NoneType' object does not support item assignment)는
#    배포를 죽이지 않고 재시도로 넘어가야 한다.
# 2) **스캔 결과를 못 읽으면 게이트가 통과해서는 안 된다.** 이전 구현은 빈 응답에서
#    critical="" 이 되고 bash 산술이 빈 값을 0 으로 취급해 조용히 통과했다(fail-open).

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="${ROOT}/scripts/release/check-alpha-image-scans.sh"
PASS=0
FAIL=0

make_fake_aws() {
  local mode="$1" dir
  dir="$(mktemp -d)"
  cat > "${dir}/aws" <<EOF
#!/usr/bin/env bash
mode="${mode}"
state_file="${dir}/state"
EOF
  cat >> "${dir}/aws" <<'EOF'
args="$*"

emit_status() { echo "COMPLETE"; }

case "${mode}" in
  clean)
    case "${args}" in
      *imageScanStatus.status*) emit_status; exit 0 ;;
      *wait*) exit 0 ;;
      *findingSeverityCounts*) echo '{}'; exit 0 ;;
    esac
    ;;
  critical)
    case "${args}" in
      *imageScanStatus.status*) emit_status; exit 0 ;;
      *wait*) exit 0 ;;
      *attributes*) echo '[{"name":"CVE-TEST","uri":"https://example.invalid/CVE-TEST","attributes":[{"key":"package_name","value":"tar"},{"key":"package_version","value":"7.5.11"}]}]'; exit 0 ;;
      *findingSeverityCounts*) echo '{"CRITICAL":2,"HIGH":7}'; exit 0 ;;
    esac
    ;;
  empty_findings)
    # 라이브에서 관측된 모양: 스캔은 COMPLETE 이고 describe 도 exit 0 인데 findings 가 빈 출력.
    # AWS CLI 는 --query 결과가 없을 때 이렇게 준다 = 취약점 0건. 통과해야 한다.
    case "${args}" in
      *imageScanStatus.status*) emit_status; exit 0 ;;
      *wait*) exit 0 ;;
      *findingSeverityCounts*) printf ''; exit 0 ;;
    esac
    ;;
  findings_always_crash)
    # 진짜 fail-open 회귀: 상태는 읽히는데 findings 조회가 재시도를 다 써도 계속 실패.
    # 예전 구현은 exit code 를 안 보고 빈 문자열을 0 으로 취급해 조용히 통과했다.
    case "${args}" in
      *imageScanStatus.status*) emit_status; exit 0 ;;
      *wait*) exit 0 ;;
      *findingSeverityCounts*)
        echo "aws: [ERROR]: 'NoneType' object does not support item assignment" >&2
        exit 1 ;;
    esac
    ;;
  incomplete)
    case "${args}" in
      *imageScanStatus.status*) echo "IN_PROGRESS"; exit 0 ;;
      *wait*) exit 0 ;;
      *findingSeverityCounts*) echo '{}'; exit 0 ;;
    esac
    ;;
  transient_then_ok)
    # 첫 findings 조회만 CLI 내부 크래시, 이후 정상.
    case "${args}" in
      *imageScanStatus.status*) emit_status; exit 0 ;;
      *wait*) exit 0 ;;
      *findingSeverityCounts*)
        if [[ ! -f "${state_file}" ]]; then
          touch "${state_file}"
          echo "aws: [ERROR]: 'NoneType' object does not support item assignment" >&2
          exit 1
        fi
        echo '{}'; exit 0 ;;
    esac
    ;;
  denied)
    case "${args}" in
      *) echo "AccessDeniedException: not authorized" >&2; exit 1 ;;
    esac
    ;;
esac
exit 0
EOF
  chmod +x "${dir}/aws"
  echo "${dir}"
}

run_case() {
  local name="$1" mode="$2" expected="$3" dir rc
  dir="$(make_fake_aws "${mode}")"
  set +e
  PATH="${dir}:${PATH}" IMAGE_TAG="sha-test" SCAN_TRANSIENT_SLEEP_SECONDS=0 \
    bash "${GATE}" >/dev/null 2>&1
  rc=$?
  set -e
  rm -rf "${dir}"
  if [[ "${expected}" == "pass" && "${rc}" -eq 0 ]] || [[ "${expected}" == "fail" && "${rc}" -ne 0 ]]; then
    echo "  ok   ${name} (expected ${expected}, exit ${rc})"
    PASS=$((PASS + 1))
  else
    echo "  FAIL ${name} (expected ${expected}, exit ${rc})"
    FAIL=$((FAIL + 1))
  fi
}

echo "[image-scan-gate] contract"
run_case "취약점 0건이면 통과한다"                        clean            pass
run_case "CRITICAL 이 있으면 막는다"                       critical         fail
run_case "COMPLETE + 빈 findings 는 0건으로 통과한다"      empty_findings   pass
run_case "findings 조회가 계속 실패하면 막는다 (fail-open 방지)" findings_always_crash fail
run_case "스캔이 COMPLETE 가 아니면 막는다"                incomplete       fail
run_case "일시적 CLI 내부 오류는 재시도로 넘어간다"        transient_then_ok pass
run_case "권한 오류는 재시도하지 않고 막는다"              denied           fail

echo "[image-scan-gate] ${PASS} passed, ${FAIL} failed"
[[ "${FAIL}" -eq 0 ]]

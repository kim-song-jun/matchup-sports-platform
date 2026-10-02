#!/usr/bin/env bash

# ECR 이미지 스캔 게이트 공통 로직. alpha/prod 스크립트가 이걸 source 해서 쓴다.
#
# 두 스크립트는 저장소 이름과 로그 라벨 3줄만 빼고 완전히 같은 파일이었고, 그 중복 때문에
# 아래 두 결함이 **양쪽에 똑같이** 존재했다.
#
# 1) 일시적 AWS CLI 내부 오류가 배포를 죽였다.
#    관측된 오류: `aws: [ERROR]: 'NoneType' object does not support item assignment`
#    스캔 결과가 아니라 CLI 자체의 크래시인데 재시도가 없어 그대로 게이트 실패 → 배포 실패.
#    2026-08-08~09 alpha 에서만 3회 발생, 매번 사람이 재실행해야 했다.
#
# 2) **스캔 결과를 못 읽으면 게이트가 조용히 통과했다(fail-open).**
#    `findings` 가 비면 `critical=""` 이 되고 bash 산술에서 빈 값은 0 이라
#    `(( critical == 0 ))` 이 참이 된다. 실제 로그에 그 흔적이 남아 있다:
#      `[alpha-scan] teameet-alpha-v1-api critical= high=`
#    보안 게이트가 "확인 못 했음" 을 "문제 없음" 으로 보고한 것이다.
#
# 그래서 여기서는 **스캔 상태가 명시적으로 COMPLETE 일 때만** 카운트를 해석하고, 그 외에는
# 전부 fail-closed 로 막는다. 취약점이 0건인 정상 스캔은 `findingSeverityCounts` 가 `{}` 나
# `null` 로 오는 것이 정상이므로 그건 0 으로 해석한다 — "카운트가 비었다" 와 "스캔을 못 읽었다"
# 를 상태로 구분하는 것이 이 설계의 핵심이다.

readonly SCAN_TRANSIENT_ATTEMPTS="${SCAN_TRANSIENT_ATTEMPTS:-5}"
readonly SCAN_TRANSIENT_SLEEP_SECONDS="${SCAN_TRANSIENT_SLEEP_SECONDS:-5}"

# AWS CLI 의 일시적 내부 오류인가. 스캔 결과에 대한 판단이 아니라 도구 상태에 대한 판단이므로
# 여기 나열된 것만 재시도하고, 그 밖의 오류(권한·리포지토리 없음 등)는 즉시 올린다.
scan_error_is_transient() {
  local message="$1"
  [[ "${message}" == *"NoneType"*"item assignment"* ]] ||
    [[ "${message}" == *"Could not connect to the endpoint"* ]] ||
    [[ "${message}" == *"ThrottlingException"* ]] ||
    [[ "${message}" == *"RequestTimeout"* ]] ||
    [[ "${message}" == *"ServiceUnavailable"* ]] ||
    [[ "${message}" == *"InternalServerError"* ]]
}

# 일시 오류만 재시도하며 aws 를 실행한다. 성공 시 stdout 을 그대로 넘긴다.
scan_aws_retry() {
  local attempt output
  for attempt in $(seq 1 "${SCAN_TRANSIENT_ATTEMPTS}"); do
    if output="$("$@" 2>&1)"; then
      printf '%s' "${output}"
      return 0
    fi
    if ! scan_error_is_transient "${output}"; then
      printf '%s\n' "${output}" >&2
      return 1
    fi
    echo "[image-scan] transient AWS error (attempt ${attempt}/${SCAN_TRANSIENT_ATTEMPTS}): ${output}" >&2
    sleep "${SCAN_TRANSIENT_SLEEP_SECONDS}"
  done
  echo "[image-scan] AWS kept failing transiently after ${SCAN_TRANSIENT_ATTEMPTS} attempts" >&2
  return 1
}

# ECR 은 방금 push 한 digest 의 스캔을 즉시 등록하지 않는다. wait 서브커맨드의
# ScanNotFoundException acceptor 는 재시도 없이 바로 실패하므로, 등록될 때까지 먼저 폴링한다.
wait_for_scan_registration() {
  local repository="$1" attempt error
  for attempt in $(seq 1 12); do
    if error="$(aws ecr describe-image-scan-findings --repository-name "${repository}" \
      --image-id "imageTag=${IMAGE_TAG}" --query 'imageScanStatus.status' --output text 2>&1)"; then
      return 0
    fi
    if [[ "${error}" == *ScanNotFoundException* ]] || scan_error_is_transient "${error}"; then
      sleep 5
      continue
    fi
    echo "${error}" >&2
    return 1
  done
  echo "Image scan for ${repository}:${IMAGE_TAG} did not register within 60s" >&2
  return 1
}

# 저장소들의 스캔 결과를 확인하고 CRITICAL 이 하나라도 있으면 실패한다.
# 첫 인자는 로그 라벨(alpha-scan/prod-scan), 나머지는 저장소 이름.
assert_no_critical_image_findings() {
  local label="$1"
  shift
  local repository status findings critical high critical_details

  for repository in "$@"; do
    wait_for_scan_registration "${repository}"
    scan_aws_retry aws ecr wait image-scan-complete \
      --repository-name "${repository}" --image-id "imageTag=${IMAGE_TAG}" >/dev/null

    # 스캔 상태를 먼저 확정한다. COMPLETE 가 아니면 카운트를 해석하지 않고 막는다 —
    # "확인 못 했음" 이 "문제 없음" 으로 새어나가지 않게 하는 지점이다.
    status="$(scan_aws_retry aws ecr describe-image-scan-findings \
      --repository-name "${repository}" --image-id "imageTag=${IMAGE_TAG}" \
      --query 'imageScanStatus.status' --output text)" || {
      echo "[${label}] ${repository}: could not read scan status — refusing to pass the gate" >&2
      return 1
    }
    if [[ "${status}" != "COMPLETE" ]]; then
      echo "[${label}] ${repository}: scan status is '${status:-<empty>}', not COMPLETE — refusing to pass the gate" >&2
      return 1
    fi

    findings="$(scan_aws_retry aws ecr describe-image-scan-findings \
      --repository-name "${repository}" --image-id "imageTag=${IMAGE_TAG}" \
      --query 'imageScanFindings.findingSeverityCounts' --output json)" || {
      echo "[${label}] ${repository}: could not read scan findings — refusing to pass the gate" >&2
      return 1
    }

    # 여기까지 왔다는 것은 ① describe 호출이 exit 0 이었고 ② 스캔 상태가 COMPLETE 라는 뜻이다.
    # 그 두 조건이 "스캔을 읽어냈다"의 증거다. 그 상태에서 findings 가 비어 있으면(`` / `null` / `{}`)
    # 그건 읽기 실패가 아니라 **취약점 0건**이다 — AWS CLI 는 --query 결과가 없을 때 빈 출력을 준다.
    # 게이트를 지키는 것은 emptiness 검사가 아니라 위의 exit-status·status 검사다. 원래의 fail-open 은
    # 호출이 **실패**했는데 exit code 를 안 보고 빈 문자열을 0 으로 취급한 것이었고, 그건 scan_aws_retry
    # 가 non-zero 를 반환하며 이미 막는다.
    if [[ -z "${findings//[[:space:]]/}" ]]; then
      findings='{}'
    fi

    critical="$(jq -r 'if . == null then 0 else (.CRITICAL // 0) end' <<< "${findings}")"
    high="$(jq -r 'if . == null then 0 else (.HIGH // 0) end' <<< "${findings}")"

    # 그래도 숫자가 아니면(응답이 예상 밖 모양) 산술에서 0 으로 뭉개지지 않게 명시적으로 막는다.
    if ! [[ "${critical}" =~ ^[0-9]+$ && "${high}" =~ ^[0-9]+$ ]]; then
      echo "[${label}] ${repository}: unparsable severity counts (critical='${critical}' high='${high}') — refusing to pass the gate" >&2
      return 1
    fi

    echo "[${label}] ${repository} critical=${critical} high=${high}"
    if (( critical != 0 )); then
      critical_details="$(scan_aws_retry aws ecr describe-image-scan-findings \
        --repository-name "${repository}" --image-id "imageTag=${IMAGE_TAG}" \
        --query "imageScanFindings.findings[?severity=='CRITICAL'].{name:name,uri:uri,attributes:attributes}" \
        --output json)" || {
        echo "[${label}] ${repository}: could not read Critical finding details; deployment remains blocked" >&2
        return 1
      }
      echo "[${label}] ${repository} critical-findings=$(jq -c '.' <<< "${critical_details}")" >&2
      echo "Critical ECR findings block ${label%-scan} deployment" >&2
      return 1
    fi
  done
}

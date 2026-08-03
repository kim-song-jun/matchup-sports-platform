#!/usr/bin/env bash

set -Eeuo pipefail
: "${IMAGE_TAG:?IMAGE_TAG is required}"

# ECR does not register a scan for a just-pushed digest instantaneously; the
# wait subcommand's ScanNotFoundException acceptor fails immediately instead
# of retrying, so poll for the scan to exist before handing off to it.
wait_for_scan_registration() {
  local repository="$1" attempt error
  for attempt in $(seq 1 12); do
    if error="$(aws ecr describe-image-scan-findings --repository-name "${repository}" \
      --image-id "imageTag=${IMAGE_TAG}" --query 'imageScanStatus.status' --output text 2>&1)"; then
      return 0
    fi
    [[ "${error}" == *ScanNotFoundException* ]] || { echo "${error}" >&2; return 1; }
    sleep 5
  done
  echo "Image scan for ${repository}:${IMAGE_TAG} did not register within 60s" >&2
  return 1
}

for repository in teameet-alpha-v1-api teameet-alpha-v1-web; do
  wait_for_scan_registration "${repository}"
  aws ecr wait image-scan-complete --repository-name "${repository}" \
    --image-id "imageTag=${IMAGE_TAG}"
  findings="$(aws ecr describe-image-scan-findings --repository-name "${repository}" \
    --image-id "imageTag=${IMAGE_TAG}" --query 'imageScanFindings.findingSeverityCounts' --output json)"
  critical="$(jq -r '.CRITICAL // 0' <<< "${findings}")"
  high="$(jq -r '.HIGH // 0' <<< "${findings}")"
  echo "[alpha-scan] ${repository} critical=${critical} high=${high}"
  (( critical == 0 )) || {
    echo "Critical ECR findings block alpha deployment" >&2
    exit 1
  }
done

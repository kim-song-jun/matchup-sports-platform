#!/usr/bin/env bash

set -Eeuo pipefail
: "${IMAGE_TAG:?IMAGE_TAG is required}"

for repository in teameet-alpha-v1-api teameet-alpha-v1-web; do
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

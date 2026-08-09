#!/usr/bin/env bash

set -Eeuo pipefail
: "${IMAGE_TAG:?IMAGE_TAG is required}"

# 공통 로직은 image-scan-common.sh 에 있다 — alpha/prod 가 3줄만 다른 복사본이었고 그 중복
# 때문에 재시도 부재와 fail-open 이 양쪽에 똑같이 존재했다. 자세한 내용은 그 파일의 헤더 참조.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/image-scan-common.sh"

assert_no_critical_image_findings prod-scan teameet-prod-v1-api teameet-prod-v1-web

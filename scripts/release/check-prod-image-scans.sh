#!/usr/bin/env bash

set -Eeuo pipefail
: "${IMAGE_TAG:?IMAGE_TAG is required}"

# 공통 로직은 image-scan-common.sh 에 있다 — alpha/prod 가 3줄만 다른 복사본이었고 그 중복
# 때문에 재시도 부재와 fail-open 이 양쪽에 똑같이 존재했다. 자세한 내용은 그 파일의 헤더 참조.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/image-scan-common.sh"

assert_no_critical_image_findings prod-scan teameet-prod-v1-api teameet-prod-v1-web

# Task 175 T5: Stage A additionally pushes a Task168 cutover-tool image to
# the SAME repository (teameet-prod-v1-api) under a different tag.
# IMAGE_TAG is a single global inside assert_no_critical_image_findings, so
# this is a second call with its own tag rather than complicating that
# function's repo-iteration signature. Unset/empty on ordinary deploys and
# Stage B (which reuses Stage A's already-scanned image) -- no extra scan.
if [[ -n "${TASK168_CUTOVER_IMAGE_TAG:-}" ]]; then
  IMAGE_TAG="${TASK168_CUTOVER_IMAGE_TAG}"
  assert_no_critical_image_findings prod-scan teameet-prod-v1-api
fi

#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${GITHUB_REF_NAME:-}" != "main" ]]; then
  echo "Production iOS artifacts may only be built from main. Selected ref: ${GITHUB_REF_NAME:-unset}" >&2
  exit 1
fi

#!/usr/bin/env bash
# Only the current dev commit may start a normal Alpha activation. Once SSM
# starts, deploy-alpha's non-cancelling concurrency group protects completion.
set -Eeuo pipefail

: "${RELEASE_SHA:?RELEASE_SHA is required}"
: "${REPOSITORY:?REPOSITORY is required}"
: "${TASK168_STAGE:?TASK168_STAGE is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"
[[ "${RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid RELEASE_SHA' >&2; exit 1; }
[[ "${REPOSITORY}" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo 'Invalid REPOSITORY' >&2; exit 1; }

case "${TASK168_STAGE}" in
  stageBFinal|stageBRecover)
    # Operator-pinned DB transitions retain their existing workflow gates.
    echo 'current=true' >> "${GITHUB_OUTPUT}"
    exit 0
    ;;
  final) ;;
  *) echo "Unknown TASK168_STAGE: ${TASK168_STAGE}" >&2; exit 1 ;;
esac

dev_sha="$(gh api "repos/${REPOSITORY}/git/ref/heads/dev" --jq '.object.sha')"
[[ "${dev_sha}" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid dev SHA from GitHub' >&2; exit 1; }
if [[ "${dev_sha}" == "${RELEASE_SHA}" ]]; then
  echo 'current=true' >> "${GITHUB_OUTPUT}"
else
  echo 'current=false' >> "${GITHUB_OUTPUT}"
  message="Skipped superseded Alpha release ${RELEASE_SHA}; current dev is ${dev_sha}. No server activation was started."
  echo "::notice::${message}"
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf '%s\n' "${message}" >> "${GITHUB_STEP_SUMMARY}"
  fi
fi

#!/usr/bin/env bash

set -Eeuo pipefail

# scripts/release/resolve-alpha-rollback-base.sh 를 prod 용으로 일반화한 것. alpha 는 SSM
# send-command 왕복으로 EC2 상태를 읽지만, prod 는 이미 워크플로에 SSH 관용구가 있으므로
# (D2 제약: SSM 전환은 범위 밖) 이 스크립트를 호출하기 전에 "Setup SSH" 스텝으로 `ssh ec2`
# alias 가 구성돼 있어야 한다.

: "${RELEASE_SHA:?RELEASE_SHA is required}"

state_output="$(ssh ec2 '
  set -Eeuo pipefail
  state=/home/ec2-user/.teameet-prod-releases/state.json
  legacy=/home/ec2-user/.teameet-prod-release
  canonical=none
  migration=none
  if [[ -f "${state}" ]]; then
    canonical=$(jq -er .active.release.sha "${state}")
    migration="${canonical}"
  elif [[ -f "${legacy}" ]]; then
    migration=$(awk -F= '"'"'$1 == "sha" { print $2 }'"'"' "${legacy}")
  fi
  printf "canonical=%s\nmigration=%s\n" "${canonical}" "${migration}"
')" || {
  echo "Unable to read canonical prod release state" >&2
  exit 1
}

previous_sha="$(awk -F= '$1 == "canonical" { print $2 }' <<< "${state_output}" | tr -d '[:space:]')"
migration_base_sha="$(awk -F= '$1 == "migration" { print $2 }' <<< "${state_output}" | tr -d '[:space:]')"
[[ "${previous_sha}" == none || "${previous_sha}" =~ ^[0-9a-f]{40}$ ]] || {
  echo "Canonical prod release state is missing or malformed" >&2
  exit 1
}
[[ "${migration_base_sha}" == none || "${migration_base_sha}" =~ ^[0-9a-f]{40}$ ]] || {
  echo "Prod migration base is missing or malformed" >&2
  exit 1
}

if [[ "${migration_base_sha}" != none ]]; then
  public_sha="$(curl -fsSI https://teameet.co.kr/landing |
    awk -F': ' 'tolower($1) == "x-teameet-commit" { gsub("\r", "", $2); print $2 }')"
  [[ "${public_sha}" == "${migration_base_sha}" ]] || {
    echo "Migration base and public prod release SHAs differ" >&2
    exit 1
  }
  if [[ "${migration_base_sha}" != "${RELEASE_SHA}" ]]; then
    bash scripts/qa/check-expand-contract-migrations.sh "${migration_base_sha}" "${RELEASE_SHA}"
  fi
fi
echo "previousSha=${previous_sha}" >> "${GITHUB_OUTPUT}"
echo "migrationBaseSha=${migration_base_sha}" >> "${GITHUB_OUTPUT}"

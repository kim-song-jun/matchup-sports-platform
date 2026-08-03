#!/usr/bin/env bash

set -Eeuo pipefail

# scripts/release/resolve-alpha-rollback-base.sh 를 prod 용으로 일반화한 것.
#
# 2026-08-02: SSH → SSM 전환(Phase C). 이 스크립트는 `ssh ec2` 로 EC2 상태를 읽고 있었는데,
# 같은 전환에서 워크플로의 "Setup SSH" 스텝이 제거되면서 alias 가 사라져 첫 프로덕션 배포가
# 여기서 죽었다("ssh: Could not resolve hostname ec2"). 워크플로만 훑고 그 워크플로가
# **호출하는 스크립트**를 빠뜨린 결과다 — alpha 와 동일하게 SSM 왕복으로 바꾼다.

need() {
  local name="$1"
  [[ -n "${!name:-}" ]] || { echo "[prod-rollback-base] ${name} is required" >&2; exit 1; }
}
for name in RELEASE_SHA INSTANCE_ID; do
  need "${name}"
done
[[ "${INSTANCE_ID}" =~ ^i-[0-9a-f]{17}$ ]] || {
  echo "[prod-rollback-base] INSTANCE_ID 형식이 올바르지 않습니다 (실제: '${INSTANCE_ID}')" >&2
  exit 1
}

parameters="$(jq -nc '{commands:["set -Eeuo pipefail","state=/home/ec2-user/.teameet-prod-releases/state.json; legacy=/home/ec2-user/.teameet-prod-release; canonical=none; migration=none; if [[ -f \"${state}\" ]]; then canonical=$(jq -er .active.release.sha \"${state}\"); migration=${canonical}; elif [[ -f \"${legacy}\" ]]; then migration=$(awk -F= '\''$1 == \"sha\" { print $2 }'\'' \"${legacy}\"); fi; printf '\''canonical=%s\\nmigration=%s\\n'\'' \"${canonical}\" \"${migration}\""]}')"
command_id="$(aws ssm send-command --instance-ids "${INSTANCE_ID}" \
  --document-name AWS-RunShellScript --comment "Read Teameet prod release state" \
  --parameters "${parameters}" --query 'Command.CommandId' --output text)"

state_output=''
resolved=false
for attempt in $(seq 1 30); do
  status="$(aws ssm get-command-invocation --command-id "${command_id}" \
    --instance-id "${INSTANCE_ID}" --query Status --output text 2>/dev/null || true)"
  case "${status}" in
    Success)
      state_output="$(aws ssm get-command-invocation --command-id "${command_id}" \
        --instance-id "${INSTANCE_ID}" --query StandardOutputContent --output text)"
      resolved=true
      break
      ;;
    Failed|TimedOut|Cancelled|Cancelling)
      echo "[prod-rollback-base] 프로덕션 릴리스 상태를 읽지 못했습니다 (${status})" >&2
      aws ssm get-command-invocation --command-id "${command_id}" --instance-id "${INSTANCE_ID}" \
        --query '{status:Status,stdout:StandardOutputContent,stderr:StandardErrorContent}' --output json >&2 || true
      exit 1
      ;;
  esac
  sleep 2
done
if [[ "${resolved}" != true ]]; then
  echo "[prod-rollback-base] 릴리스 상태 조회가 60초 안에 끝나지 않았습니다 (CommandId: ${command_id})" >&2
  exit 1
fi

previous_sha="$(awk -F= '$1 == "canonical" { print $2 }' <<< "${state_output}" | tr -d '[:space:]')"
migration_base_sha="$(awk -F= '$1 == "migration" { print $2 }' <<< "${state_output}" | tr -d '[:space:]')"
[[ "${previous_sha}" == none || "${previous_sha}" =~ ^[0-9a-f]{40}$ ]] || {
  echo "[prod-rollback-base] canonical 상태가 비어 있거나 형식이 잘못됐습니다 (실제: '${previous_sha}')" >&2
  exit 1
}
[[ "${migration_base_sha}" == none || "${migration_base_sha}" =~ ^[0-9a-f]{40}$ ]] || {
  echo "[prod-rollback-base] migration base 가 비어 있거나 형식이 잘못됐습니다 (실제: '${migration_base_sha}')" >&2
  exit 1
}

if [[ "${migration_base_sha}" != none ]]; then
  public_sha="$(curl -fsSI https://teameet.co.kr/landing |
    awk -F': ' 'tolower($1) == "x-teameet-commit" { gsub("\r", "", $2); print $2 }')"
  [[ "${public_sha}" == "${migration_base_sha}" ]] || {
    echo "[prod-rollback-base] migration base 와 퍼블릭 릴리스 SHA 가 다릅니다" >&2
    echo "[prod-rollback-base]   migration base: ${migration_base_sha}" >&2
    echo "[prod-rollback-base]   퍼블릭 응답:    ${public_sha:-없음}" >&2
    exit 1
  }
  if [[ "${migration_base_sha}" != "${RELEASE_SHA}" ]]; then
    bash scripts/qa/check-expand-contract-migrations.sh "${migration_base_sha}" "${RELEASE_SHA}"
  fi
fi
echo "previousSha=${previous_sha}" >> "${GITHUB_OUTPUT}"
echo "migrationBaseSha=${migration_base_sha}" >> "${GITHUB_OUTPUT}"

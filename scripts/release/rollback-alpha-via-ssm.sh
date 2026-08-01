#!/usr/bin/env bash

set -Eeuo pipefail
for name in EXPECTED_ACTIVE_SHA INSTANCE_ID ECR_REGISTRY AWS_REGION; do
  [[ -n "${!name:-}" ]] || { echo "${name} is required" >&2; exit 1; }
done
[[ "${EXPECTED_ACTIVE_SHA}" =~ ^[0-9a-f]{40}$ ]]
[[ "${AWS_REGION}" =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]]
[[ "${ECR_REGISTRY}" =~ ^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com$ ]]
[[ "${INSTANCE_ID}" =~ ^i-[0-9a-f]{17}$ ]]

parameters="$(jq -nc \
  --arg strict "set -Eeuo pipefail" \
  --arg rollback "sudo -u ec2-user -H env ALPHA_EXPECTED_ACTIVE_SHA='${EXPECTED_ACTIVE_SHA}' ALPHA_ECR_REGISTRY='${ECR_REGISTRY}' ALPHA_AWS_REGION='${AWS_REGION}' bash '/home/ec2-user/teameet/deploy/rollback-alpha.sh'" \
  '{commands:[$strict,$rollback]}')"
command_id="$(aws ssm send-command --instance-ids "${INSTANCE_ID}" \
  --document-name AWS-RunShellScript --comment "Teameet alpha rollback from ${EXPECTED_ACTIVE_SHA}" \
  --parameters "${parameters}" --query 'Command.CommandId' --output text)"
for attempt in $(seq 1 72); do
  status="$(aws ssm get-command-invocation --command-id "${command_id}" \
    --instance-id "${INSTANCE_ID}" --query Status --output text 2>/dev/null || true)"
  case "${status}" in
    Success)
      aws ssm get-command-invocation --command-id "${command_id}" --instance-id "${INSTANCE_ID}" \
        --query StandardOutputContent --output text
      exit 0
      ;;
    Failed|TimedOut|Cancelled|Cancelling)
      aws ssm get-command-invocation --command-id "${command_id}" --instance-id "${INSTANCE_ID}" \
        --query '{status:Status,stdout:StandardOutputContent,stderr:StandardErrorContent}' --output json
      exit 1
      ;;
  esac
  sleep 10
done
echo "Alpha rollback did not finish within 12 minutes" >&2
exit 1

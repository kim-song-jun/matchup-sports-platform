#!/usr/bin/env bash

set -Eeuo pipefail
for name in RELEASE_SHA RELEASE_VERSION DEPLOY_BUCKET EXPECTED_BUCKET_OWNER INSTANCE_ID \
  SOURCE_VERSION_ID SOURCE_SHA256 MANIFEST_VERSION_ID MANIFEST_SHA256 REGISTRY AWS_REGION; do
  [[ -n "${!name:-}" ]] || { echo "${name} is required" >&2; exit 1; }
done
[[ "${RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]]
[[ "${RELEASE_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+-alpha\.[0-9]{8}\.g[0-9a-f]{12}$ ]]
[[ "${AWS_REGION}" =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]]
[[ "${EXPECTED_BUCKET_OWNER}" =~ ^[0-9]{12}$ ]]
[[ "${INSTANCE_ID}" =~ ^i-[0-9a-f]{17}$ ]]
[[ "${DEPLOY_BUCKET}" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]
[[ "${SOURCE_SHA256}" =~ ^[0-9a-f]{64}$ ]]
[[ "${MANIFEST_SHA256}" =~ ^[0-9a-f]{64}$ ]]
[[ "${REGISTRY}" == "${EXPECTED_BUCKET_OWNER}.dkr.ecr.${AWS_REGION}.amazonaws.com" ]]
[[ "${SOURCE_VERSION_ID}" =~ ^[A-Za-z0-9._+=/-]{1,1024}$ ]]
[[ "${MANIFEST_VERSION_ID}" =~ ^[A-Za-z0-9._+=/-]{1,1024}$ ]]

stage="/home/ec2-user/.teameet-alpha-staging/${RELEASE_SHA}"
archive="/tmp/teameet-alpha-${RELEASE_SHA}.tar.gz"
manifest="/tmp/teameet-alpha-${RELEASE_SHA}.json"
parameters="$(jq -nc \
  --arg strict "set -Eeuo pipefail" \
  --arg cleanup "trap 'status=\$?; rm -f '${archive}' '${manifest}'; rm -rf '${stage}'; exit \${status}' EXIT" \
  --arg prepare "install -d -o ec2-user -g ec2-user '${stage}'" \
  --arg source "aws s3api get-object --bucket '${DEPLOY_BUCKET}' --key 'releases/${RELEASE_SHA}.tar.gz' --version-id '${SOURCE_VERSION_ID}' --expected-bucket-owner '${EXPECTED_BUCKET_OWNER}' '${archive}' >/dev/null" \
  --arg source_check "echo '${SOURCE_SHA256}  ${archive}' | sha256sum -c -" \
  --arg manifest_get "aws s3api get-object --bucket '${DEPLOY_BUCKET}' --key 'manifests/${RELEASE_SHA}.json' --version-id '${MANIFEST_VERSION_ID}' --expected-bucket-owner '${EXPECTED_BUCKET_OWNER}' '${manifest}' >/dev/null" \
  --arg manifest_check "echo '${MANIFEST_SHA256}  ${manifest}' | sha256sum -c -" \
  --arg extract "tar -xzf '${archive}' -C '${stage}' && chown -R ec2-user:ec2-user '${stage}' '${manifest}'" \
  --arg deploy "sudo -u ec2-user -H env ALPHA_SOURCE_DIR='${stage}' ALPHA_MANIFEST_FILE='${manifest}' ALPHA_MANIFEST_SHA256='${MANIFEST_SHA256}' ALPHA_SHA='${RELEASE_SHA}' ALPHA_RELEASE_VERSION='${RELEASE_VERSION}' ALPHA_ECR_REGISTRY='${REGISTRY}' ALPHA_AWS_REGION='${AWS_REGION}' ALPHA_SOURCE_BUCKET='${DEPLOY_BUCKET}' ALPHA_SOURCE_VERSION_ID='${SOURCE_VERSION_ID}' ALPHA_SOURCE_SHA256='${SOURCE_SHA256}' bash '${stage}/deploy/deploy-alpha.sh'" \
  '{commands:[$strict,$cleanup,$prepare,$source,$source_check,$manifest_get,$manifest_check,$extract,$deploy]}')"

command_id="$(aws ssm send-command --instance-ids "${INSTANCE_ID}" \
  --document-name AWS-RunShellScript --comment "Teameet alpha ${RELEASE_VERSION} ${RELEASE_SHA}" \
  --parameters "${parameters}" --query 'Command.CommandId' --output text)"
for attempt in $(seq 1 150); do
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
echo "Alpha deployment did not finish within 25 minutes" >&2
exit 1

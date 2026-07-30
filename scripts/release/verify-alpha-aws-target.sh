#!/usr/bin/env bash

set -Eeuo pipefail
: "${ALPHA_AWS_REGION:?ALPHA_AWS_REGION is required}"
: "${ALPHA_DEPLOY_BUCKET:?ALPHA_DEPLOY_BUCKET is required}"
: "${ALPHA_EC2_INSTANCE_ID:?ALPHA_EC2_INSTANCE_ID is required}"
: "${ALPHA_EXPECTED_ACCOUNT_ID:?ALPHA_EXPECTED_ACCOUNT_ID is required}"

account_id="$(aws sts get-caller-identity --query Account --output text)"
[[ "${account_id}" == "${ALPHA_EXPECTED_ACCOUNT_ID}" ]] || {
  echo "Authenticated AWS account is not the pinned alpha account" >&2
  exit 1
}
expected_bucket="teameet-alpha-deploy-${account_id}-${ALPHA_AWS_REGION}"
[[ "${ALPHA_DEPLOY_BUCKET}" == "${expected_bucket}" ]] || {
  echo "Alpha bucket identity mismatch" >&2
  exit 1
}
bucket_versioning_status="$(aws s3api get-bucket-versioning \
  --bucket "${ALPHA_DEPLOY_BUCKET}" \
  --expected-bucket-owner "${account_id}" \
  --query Status \
  --output text)"
[[ "${bucket_versioning_status}" == Enabled ]] || {
  echo "Alpha deploy bucket versioning is not enabled" >&2
  exit 1
}

instance_json="$(aws ec2 describe-instances --region "${ALPHA_AWS_REGION}" \
  --instance-ids "${ALPHA_EC2_INSTANCE_ID}" \
  --query 'Reservations[0].Instances[0].{State:State.Name,Name:Tags[?Key==`Name`]|[0].Value,Environment:Tags[?Key==`Environment`]|[0].Value,Branch:Tags[?Key==`Branch`]|[0].Value}' \
  --output json)"
jq -e '.State == "running" and .Name == "teameet-alpha-dev" and .Environment == "alpha" and .Branch == "dev"' \
  <<< "${instance_json}" >/dev/null

for repository in teameet-alpha-v1-api teameet-alpha-v1-web; do
  repository_json="$(aws ecr describe-repositories --region "${ALPHA_AWS_REGION}" \
    --repository-names "${repository}" --query 'repositories[0]' --output json)"
  jq -e '.imageTagMutability == "IMMUTABLE" and .imageScanningConfiguration.scanOnPush == true' \
    <<< "${repository_json}" >/dev/null
done

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "account_id=${account_id}" >> "${GITHUB_OUTPUT}"
fi
echo "[alpha-target] account=${account_id} instance=${ALPHA_EC2_INSTANCE_ID} verified"

#!/usr/bin/env bash

set -Eeuo pipefail
: "${PROD_AWS_REGION:?PROD_AWS_REGION is required}"
: "${PROD_EC2_INSTANCE_ID:?PROD_EC2_INSTANCE_ID is required}"
: "${PROD_EXPECTED_ACCOUNT_ID:?PROD_EXPECTED_ACCOUNT_ID is required}"

# scripts/release/verify-alpha-aws-target.sh 를 prod 용으로 일반화한 것. D2 로 S3 버킷/버전닝
# 체크는 필요 없다(해당 리소스 없음). EC2 인스턴스 identity 검증은 alpha 와 동일하게 유지
# 한다 — SSH known_hosts pinning 과는 별개 채널로, AWS 리소스 자체가 기대한 것인지 한 번
# 더 확인한다(R5: PROD_EC2_INSTANCE_ID 변수와 Environment=production 태그를 이번 변경에서
# 신설했다).

account_id="$(aws sts get-caller-identity --query Account --output text)"
[[ "${account_id}" == "${PROD_EXPECTED_ACCOUNT_ID}" ]] || {
  echo "Authenticated AWS account is not the pinned production account" >&2
  exit 1
}

instance_json="$(aws ec2 describe-instances --region "${PROD_AWS_REGION}" \
  --instance-ids "${PROD_EC2_INSTANCE_ID}" \
  --query 'Reservations[0].Instances[0].{State:State.Name,Name:Tags[?Key==`Name`]|[0].Value,Environment:Tags[?Key==`Environment`]|[0].Value}' \
  --output json)"
jq -e '.State == "running" and .Name == "matchup-production" and .Environment == "production"' \
  <<< "${instance_json}" >/dev/null

for repository in teameet-prod-v1-api teameet-prod-v1-web; do
  repository_json="$(aws ecr describe-repositories --region "${PROD_AWS_REGION}" \
    --repository-names "${repository}" --query 'repositories[0]' --output json)"
  jq -e '.imageTagMutability == "IMMUTABLE" and .imageScanningConfiguration.scanOnPush == true' \
    <<< "${repository_json}" >/dev/null
done

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "account_id=${account_id}" >> "${GITHUB_OUTPUT}"
fi
echo "[prod-target] account=${account_id} instance=${PROD_EC2_INSTANCE_ID} verified"

#!/usr/bin/env bash

set -Eeuo pipefail

# scripts/release/verify-alpha-aws-target.sh 를 prod 용으로 일반화한 것. D2 로 S3 버킷/버전닝
# 체크는 필요 없다(해당 리소스 없음). EC2 인스턴스 identity 검증은 alpha 와 동일하게 유지
# 한다 — SSH known_hosts pinning 과는 별개 채널로, AWS 리소스 자체가 기대한 것인지 한 번
# 더 확인한다(R5: PROD_EC2_INSTANCE_ID 변수와 Environment=production 태그를 이번 변경에서
# 신설했다).
#
# 승인된 deploy/rollback job 용 전체 확인이다. 계정·ECR 리포지토리 확인은
# verify-prod-registry-target.sh 로 나눠 승인 전 build-images job 이 빌드 역할로 따로 부른다 —
# 빌드 역할에는 ec2:DescribeInstances 가 없다.

: "${PROD_AWS_REGION:?PROD_AWS_REGION is required}"
: "${PROD_EC2_INSTANCE_ID:?PROD_EC2_INSTANCE_ID is required}"
: "${PROD_EXPECTED_ACCOUNT_ID:?PROD_EXPECTED_ACCOUNT_ID is required}"

bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/verify-prod-registry-target.sh"

instance_json="$(aws ec2 describe-instances --region "${PROD_AWS_REGION}" \
  --instance-ids "${PROD_EC2_INSTANCE_ID}" \
  --query 'Reservations[0].Instances[0].{State:State.Name,Name:Tags[?Key==`Name`]|[0].Value,Environment:Tags[?Key==`Environment`]|[0].Value}' \
  --output json)"
jq -e '.State == "running" and .Name == "matchup-production" and .Environment == "production"' \
  <<< "${instance_json}" >/dev/null

echo "[prod-target] instance=${PROD_EC2_INSTANCE_ID} verified"

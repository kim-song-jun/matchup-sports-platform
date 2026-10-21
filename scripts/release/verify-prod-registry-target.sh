#!/usr/bin/env bash

set -Eeuo pipefail

# 인증된 AWS 계정과 prod ECR 리포지토리가 기대한 것인지 확인한다. 승인 전 build-images job 이
# 빌드 역할로 쓰는 절반이다 — EC2 인스턴스 확인(ec2:DescribeInstances)은 서버 쪽 확인이라
# verify-prod-aws-target.sh 에 있고 승인된 deploy/rollback job 만 부른다. 이 파일에 ec2 호출을
# 넣지 않는다(scripts/qa/check-production-deploy-security.mjs 가 승인 전 job 이 부르는 스크립트
# 안의 ssm·kms·ec2 호출을 막는다).

: "${PROD_AWS_REGION:?PROD_AWS_REGION is required}"
: "${PROD_EXPECTED_ACCOUNT_ID:?PROD_EXPECTED_ACCOUNT_ID is required}"

account_id="$(aws sts get-caller-identity --query Account --output text)"
[[ "${account_id}" == "${PROD_EXPECTED_ACCOUNT_ID}" ]] || {
  echo "Authenticated AWS account is not the pinned production account" >&2
  exit 1
}

for repository in teameet-prod-v1-api teameet-prod-v1-web; do
  repository_json="$(aws ecr describe-repositories --region "${PROD_AWS_REGION}" \
    --repository-names "${repository}" --query 'repositories[0]' --output json)"
  jq -e '.imageTagMutability == "IMMUTABLE" and .imageScanningConfiguration.scanOnPush == true' \
    <<< "${repository_json}" >/dev/null
done

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "account_id=${account_id}" >> "${GITHUB_OUTPUT}"
fi
echo "[prod-target] account=${account_id} registry verified"

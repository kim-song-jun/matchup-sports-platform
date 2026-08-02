#!/usr/bin/env bash

set -Eeuo pipefail

# scripts/release/rollback-alpha-via-ssm.sh 를 prod 용으로 일반화한 것. SSM send-command
# 대신 이미 구성된 `ssh ec2` alias 를 그대로 쓴다(D2 제약: SSM 전환은 범위 밖). 호출 전
# "Setup SSH" 스텝이 먼저 실행돼 있어야 한다.

for name in EXPECTED_ACTIVE_SHA ECR_REGISTRY AWS_REGION; do
  [[ -n "${!name:-}" ]] || { echo "${name} is required" >&2; exit 1; }
done
[[ "${EXPECTED_ACTIVE_SHA}" =~ ^[0-9a-f]{40}$ ]]
[[ "${AWS_REGION}" =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]]
[[ "${ECR_REGISTRY}" =~ ^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com$ ]]

ssh ec2 "sudo -u ec2-user -H env \
  PROD_EXPECTED_ACTIVE_SHA='${EXPECTED_ACTIVE_SHA}' \
  PROD_ECR_REGISTRY='${ECR_REGISTRY}' \
  PROD_AWS_REGION='${AWS_REGION}' \
  bash '/home/ec2-user/teameet/deploy/rollback-prod.sh'"

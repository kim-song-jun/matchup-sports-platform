#!/usr/bin/env bash

set -Eeuo pipefail

# scripts/release/rollback-alpha-via-ssm.sh 를 prod 용으로 일반화한 것.
# 이전의 rollback-prod-via-ssh.sh 를 대체한다 — 장기 SSH 키 의존을 없애는 것이 목적이다.
#
# 롤백은 이미 뭔가 잘못된 상황에서만 쓰는 경로다. 그래서 여기서는 "왜 실패했는지"를
# 남기는 데 특히 신경 쓴다 — 맨 `[[ ]]` 검증은 set -e 로 죽기만 하고 단서를 남기지 않아,
# 운영자에게는 이유 없는 실패로만 보인다.

need() {
  local name="$1"
  [[ -n "${!name:-}" ]] || { echo "[prod-rollback-ssm] ${name} is required" >&2; exit 1; }
}
for name in EXPECTED_ACTIVE_SHA ECR_REGISTRY AWS_REGION INSTANCE_ID; do
  need "${name}"
done

assert_format() {
  local name="$1" value="$2" pattern="$3" hint="$4"
  [[ "${value}" =~ ${pattern} ]] || {
    echo "[prod-rollback-ssm] ${name} 형식이 올바르지 않습니다 (기대: ${hint}, 실제: '${value}')" >&2
    exit 1
  }
}
assert_format EXPECTED_ACTIVE_SHA "${EXPECTED_ACTIVE_SHA}" '^[0-9a-f]{40}$' '40자리 소문자 hex 커밋 SHA'
assert_format AWS_REGION "${AWS_REGION}" '^[a-z]{2}-[a-z]+-[0-9]$' 'AWS 리전 (예: ap-northeast-2)'
assert_format INSTANCE_ID "${INSTANCE_ID}" '^i-[0-9a-f]{17}$' 'EC2 인스턴스 ID'
assert_format ECR_REGISTRY "${ECR_REGISTRY}" '^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com$' 'ECR 레지스트리 호스트'

# 롤백은 EC2 에 이미 활성화돼 있는 릴리스 소스를 그대로 실행한다 — 새 소스를 내려받지
# 않는다(그게 롤백의 요점이다). 되돌릴 대상 digest 는 state.json 의 previous 에서 읽고,
# 이미지는 ECR 에서 다시 pull 한다.
parameters="$(jq -nc \
  --arg strict "set -Eeuo pipefail" \
  --arg rollback "sudo -u ec2-user -H env PROD_EXPECTED_ACTIVE_SHA='${EXPECTED_ACTIVE_SHA}' PROD_ECR_REGISTRY='${ECR_REGISTRY}' PROD_AWS_REGION='${AWS_REGION}' bash '/home/ec2-user/teameet/deploy/rollback-prod.sh'" \
  '{commands:[$strict,$rollback]}')"

command_id="$(aws ssm send-command --instance-ids "${INSTANCE_ID}" \
  --document-name AWS-RunShellScript --comment "Teameet prod rollback from ${EXPECTED_ACTIVE_SHA}" \
  --parameters "${parameters}" --query 'Command.CommandId' --output text)"
echo "[prod-rollback-ssm] SSM CommandId: ${command_id}"

for attempt in $(seq 1 120); do
  status="$(aws ssm get-command-invocation --command-id "${command_id}" \
    --instance-id "${INSTANCE_ID}" --query Status --output text 2>/dev/null || true)"
  case "${status}" in
    Success)
      aws ssm get-command-invocation --command-id "${command_id}" --instance-id "${INSTANCE_ID}" \
        --query StandardOutputContent --output text
      exit 0
      ;;
    Failed|TimedOut|Cancelled|Cancelling)
      echo "[prod-rollback-ssm] 롤백이 ${status} 로 끝났습니다" >&2
      aws ssm get-command-invocation --command-id "${command_id}" --instance-id "${INSTANCE_ID}" \
        --query '{status:Status,stdout:StandardOutputContent,stderr:StandardErrorContent}' --output json
      exit 1
      ;;
  esac
  sleep 10
done
echo "[prod-rollback-ssm] 20분 안에 롤백이 끝나지 않았습니다 (CommandId: ${command_id})" >&2
exit 1

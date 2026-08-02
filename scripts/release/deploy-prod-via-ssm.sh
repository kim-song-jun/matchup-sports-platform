#!/usr/bin/env bash

set -Eeuo pipefail

# scripts/release/deploy-alpha-via-ssm.sh 를 prod 용으로 일반화한 것.
#
# 왜 SSH 를 버리고 SSM 인가 —
# prod 배포는 GitHub Actions 러너에서 장기 SSH 사설키(EC2_SSH_KEY)로 EC2 에 붙고 있었다.
# 그 탓에 ① 저장소가 프로덕션 서버의 영구 개인키를 들고 있어야 하고 ② 러너 IP 가 매번
# 바뀌므로 보안 그룹의 22번을 0.0.0.0/0 으로 열어 둘 수밖에 없었다. SSM 은 단기 OIDC
# 자격증명으로 동작하고 인바운드 포트를 전혀 요구하지 않아 둘 다 사라진다.
# (alpha 는 처음부터 이 방식이었다 — 이 스크립트는 그 구조를 그대로 따른다.)

need() {
  local name="$1"
  [[ -n "${!name:-}" ]] || { echo "[prod-deploy-ssm] ${name} is required" >&2; exit 1; }
}
for name in RELEASE_SHA RELEASE_VERSION DEPLOY_BUCKET EXPECTED_BUCKET_OWNER INSTANCE_ID \
  SOURCE_VERSION_ID SOURCE_SHA256 MANIFEST_VERSION_ID MANIFEST_SHA256 REGISTRY AWS_REGION; do
  need "${name}"
done

# 검증이 실패하면 왜 실패했는지 남긴다. 맨 `[[ ]]` 는 set -e 로 죽기만 하고 아무 단서도
# 남기지 않아, 배포 로그에 exit 1 만 찍힌 채 무엇이 잘못됐는지 알 수 없다.
assert_format() {
  local name="$1" value="$2" pattern="$3" hint="$4"
  [[ "${value}" =~ ${pattern} ]] || {
    echo "[prod-deploy-ssm] ${name} 형식이 올바르지 않습니다 (기대: ${hint}, 실제: '${value}')" >&2
    exit 1
  }
}
assert_format RELEASE_SHA "${RELEASE_SHA}" '^[0-9a-f]{40}$' '40자리 소문자 hex 커밋 SHA'
assert_format RELEASE_VERSION "${RELEASE_VERSION}" '^[0-9]+\.[0-9]+\.[0-9]+$' '안정 SemVer (예: 0.2.0)'
assert_format AWS_REGION "${AWS_REGION}" '^[a-z]{2}-[a-z]+-[0-9]$' 'AWS 리전 (예: ap-northeast-2)'
assert_format EXPECTED_BUCKET_OWNER "${EXPECTED_BUCKET_OWNER}" '^[0-9]{12}$' '12자리 AWS 계정 ID'
assert_format INSTANCE_ID "${INSTANCE_ID}" '^i-[0-9a-f]{17}$' 'EC2 인스턴스 ID'
assert_format DEPLOY_BUCKET "${DEPLOY_BUCKET}" '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$' 'S3 버킷 이름'
assert_format SOURCE_SHA256 "${SOURCE_SHA256}" '^[0-9a-f]{64}$' '64자리 소문자 hex'
assert_format MANIFEST_SHA256 "${MANIFEST_SHA256}" '^[0-9a-f]{64}$' '64자리 소문자 hex'
assert_format SOURCE_VERSION_ID "${SOURCE_VERSION_ID}" '^[A-Za-z0-9._+=/-]{1,1024}$' 'S3 버전 ID'
assert_format MANIFEST_VERSION_ID "${MANIFEST_VERSION_ID}" '^[A-Za-z0-9._+=/-]{1,1024}$' 'S3 버전 ID'
[[ "${REGISTRY}" == "${EXPECTED_BUCKET_OWNER}.dkr.ecr.${AWS_REGION}.amazonaws.com" ]] || {
  echo "[prod-deploy-ssm] REGISTRY 가 계정·리전과 일치하지 않습니다 (실제: '${REGISTRY}')" >&2
  exit 1
}

stage="/home/ec2-user/.teameet-prod-staging/${RELEASE_SHA}"
archive="/tmp/teameet-prod-${RELEASE_SHA}.tar.gz"
manifest="/tmp/teameet-prod-${RELEASE_SHA}.json"

# 원격에서 실행할 명령을 jq 로 조립한다. 각 원소가 한 줄씩 순서대로 실행된다.
# 시크릿은 여기 절대 넣지 않는다 — SSM 명령 파라미터는 CloudTrail 과 명령 이력에 남는다.
# 런타임 시크릿은 별도 스텝이 Parameter Store(SecureString) 로 전달하고, 인스턴스가
# 자기 IAM role 로 복호화해 읽는다.
parameters="$(jq -nc \
  --arg strict "set -Eeuo pipefail" \
  --arg cleanup "trap 'status=\$?; rm -f '${archive}' '${manifest}'; exit \${status}' EXIT" \
  --arg prepare "rm -rf '${stage}' && install -d -o ec2-user -g ec2-user '${stage}'" \
  --arg source "aws s3api get-object --bucket '${DEPLOY_BUCKET}' --key 'releases/${RELEASE_SHA}.tar.gz' --version-id '${SOURCE_VERSION_ID}' --expected-bucket-owner '${EXPECTED_BUCKET_OWNER}' '${archive}' >/dev/null" \
  --arg source_check "echo '${SOURCE_SHA256}  ${archive}' | sha256sum -c -" \
  --arg manifest_get "aws s3api get-object --bucket '${DEPLOY_BUCKET}' --key 'manifests/${RELEASE_SHA}.json' --version-id '${MANIFEST_VERSION_ID}' --expected-bucket-owner '${EXPECTED_BUCKET_OWNER}' '${manifest}' >/dev/null" \
  --arg manifest_check "echo '${MANIFEST_SHA256}  ${manifest}' | sha256sum -c -" \
  --arg extract "tar -xzf '${archive}' -C '${stage}' && chown -R ec2-user:ec2-user '${stage}' '${manifest}'" \
  --arg deploy "sudo -u ec2-user -H env PROD_SOURCE_DIR='${stage}' PROD_MANIFEST_FILE='${manifest}' PROD_MANIFEST_SHA256='${MANIFEST_SHA256}' PROD_SHA='${RELEASE_SHA}' PROD_RELEASE_VERSION='${RELEASE_VERSION}' PROD_ECR_REGISTRY='${REGISTRY}' PROD_AWS_REGION='${AWS_REGION}' PROD_SOURCE_BUCKET='${DEPLOY_BUCKET}' PROD_SOURCE_VERSION_ID='${SOURCE_VERSION_ID}' PROD_SOURCE_SHA256='${SOURCE_SHA256}' bash '${stage}/deploy/deploy-prod.sh'" \
  '{commands:[$strict,$cleanup,$prepare,$source,$source_check,$manifest_get,$manifest_check,$extract,$deploy]}')"

command_id="$(aws ssm send-command --instance-ids "${INSTANCE_ID}" \
  --document-name AWS-RunShellScript --comment "Teameet prod ${RELEASE_VERSION} ${RELEASE_SHA}" \
  --parameters "${parameters}" --query 'Command.CommandId' --output text)"
echo "[prod-deploy-ssm] SSM CommandId: ${command_id}"

# prod 배포는 마이그레이션 + 컨테이너 교체 + 헬스체크까지 포함하므로 alpha 보다 여유를 둔다.
for attempt in $(seq 1 210); do
  status="$(aws ssm get-command-invocation --command-id "${command_id}" \
    --instance-id "${INSTANCE_ID}" --query Status --output text 2>/dev/null || true)"
  case "${status}" in
    Success)
      aws ssm get-command-invocation --command-id "${command_id}" --instance-id "${INSTANCE_ID}" \
        --query StandardOutputContent --output text
      exit 0
      ;;
    Failed|TimedOut|Cancelled|Cancelling)
      echo "[prod-deploy-ssm] 배포가 ${status} 로 끝났습니다" >&2
      aws ssm get-command-invocation --command-id "${command_id}" --instance-id "${INSTANCE_ID}" \
        --query '{status:Status,stdout:StandardOutputContent,stderr:StandardErrorContent}' --output json
      exit 1
      ;;
  esac
  sleep 10
done
echo "[prod-deploy-ssm] 35분 안에 배포가 끝나지 않았습니다 (CommandId: ${command_id})" >&2
exit 1

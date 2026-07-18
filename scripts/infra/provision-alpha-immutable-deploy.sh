#!/usr/bin/env bash

set -Eeuo pipefail

: "${ALPHA_AWS_REGION:?ALPHA_AWS_REGION is required}"
: "${ALPHA_DEPLOY_BUCKET:?ALPHA_DEPLOY_BUCKET is required}"
: "${ALPHA_EC2_INSTANCE_ID:?ALPHA_EC2_INSTANCE_ID is required}"
: "${ALPHA_EXPECTED_ACCOUNT_ID:?ALPHA_EXPECTED_ACCOUNT_ID is required}"
: "${ALPHA_GITHUB_ROLE_NAME:=teameet-alpha-github-deploy}"
readonly ALPHA_GITHUB_REPOSITORY=kim-song-jun/matchup-sports-platform

readonly API_REPOSITORY=teameet-alpha-v1-api
readonly WEB_REPOSITORY=teameet-alpha-v1-web

account_id="$(aws sts get-caller-identity --query Account --output text)"
if [[ "${account_id}" != "${ALPHA_EXPECTED_ACCOUNT_ID}" ]]; then
  echo "Authenticated AWS account does not match ALPHA_EXPECTED_ACCOUNT_ID" >&2
  exit 1
fi

expected_bucket="teameet-alpha-deploy-${account_id}-${ALPHA_AWS_REGION}"
if [[ "${ALPHA_DEPLOY_BUCKET}" != "${expected_bucket}" ]]; then
  echo "Alpha deploy bucket must be exactly ${expected_bucket}" >&2
  exit 1
fi
aws s3api head-bucket --bucket "${ALPHA_DEPLOY_BUCKET}" \
  --expected-bucket-owner "${account_id}"

instance_json="$(aws ec2 describe-instances --region "${ALPHA_AWS_REGION}" \
  --instance-ids "${ALPHA_EC2_INSTANCE_ID}" \
  --query 'Reservations[0].Instances[0].{State:State.Name,Name:Tags[?Key==`Name`]|[0].Value,Environment:Tags[?Key==`Environment`]|[0].Value,Branch:Tags[?Key==`Branch`]|[0].Value,Profile:IamInstanceProfile.Arn}' \
  --output json)"
jq -e '
  .State == "running" and
  .Name == "teameet-alpha-dev" and
  .Environment == "alpha" and
  .Branch == "dev" and
  (.Profile | type == "string" and length > 0)
' <<< "${instance_json}" >/dev/null || {
  echo "EC2 target is not the running dev/alpha Teameet instance" >&2
  exit 1
}
profile_arn="$(jq -er '.Profile' <<< "${instance_json}")"
profile_name="${profile_arn##*/}"
instance_role="$(aws iam get-instance-profile --instance-profile-name "${profile_name}" \
  --query 'InstanceProfile.Roles[0].RoleName' --output text)"

github_attached="$(aws iam list-attached-role-policies --role-name "${ALPHA_GITHUB_ROLE_NAME}" \
  --query 'AttachedPolicies[].PolicyArn' --output json)"
jq -e 'length == 0' <<< "${github_attached}" >/dev/null || {
  echo "GitHub deploy role has unexpected attached policies; review before convergence" >&2
  exit 1
}
instance_attached="$(aws iam list-attached-role-policies --role-name "${instance_role}" \
  --query 'AttachedPolicies[].PolicyArn' --output json)"
jq -e 'all(. == "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore")' \
  <<< "${instance_attached}" >/dev/null || {
  echo "Alpha instance role has unexpected attached policies; review before convergence" >&2
  exit 1
}

ssm_ping="$(aws ssm describe-instance-information --region "${ALPHA_AWS_REGION}" \
  --filters "Key=InstanceIds,Values=${ALPHA_EC2_INSTANCE_ID}" \
  --query 'InstanceInformationList[0].PingStatus' --output text)"
if [[ "${ssm_ping}" != Online ]]; then
  echo "Alpha EC2 instance is not online in Systems Manager" >&2
  exit 1
fi

oidc_provider_arn="arn:aws:iam::${account_id}:oidc-provider/token.actions.githubusercontent.com"
aws iam get-open-id-connect-provider \
  --open-id-connect-provider-arn "${oidc_provider_arn}" >/dev/null
trust_policy="$(jq -nc \
  --arg provider "${oidc_provider_arn}" \
  --arg refSubject "repo:${ALPHA_GITHUB_REPOSITORY}:ref:refs/heads/dev" \
  --arg environmentSubject "repo:${ALPHA_GITHUB_REPOSITORY}:environment:alpha" \
  '{Version:"2012-10-17",Statement:[{Effect:"Allow",Principal:{Federated:$provider},Action:"sts:AssumeRoleWithWebIdentity",Condition:{StringEquals:{"token.actions.githubusercontent.com:aud":"sts.amazonaws.com","token.actions.githubusercontent.com:sub":[$refSubject,$environmentSubject]}}}]}')"
aws iam update-assume-role-policy --role-name "${ALPHA_GITHUB_ROLE_NAME}" \
  --policy-document "${trust_policy}"

registry="${account_id}.dkr.ecr.${ALPHA_AWS_REGION}.amazonaws.com"
for repository in "${API_REPOSITORY}" "${WEB_REPOSITORY}"; do
  if ! aws ecr describe-repositories --region "${ALPHA_AWS_REGION}" \
    --repository-names "${repository}" >/dev/null 2>&1; then
    aws ecr create-repository --region "${ALPHA_AWS_REGION}" \
      --repository-name "${repository}" \
      --image-tag-mutability IMMUTABLE \
      --image-scanning-configuration scanOnPush=true \
      --encryption-configuration encryptionType=AES256 >/dev/null
  fi
  aws ecr put-image-tag-mutability --region "${ALPHA_AWS_REGION}" \
    --repository-name "${repository}" --image-tag-mutability IMMUTABLE >/dev/null
  aws ecr put-image-scanning-configuration --region "${ALPHA_AWS_REGION}" \
    --repository-name "${repository}" --image-scanning-configuration scanOnPush=true >/dev/null
  aws ecr put-lifecycle-policy --region "${ALPHA_AWS_REGION}" \
    --repository-name "${repository}" \
    --lifecycle-policy-text '{"rules":[{"rulePriority":1,"description":"Remove only untagged build remnants after seven days","selection":{"tagStatus":"untagged","countType":"sinceImagePushed","countUnit":"days","countNumber":7},"action":{"type":"expire"}}]}' >/dev/null
done

aws s3api put-bucket-versioning --bucket "${ALPHA_DEPLOY_BUCKET}" \
  --expected-bucket-owner "${account_id}" \
  --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket "${ALPHA_DEPLOY_BUCKET}" \
  --expected-bucket-owner "${account_id}" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

github_policy="$(jq -nc \
  --arg region "${ALPHA_AWS_REGION}" --arg account "${account_id}" \
  --arg bucket "${ALPHA_DEPLOY_BUCKET}" --arg instance "${ALPHA_EC2_INSTANCE_ID}" \
  --arg api "${API_REPOSITORY}" --arg web "${WEB_REPOSITORY}" \
  '{Version:"2012-10-17",Statement:[
    {Sid:"EcrLogin",Effect:"Allow",Action:"ecr:GetAuthorizationToken",Resource:"*"},
    {Sid:"ImmutableImagePush",Effect:"Allow",Action:["ecr:BatchCheckLayerAvailability","ecr:BatchGetImage","ecr:CompleteLayerUpload","ecr:DescribeImages","ecr:DescribeImageScanFindings","ecr:DescribeRepositories","ecr:GetDownloadUrlForLayer","ecr:InitiateLayerUpload","ecr:PutImage","ecr:UploadLayerPart"],Resource:[("arn:aws:ecr:"+$region+":"+$account+":repository/"+$api),("arn:aws:ecr:"+$region+":"+$account+":repository/"+$web)]},
    {Sid:"ReleaseBucketMetadata",Effect:"Allow",Action:["s3:GetBucketVersioning","s3:ListBucket"],Resource:("arn:aws:s3:::"+$bucket)},
    {Sid:"ImmutableReleaseObjects",Effect:"Allow",Action:["s3:GetObject","s3:GetObjectVersion","s3:PutObject"],Resource:[("arn:aws:s3:::"+$bucket+"/releases/*"),("arn:aws:s3:::"+$bucket+"/manifests/*")]},
    {Sid:"DescribeAlphaTarget",Effect:"Allow",Action:"ec2:DescribeInstances",Resource:"*"},
    {Sid:"InvokeAlphaInstance",Effect:"Allow",Action:"ssm:SendCommand",Resource:[("arn:aws:ssm:"+$region+"::document/AWS-RunShellScript"),("arn:aws:ec2:"+$region+":"+$account+":instance/"+$instance)]},
    {Sid:"ReadAlphaCommand",Effect:"Allow",Action:"ssm:GetCommandInvocation",Resource:"*"}
  ]}')"
aws iam put-role-policy --role-name "${ALPHA_GITHUB_ROLE_NAME}" \
  --policy-name TeameetAlphaImmutableReleasePush \
  --policy-document "${github_policy}"
while IFS= read -r policy_name; do
  [[ -z "${policy_name}" || "${policy_name}" == TeameetAlphaImmutableReleasePush ]] && continue
  aws iam delete-role-policy --role-name "${ALPHA_GITHUB_ROLE_NAME}" --policy-name "${policy_name}"
done < <(aws iam list-role-policies --role-name "${ALPHA_GITHUB_ROLE_NAME}" \
  --query 'PolicyNames[]' --output text | tr '\t' '\n')

pull_policy="$(jq -nc \
  --arg region "${ALPHA_AWS_REGION}" --arg account "${account_id}" \
  --arg bucket "${ALPHA_DEPLOY_BUCKET}" \
  --arg api "${API_REPOSITORY}" --arg web "${WEB_REPOSITORY}" \
  '{Version:"2012-10-17",Statement:[
    {Sid:"EcrLogin",Effect:"Allow",Action:"ecr:GetAuthorizationToken",Resource:"*"},
    {Sid:"ImmutableImagePull",Effect:"Allow",Action:["ecr:BatchGetImage","ecr:GetDownloadUrlForLayer"],Resource:[("arn:aws:ecr:"+$region+":"+$account+":repository/"+$api),("arn:aws:ecr:"+$region+":"+$account+":repository/"+$web)]},
    {Sid:"PinnedReleaseRead",Effect:"Allow",Action:["s3:GetObject","s3:GetObjectVersion"],Resource:[("arn:aws:s3:::"+$bucket+"/releases/*"),("arn:aws:s3:::"+$bucket+"/manifests/*")]}
  ]}')"
aws iam put-role-policy --role-name "${instance_role}" \
  --policy-name TeameetAlphaImmutableImagePull \
  --policy-document "${pull_policy}"
while IFS= read -r policy_name; do
  [[ -z "${policy_name}" || "${policy_name}" == TeameetAlphaImmutableImagePull ]] && continue
  aws iam delete-role-policy --role-name "${instance_role}" --policy-name "${policy_name}"
done < <(aws iam list-role-policies --role-name "${instance_role}" \
  --query 'PolicyNames[]' --output text | tr '\t' '\n')

printf 'registry=%s\ngithub_role=%s\ninstance_role=%s\n' \
  "${registry}" "${ALPHA_GITHUB_ROLE_NAME}" "${instance_role}"

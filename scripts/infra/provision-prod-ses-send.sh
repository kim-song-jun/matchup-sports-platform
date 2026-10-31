#!/usr/bin/env bash
# Grants the production API (instance-profile credentials via IMDS) permission to send mail
# through SES from the verified domain only. Idempotent: put-role-policy replaces the same name.
# Without it every SES send is denied and password-reset and login step-up mail never leaves.

set -Eeuo pipefail

: "${PROD_AWS_REGION:=ap-northeast-2}"
: "${PROD_INSTANCE_NAME:=matchup-production}"
: "${PROD_SES_DOMAIN:=teameet.co.kr}"
: "${PROD_EXPECTED_ACCOUNT_ID:?PROD_EXPECTED_ACCOUNT_ID is required}"
readonly policy_name=TeameetProdSesSend

account_id="$(aws sts get-caller-identity --query Account --output text)"
if [[ "${account_id}" != "${PROD_EXPECTED_ACCOUNT_ID}" ]]; then
  echo "Authenticated AWS account does not match PROD_EXPECTED_ACCOUNT_ID" >&2
  exit 1
fi

profile_arn="$(aws ec2 describe-instances --region "${PROD_AWS_REGION}" \
  --filters "Name=tag:Name,Values=${PROD_INSTANCE_NAME}" Name=instance-state-name,Values=running \
  --query 'Reservations[0].Instances[0].IamInstanceProfile.Arn' --output text)"
if [[ -z "${profile_arn}" || "${profile_arn}" == None ]]; then
  echo "No running instance named ${PROD_INSTANCE_NAME} with an instance profile" >&2
  exit 1
fi
instance_role="$(aws iam get-instance-profile --instance-profile-name "${profile_arn##*/}" \
  --query 'InstanceProfile.Roles[0].RoleName' --output text)"

identity_arn="arn:aws:ses:${PROD_AWS_REGION}:${account_id}:identity/${PROD_SES_DOMAIN}"
policy="$(jq -nc --arg identity "${identity_arn}" --arg from "*@${PROD_SES_DOMAIN}" '{
  Version: "2012-10-17",
  Statement: [{
    Sid: "SendFromVerifiedDomainOnly",
    Effect: "Allow",
    Action: ["ses:SendEmail"],
    Resource: [$identity],
    Condition: { StringLike: { "ses:FromAddress": $from } }
  }]
}')"

aws iam put-role-policy --role-name "${instance_role}" \
  --policy-name "${policy_name}" --policy-document "${policy}"

decision="$(aws iam simulate-principal-policy \
  --policy-source-arn "arn:aws:iam::${account_id}:role/${instance_role}" \
  --action-names ses:SendEmail --resource-arns "${identity_arn}" \
  --context-entries "ContextKeyName=ses:FromAddress,ContextKeyValues=noreply@${PROD_SES_DOMAIN},ContextKeyType=string" \
  --query 'EvaluationResults[0].EvalDecision' --output text)"
printf 'instance_role=%s policy=%s simulate=%s\n' "${instance_role}" "${policy_name}" "${decision}"
[[ "${decision}" == allowed ]]

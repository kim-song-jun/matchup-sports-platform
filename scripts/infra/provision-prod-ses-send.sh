#!/usr/bin/env bash
# Grants the production API (instance-profile credentials via IMDS) permission to send mail
# through SES from one verified sender address only. Idempotent: put-role-policy replaces the same name.
# Without it every SES send is denied and password-reset and login step-up mail never leaves.

set -Eeuo pipefail
export AWS_PAGER=""

: "${PROD_AWS_REGION:=ap-northeast-2}"
: "${PROD_SES_REGION:=${PROD_AWS_REGION}}"
: "${PROD_EC2_INSTANCE_ID:?PROD_EC2_INSTANCE_ID is required}"
: "${PROD_EXPECTED_ACCOUNT_ID:?PROD_EXPECTED_ACCOUNT_ID is required}"
: "${PROD_SES_DOMAIN:=teameet.co.kr}"
# Must equal the API's EMAIL_FROM; a different sender is denied.
: "${PROD_SES_FROM_ADDRESS:=no-reply@${PROD_SES_DOMAIN}}"
readonly policy_name=TeameetProdSesSend

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

account_id="$(aws sts get-caller-identity --query Account --output text)"
if [[ "${account_id}" != "${PROD_EXPECTED_ACCOUNT_ID}" ]]; then
  echo "Authenticated AWS account does not match PROD_EXPECTED_ACCOUNT_ID" >&2
  exit 1
fi

# alpha and prod share one account, so the account check alone cannot tell them apart.
instance_json="$(aws ec2 describe-instances --region "${PROD_AWS_REGION}" \
  --instance-ids "${PROD_EC2_INSTANCE_ID}" \
  --query 'Reservations[0].Instances[0].{State:State.Name,Name:Tags[?Key==`Name`]|[0].Value,Environment:Tags[?Key==`Environment`]|[0].Value,Profile:IamInstanceProfile.Arn}' \
  --output json)"
jq -e '.State == "running" and .Name == "matchup-production" and .Environment == "production" and (.Profile | type == "string")' \
  <<< "${instance_json}" >/dev/null || { echo "PROD_EC2_INSTANCE_ID is not the running production instance" >&2; exit 1; }
profile_arn="$(jq -r .Profile <<< "${instance_json}")"

# The grant lands on the profile's role; refuse if any other instance shares it.
sharing="$(aws ec2 describe-instances --region "${PROD_AWS_REGION}" \
  --filters "Name=iam-instance-profile.arn,Values=${profile_arn}" \
    Name=instance-state-name,Values=pending,running,stopping,stopped \
  --query 'length(Reservations[].Instances[])' --output text)"
if [[ "${sharing}" != 1 ]]; then
  echo "Instance profile is attached to ${sharing} instances; expected only production" >&2
  exit 1
fi

instance_role="$(aws iam get-instance-profile --instance-profile-name "${profile_arn##*/}" \
  --query 'InstanceProfile.Roles[0].RoleName' --output text)"
if [[ -z "${instance_role}" || "${instance_role}" == None ]]; then
  echo "Instance profile has no role" >&2
  exit 1
fi

identity_arn="arn:aws:ses:${PROD_SES_REGION}:${account_id}:identity/${PROD_SES_DOMAIN}"
policy="$(jq -nc --arg identity "${identity_arn}" --arg from "${PROD_SES_FROM_ADDRESS}" '{
  Version: "2012-10-17",
  Statement: [{
    Sid: "SendFromProductionSenderOnly",
    Effect: "Allow",
    Action: ["ses:SendEmail"],
    Resource: [$identity],
    Condition: { StringEquals: { "ses:FromAddress": $from } }
  }]
}')"

aws iam put-role-policy --role-name "${instance_role}" \
  --policy-name "${policy_name}" --policy-document "${policy}"

simulate() {
  aws iam simulate-principal-policy \
    --policy-source-arn "arn:aws:iam::${account_id}:role/${instance_role}" \
    --action-names ses:SendEmail --resource-arns "${identity_arn}" \
    --context-entries "ContextKeyName=ses:FromAddress,ContextKeyValues=$1,ContextKeyType=string" \
    --query 'EvaluationResults[0].EvalDecision' --output text
}
allowed="$(simulate "${PROD_SES_FROM_ADDRESS}")"
other="$(simulate "someone-else@${PROD_SES_DOMAIN}")"
printf 'instance_role=%s policy=%s sender=%s other_sender=%s\n' "${instance_role}" "${policy_name}" "${allowed}" "${other}"
[[ "${allowed}" == allowed && "${other}" != allowed ]]

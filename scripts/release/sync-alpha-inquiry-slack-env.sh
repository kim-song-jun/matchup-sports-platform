#!/usr/bin/env bash

set -Eeuo pipefail
: "${INSTANCE_ID:?INSTANCE_ID is required}"
: "${AWS_REGION:?AWS_REGION is required}"
: "${SECRET_SLACK_INQUIRY_WEBHOOK_URL:?SECRET_SLACK_INQUIRY_WEBHOOK_URL is required}"
[[ "${INSTANCE_ID}" =~ ^i-[0-9a-f]{17}$ ]]
[[ "${AWS_REGION}" =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]]
[[ "${SECRET_SLACK_INQUIRY_WEBHOOK_URL}" =~ ^https://hooks\.slack\.com/services/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+$ ]] || {
  echo '[alpha-slack-env] invalid Slack webhook format' >&2
  exit 1
}

readonly parameter_name='/teameet/alpha/env/SLACK_INQUIRY_WEBHOOK_URL'
aws ssm put-parameter --region "${AWS_REGION}" --name "${parameter_name}" --value "${SECRET_SLACK_INQUIRY_WEBHOOK_URL}" --type SecureString --overwrite >/dev/null

remote_script=$(cat <<REMOTE
set -Eeuo pipefail
env_file=/home/ec2-user/teameet/deploy/.env
[ -f "\${env_file}" ] || { echo '[alpha-slack-env] protected runtime env is missing' >&2; exit 1; }
# Follow the symlink before writing. deploy/.env is a link into the protected runtime
# directory, and every deploy deletes the link and recreates it — so a write that REPLACES
# the link (mv onto it) survives only until the next deploy, which restores the link and
# with it the untouched runtime file. Measured: the real file at
# ~/.teameet-alpha-runtime/.env had not changed since 30 Jul, so nothing this script ever
# wrote reached a container.
env_file="\$(readlink -f "\${env_file}")"
value="\$(aws ssm get-parameter --region ${AWS_REGION} --name ${parameter_name} --with-decryption --query Parameter.Value --output text)"
[ -n "\${value}" ] && [ "\${value}" != None ]
tmp="\$(mktemp)"
chmod 600 "\${tmp}"
trap 'rm -f "\${tmp}"' EXIT
grep -v '^SLACK_INQUIRY_WEBHOOK_URL=' "\${env_file}" > "\${tmp}" || true
printf 'SLACK_INQUIRY_WEBHOOK_URL=%s\n' "\${value}" >> "\${tmp}"
cat "\${tmp}" > "\${env_file}"
trap - EXIT
REMOTE
)

parameters="$(jq -nc --arg script "${remote_script}" '{commands:[$script]}')"
command_id="$(aws ssm send-command --region "${AWS_REGION}" --instance-ids "${INSTANCE_ID}" --document-name AWS-RunShellScript --comment 'Teameet alpha inquiry Slack env sync' --parameters "${parameters}" --query 'Command.CommandId' --output text)"
aws ssm wait command-executed --region "${AWS_REGION}" --command-id "${command_id}" --instance-id "${INSTANCE_ID}" || true
status="$(aws ssm get-command-invocation --region "${AWS_REGION}" --command-id "${command_id}" --instance-id "${INSTANCE_ID}" --query Status --output text)"
[[ "${status}" == Success ]] || { echo "[alpha-slack-env] sync failed with ${status}" >&2; exit 1; }
echo '[alpha-slack-env] sync completed'

#!/usr/bin/env bash

set -Eeuo pipefail
: "${INSTANCE_ID:?INSTANCE_ID is required}"
: "${AWS_REGION:?AWS_REGION is required}"
[[ "${INSTANCE_ID}" =~ ^i-[0-9a-f]{17}$ ]]
[[ "${AWS_REGION}" =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]]

readonly parameter_name='/teameet/alpha/env/FIREBASE_ADMIN_JSON'

remote_script=$(cat <<REMOTE
set -Eeuo pipefail
env_link=/home/ec2-user/teameet/deploy/.env
[ -f "\${env_link}" ] || { echo '[alpha-firebase-env] protected runtime env is missing' >&2; exit 1; }
env_file="\$(readlink -f "\${env_link}")"
[ "\${env_file}" = /home/ec2-user/.teameet-alpha-runtime/.env ] || {
  echo '[alpha-firebase-env] runtime env link target is unexpected' >&2
  exit 1
}

json="\$(aws ssm get-parameter --region ${AWS_REGION} --name ${parameter_name} --with-decryption --query Parameter.Value --output text)"
[ -n "\${json}" ] && [ "\${json}" != None ]
project_id="\$(printf '%s' "\${json}" | jq -er 'select(.type == "service_account") | .project_id')"
client_email="\$(printf '%s' "\${json}" | jq -er '.client_email')"
private_key="\$(printf '%s' "\${json}" | jq -er '.private_key')"
[ "\${project_id}" = teameet-alpha ] || { echo '[alpha-firebase-env] project must be teameet-alpha' >&2; exit 1; }
case "\${client_email}" in *.gserviceaccount.com) ;; *) echo '[alpha-firebase-env] invalid service-account email' >&2; exit 1 ;; esac
printf '%s' "\${private_key}" | openssl pkey -noout >/dev/null 2>&1 || {
  echo '[alpha-firebase-env] private key is not readable' >&2
  exit 1
}
private_key_one_line="\$(printf '%s' "\${private_key}" | awk 'BEGIN{ORS="\\\\n"} {print}')"

tmp="\$(mktemp)"
chmod 600 "\${tmp}"
trap 'rm -f "\${tmp}"' EXIT
grep -Ev '^FIREBASE_(PROJECT_ID|CLIENT_EMAIL|PRIVATE_KEY)=' "\${env_file}" > "\${tmp}" || true
for name in FIREBASE_PROJECT_ID FIREBASE_CLIENT_EMAIL FIREBASE_PRIVATE_KEY; do
  case "\${name}" in
    FIREBASE_PROJECT_ID) value="\${project_id}" ;;
    FIREBASE_CLIENT_EMAIL) value="\${client_email}" ;;
    FIREBASE_PRIVATE_KEY) value="\${private_key_one_line}" ;;
  esac
  escaped="\${value//\'/\'\\\'\'}"
  printf "%s='%s'\n" "\${name}" "\${escaped}" >> "\${tmp}"
done
cat "\${tmp}" > "\${env_file}"
chmod 600 "\${env_file}"
chown ec2-user:ec2-user "\${env_file}"
trap - EXIT

set -a
# shellcheck disable=SC1090 -- validate the protected file without printing values.
source "\${env_file}"
set +a
[ "\${FIREBASE_PROJECT_ID:-}" = teameet-alpha ]
[ -n "\${FIREBASE_CLIENT_EMAIL:-}" ]
[ -n "\${FIREBASE_PRIVATE_KEY:-}" ]
echo '[alpha-firebase-env] sync completed'
REMOTE
)

parameters="$(jq -nc --arg script "${remote_script}" '{commands:[$script]}')"
command_id="$(aws ssm send-command --region "${AWS_REGION}" --instance-ids "${INSTANCE_ID}" \
  --document-name AWS-RunShellScript --comment 'Teameet alpha Firebase Admin env sync' \
  --parameters "${parameters}" --query 'Command.CommandId' --output text)"
aws ssm wait command-executed --region "${AWS_REGION}" --command-id "${command_id}" --instance-id "${INSTANCE_ID}" || true
status="$(aws ssm get-command-invocation --region "${AWS_REGION}" --command-id "${command_id}" \
  --instance-id "${INSTANCE_ID}" --query Status --output text)"
[[ "${status}" == Success ]] || {
  aws ssm get-command-invocation --region "${AWS_REGION}" --command-id "${command_id}" \
    --instance-id "${INSTANCE_ID}" --query StandardErrorContent --output text >&2 || true
  echo "[alpha-firebase-env] sync failed with ${status}" >&2
  exit 1
}
echo '[alpha-firebase-env] host runtime env is ready'

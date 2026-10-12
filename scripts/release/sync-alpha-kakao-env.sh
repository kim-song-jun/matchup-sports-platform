#!/usr/bin/env bash
# Puts the Kakao OAuth server credentials into the alpha host's runtime env.
#
# Without them `/auth/kakao` code login answers 400 OAUTH_NOT_CONFIGURED on alpha.
# Alpha-specific GitHub secrets feed both this script and the matching web build.
#
# Same transport and quoting as sync-alpha-apple-sign-in-env.sh: values go to SSM as
# SecureString and are written into the host's protected `deploy/.env` over SSM.
#
# THIS REPOSITORY IS PUBLIC. No credentials may appear in it; values come from the
# environment only and are never echoed.
set -Eeuo pipefail
: "${INSTANCE_ID:?INSTANCE_ID is required}"
: "${AWS_REGION:?AWS_REGION is required}"
: "${SECRET_KAKAO_CLIENT_ID:?SECRET_KAKAO_CLIENT_ID is required}"
: "${SECRET_KAKAO_CLIENT_SECRET:?SECRET_KAKAO_CLIENT_SECRET is required}"
: "${SECRET_ALPHA_KAKAO_REDIRECT_URI:?SECRET_ALPHA_KAKAO_REDIRECT_URI is required}"
: "${SECRET_KAKAO_APP_ID:?SECRET_KAKAO_APP_ID is required}"
[[ "${INSTANCE_ID}" =~ ^i-[0-9a-f]{17}$ ]]
[[ "${AWS_REGION}" =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]]

# Validate the complete configuration before changing AWS or the host.
# Checked one by one: the redirect URI contains ':', so a ':'-delimited guard list cannot carry it.
leave_unchanged() {
  echo "::error::$1 does not look right ($2 chars); the host's Kakao env was left unchanged"
  exit 1
}
client_id_pattern='^[0-9a-f]{32}$'
client_secret_pattern='^[A-Za-z0-9]{16,64}$'
redirect_pattern='^https://alpha\.teameet\.co\.kr/[A-Za-z0-9._~/-]*$'
[[ "${SECRET_KAKAO_CLIENT_ID}" =~ ${client_id_pattern} ]] || leave_unchanged KAKAO_CLIENT_ID "${#SECRET_KAKAO_CLIENT_ID}"
[[ "${SECRET_KAKAO_CLIENT_SECRET}" =~ ${client_secret_pattern} ]] || leave_unchanged KAKAO_CLIENT_SECRET "${#SECRET_KAKAO_CLIENT_SECRET}"
[[ "${SECRET_ALPHA_KAKAO_REDIRECT_URI}" =~ ${redirect_pattern} ]] || leave_unchanged KAKAO_REDIRECT_URI "${#SECRET_ALPHA_KAKAO_REDIRECT_URI}"

[[ "${SECRET_KAKAO_APP_ID}" =~ ^[0-9]+$ ]] || leave_unchanged KAKAO_APP_ID "${#SECRET_KAKAO_APP_ID}"
names=(KAKAO_CLIENT_ID KAKAO_CLIENT_SECRET KAKAO_REDIRECT_URI KAKAO_APP_ID)
values=("${SECRET_KAKAO_CLIENT_ID}" "${SECRET_KAKAO_CLIENT_SECRET}" "${SECRET_ALPHA_KAKAO_REDIRECT_URI}" "${SECRET_KAKAO_APP_ID}")

for index in "${!names[@]}"; do
  aws ssm put-parameter --region "${AWS_REGION}" \
    --name "/teameet/alpha/env/${names[$index]}" \
    --value "${values[$index]}" --type SecureString --overwrite >/dev/null
done

remote_script=$(cat <<REMOTE
set -Eeuo pipefail
env_file=/home/ec2-user/teameet/deploy/.env
[ -f "\${env_file}" ] || { echo '[alpha-kakao-env] protected runtime env is missing' >&2; exit 1; }
env_file="\$(readlink -f "\${env_file}")"
tmp="\$(mktemp)"
chmod 600 "\${tmp}"
trap 'rm -f "\${tmp}"' EXIT
cp "\${env_file}" "\${tmp}"
for name in ${names[*]}; do
  value="\$(aws ssm get-parameter --region ${AWS_REGION} --name /teameet/alpha/env/\${name} --with-decryption --query Parameter.Value --output text)"
  [ -n "\${value}" ] && [ "\${value}" != None ]
  next="\$(mktemp)"
  chmod 600 "\${next}"
  grep -v "^\${name}=" "\${tmp}" > "\${next}" || true
  escaped="\${value//\'/\'\\\\\'\'}"
  printf "%s='%s'\n" "\${name}" "\${escaped}" >> "\${next}"
  mv "\${next}" "\${tmp}"
done
cat "\${tmp}" > "\${env_file}"
REMOTE
)

parameters="$(jq -nc --arg script "${remote_script}" '{commands:[$script]}')"
command_id="$(aws ssm send-command --region "${AWS_REGION}" --instance-ids "${INSTANCE_ID}" --document-name AWS-RunShellScript --comment 'Teameet alpha Kakao OAuth env sync' --parameters "${parameters}" --query 'Command.CommandId' --output text)"
aws ssm wait command-executed --region "${AWS_REGION}" --command-id "${command_id}" --instance-id "${INSTANCE_ID}" || true
status="$(aws ssm get-command-invocation --region "${AWS_REGION}" --command-id "${command_id}" --instance-id "${INSTANCE_ID}" --query Status --output text)"
[[ "${status}" == Success ]] || { echo "[alpha-kakao-env] sync failed with ${status}" >&2; exit 1; }
echo '[alpha-kakao-env] sync completed'

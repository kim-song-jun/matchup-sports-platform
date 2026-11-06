#!/usr/bin/env bash
# Sync the selected production SMS provider to Alpha; SES keys are operator-owned SSM SecureStrings.
# Credentials never appear in SSM command documents or workflow logs.
set -Eeuo pipefail
: "${INSTANCE_ID:?INSTANCE_ID is required}"
: "${AWS_REGION:?AWS_REGION is required}"
[[ "${INSTANCE_ID}" =~ ^i-[0-9a-f]{17}$ ]]
[[ "${AWS_REGION}" =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]]

names=(SMS_PROVIDER GABIA_SMS_ID GABIA_API_KEY GABIA_SENDER_NUMBER SOLAPI_API_KEY SOLAPI_API_SECRET SOLAPI_SENDER_NUMBER)
provider="${SECRET_SMS_PROVIDER:-solapi}"
provider="$(printf '%s' "${provider}" | tr '[:upper:]' '[:lower:]' | xargs)"
case "${provider}" in
  gabia)
    : "${SECRET_GABIA_SMS_ID:?SECRET_GABIA_SMS_ID is required}"
    : "${SECRET_GABIA_API_KEY:?SECRET_GABIA_API_KEY is required}"
    : "${SECRET_GABIA_SENDER_NUMBER:?SECRET_GABIA_SENDER_NUMBER is required}"
    selected=(SMS_PROVIDER GABIA_SMS_ID GABIA_API_KEY GABIA_SENDER_NUMBER)
    ;;
  solapi)
    : "${SECRET_SOLAPI_API_KEY:?SECRET_SOLAPI_API_KEY is required}"
    : "${SECRET_SOLAPI_API_SECRET:?SECRET_SOLAPI_API_SECRET is required}"
    : "${SECRET_SOLAPI_SENDER_NUMBER:?SECRET_SOLAPI_SENDER_NUMBER is required}"
    selected=(SMS_PROVIDER SOLAPI_API_KEY SOLAPI_API_SECRET SOLAPI_SENDER_NUMBER)
    ;;
  *) echo '[alpha-verification-env] unknown SMS provider' >&2; exit 1 ;;
esac

for name in "${selected[@]}"; do
  if [[ "${name}" == SMS_PROVIDER ]]; then value="${provider}"; else secret_name="SECRET_${name}"; value="${!secret_name}"; fi
  [[ -n "${value}" && ! "${value}" =~ [[:space:]] ]] || { echo "[alpha-verification-env] invalid ${name}" >&2; exit 1; }
done
# Validate every field before modifying SSM; keep the temporary request file private and remove it on exit.
payload_dir="$(mktemp -d)"
chmod 700 "${payload_dir}"
trap 'rm -f "${payload_dir}/payload.json"; rmdir "${payload_dir}"' EXIT
for name in "${selected[@]}"; do
  if [[ "${name}" == SMS_PROVIDER ]]; then value="${provider}"; else secret_name="SECRET_${name}"; value="${!secret_name}"; fi
  printf '%s' "${value}" | jq -Rs --arg name "/teameet/alpha/env/${name}" \
    '{Name:$name,Value:.,Type:"SecureString",Overwrite:true}' > "${payload_dir}/payload.json"
  chmod 600 "${payload_dir}/payload.json"
  aws ssm put-parameter --region "${AWS_REGION}" --cli-input-json "file://${payload_dir}/payload.json" >/dev/null
done

remote_script=$(cat <<REMOTE
set -Eeuo pipefail
env_link=/home/ec2-user/teameet/deploy/.env
[ -f "\${env_link}" ] || { echo '[alpha-verification-env] protected runtime env missing' >&2; exit 1; }
env_file="\$(readlink -f "\${env_link}")"
[ "\${env_file}" = /home/ec2-user/.teameet-alpha-runtime/.env ] || { echo '[alpha-verification-env] unexpected runtime env target' >&2; exit 1; }
provider="\$(aws ssm get-parameter --region ${AWS_REGION} --name /teameet/alpha/env/SMS_PROVIDER --with-decryption --query Parameter.Value --output text)"
if [ "\${provider}" = gabia ]; then
  sms_names='GABIA_SMS_ID GABIA_API_KEY GABIA_SENDER_NUMBER'
elif [ "\${provider}" = solapi ]; then
  sms_names='SOLAPI_API_KEY SOLAPI_API_SECRET SOLAPI_SENDER_NUMBER'
else
  echo '[alpha-verification-env] unknown SMS provider' >&2; exit 1
fi
names="ALPHA_SES_ACCESS_KEY_ID ALPHA_SES_SECRET_ACCESS_KEY SMS_PROVIDER \${sms_names}"
tmp="\$(mktemp)"
chmod 600 "\${tmp}"
trap 'rm -f "\${tmp}"' EXIT
# Remove stale credentials for the previous provider as well.
grep -Ev '^(ALPHA_SES_ACCESS_KEY_ID|ALPHA_SES_SECRET_ACCESS_KEY|SMS_PROVIDER|GABIA_SMS_ID|GABIA_API_KEY|GABIA_SENDER_NUMBER|SOLAPI_API_KEY|SOLAPI_API_SECRET|SOLAPI_SENDER_NUMBER)=' "\${env_file}" > "\${tmp}" || true
for name in \${names}; do
  value="\$(aws ssm get-parameter --region ${AWS_REGION} --name /teameet/alpha/env/\${name} --with-decryption --query Parameter.Value --output text)"
  [ -n "\${value}" ] && [ "\${value}" != None ] && [[ ! "\${value}" =~ [[:space:]] ]] || { echo "[alpha-verification-env] missing or invalid \${name}" >&2; exit 1; }
  escaped="\${value//\'/\'\\\\\'\'}"
  printf "%s='%s'\n" "\${name}" "\${escaped}" >> "\${tmp}"
done
cat "\${tmp}" > "\${env_file}"
chmod 600 "\${env_file}"
chown ec2-user:ec2-user "\${env_file}"
echo '[alpha-verification-env] host runtime env is ready'
REMOTE
)
parameters="$(jq -nc --arg script "${remote_script}" '{commands:[$script]}')"
command_id="$(aws ssm send-command --region "${AWS_REGION}" --instance-ids "${INSTANCE_ID}" --document-name AWS-RunShellScript --comment 'Teameet alpha verification env sync' --parameters "${parameters}" --query 'Command.CommandId' --output text)"
aws ssm wait command-executed --region "${AWS_REGION}" --command-id "${command_id}" --instance-id "${INSTANCE_ID}" || true
command_status="$(aws ssm get-command-invocation --region "${AWS_REGION}" --command-id "${command_id}" --instance-id "${INSTANCE_ID}" --query Status --output text)"
[[ "${command_status}" == Success ]] || { echo "[alpha-verification-env] sync failed with ${command_status}" >&2; exit 1; }
echo '[alpha-verification-env] sync completed'

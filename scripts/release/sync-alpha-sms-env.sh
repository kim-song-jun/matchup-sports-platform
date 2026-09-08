#!/usr/bin/env bash
# Puts the SMS credentials into the alpha host's runtime env.
#
# Without them `issueChallenge` answers 503 SMS_NOT_CONFIGURED and **nobody can sign up on
# alpha at all** — phone verification is step 2 of 3 and is enforced unless
# V1_PHONE_VERIFICATION_DISABLED=true. Measured: alpha sat like that, so every E2E signup
# scenario had to reuse accounts that were verified before.
#
# The wiring on the container side already exists: alpha layers docker-compose.alpha.yml on
# top of docker-compose.prod.yml, and the base file already reads SOLAPI_*/GABIA_*/
# SMS_PROVIDER from the env file. Only the values were missing.
#
# Same shape as sync-alpha-apns-env.sh: the values go to SSM as SecureStrings and are written
# into the host's protected `deploy/.env` over SSM, so they never pass through a workflow log
# or an image layer.
#
# THIS REPOSITORY IS PUBLIC. No credential may appear in it; values come from the environment.
set -Eeuo pipefail
: "${INSTANCE_ID:?INSTANCE_ID is required}"
: "${AWS_REGION:?AWS_REGION is required}"
# Not `:?` — an unset value is not an error here either. The server reads it as solapi, so
# this script has to do the same rather than refuse and leave solapi's trio unwritten.

[[ "${INSTANCE_ID}" =~ ^i-[0-9a-f]{17}$ ]]
[[ "${AWS_REGION}" =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]]

# The server picks the sender with
#   (process.env.SMS_PROVIDER ?? 'solapi').trim().toLowerCase() === 'gabia' ? gabia : solapi
# so this has to resolve the SAME string the SAME way. Two ways to get it wrong, both of
# which end in a host that stays on 503 while the server is happily using a sender whose
# credentials were never written:
#   - comparing untrimmed: `gabia ` selects Gabia on the server and misses here
#   - treating an unrecognised value as an error: the server does not error, it falls back to
#     solapi — so refusing to write leaves solapi's trio missing
# Hence: normalise like the server, and mirror its fallback instead of rejecting.
provider="${SECRET_SMS_PROVIDER-}"
provider="${provider#"${provider%%[![:space:]]*}"}"
provider="${provider%"${provider##*[![:space:]]}"}"
provider="$(printf '%s' "${provider}" | tr '[:upper:]' '[:lower:]')"
[ -n "${provider}" ] || provider=solapi

if [ "${provider}" = gabia ]; then
  required_names=(GABIA_SMS_ID GABIA_API_KEY GABIA_SENDER_NUMBER)
else
  required_names=(SOLAPI_API_KEY SOLAPI_API_SECRET SOLAPI_SENDER_NUMBER)
fi

# Only the ACTIVE provider's trio has to be complete. The other one is copied when present so
# a provider switch is a one-line change rather than another secret hunt, but its absence is
# not a reason to refuse — the sender that matters is the configured one.
#
# A missing secret warns instead of failing, for the same reason the APNs sync does: an alpha
# that cannot send a code is still a running alpha, and a blocked deploy is not. The warning
# says the host was left UNCHANGED rather than that SMS is off, because a previous run may
# have written working values that are still in place.
for name in "${required_names[@]}"; do
  value_var="SECRET_${name}"
  if [ -z "${!value_var:-}" ]; then
    echo "::warning::${name} is empty and SMS_PROVIDER is ${provider}; the host's SMS env was left unchanged"
    exit 0
  fi
done

names=(SMS_PROVIDER SOLAPI_API_KEY SOLAPI_API_SECRET SOLAPI_SENDER_NUMBER GABIA_SMS_ID GABIA_API_KEY GABIA_SENDER_NUMBER)
written=()
for name in "${names[@]}"; do
  value_var="SECRET_${name}"
  value="${!value_var:-}"
  [ -n "${value}" ] || continue
  aws ssm put-parameter --region "${AWS_REGION}" \
    --name "/teameet/alpha/env/${name}" \
    --value "${value}" --type SecureString --overwrite >/dev/null
  written+=("${name}")
done

remote_names="${written[*]}"
remote_script=$(cat <<REMOTE
set -Eeuo pipefail
env_file=/home/ec2-user/teameet/deploy/.env
[ -f "\${env_file}" ] || { echo '[alpha-sms-env] protected runtime env is missing' >&2; exit 1; }
# Follow the symlink before writing, for the reason spelled out in sync-alpha-apns-env.sh:
# deploy/.env is a link into the protected runtime directory and every deploy recreates it,
# so a write that replaces the link is undone by the next deploy.
env_file="\$(readlink -f "\${env_file}")"
tmp="\$(mktemp)"
chmod 600 "\${tmp}"
trap 'rm -f "\${tmp}"' EXIT
cp "\${env_file}" "\${tmp}"
for name in ${remote_names}; do
  value="\$(aws ssm get-parameter --region ${AWS_REGION} --name /teameet/alpha/env/\${name} --with-decryption --query Parameter.Value --output text)"
  [ -n "\${value}" ] && [ "\${value}" != None ]
  next="\$(mktemp)"
  chmod 600 "\${next}"
  grep -v "^\${name}=" "\${tmp}" > "\${next}" || true
  # Single-quoted: the deploy sources this file, and an API key with a shell metacharacter
  # would otherwise be executed. An embedded single quote is escaped the only way sh allows.
  escaped="\${value//\'/\'\\\\\'\'}"
  printf "%s='%s'\n" "\${name}" "\${escaped}" >> "\${next}"
  mv "\${next}" "\${tmp}"
done
cat "\${tmp}" > "\${env_file}"
trap - EXIT
REMOTE
)

parameters="$(jq -nc --arg script "${remote_script}" '{commands:[$script]}')"
command_id="$(aws ssm send-command --region "${AWS_REGION}" --instance-ids "${INSTANCE_ID}" \
  --document-name AWS-RunShellScript --comment 'Teameet alpha SMS env sync' \
  --parameters "${parameters}" --query 'Command.CommandId' --output text)"
aws ssm wait command-executed --region "${AWS_REGION}" --command-id "${command_id}" --instance-id "${INSTANCE_ID}" || true
status="$(aws ssm get-command-invocation --region "${AWS_REGION}" --command-id "${command_id}" --instance-id "${INSTANCE_ID}" --query Status --output text)"
echo "[alpha-sms-env] ${status} (${#written[@]} value(s), provider ${provider})"
[ "${status}" = Success ]

#!/usr/bin/env bash
# Puts the Sign in with Apple token-revoke credentials into the alpha host's runtime env.
#
# Without them `AppleTokenService` stays disabled: Apple sign-in and withdrawal still work, but
# withdrawal cannot revoke the reader's Apple authorization (App Store 5.1.1(v)).
#
# Same transport and quoting as sync-alpha-apns-env.sh (read its comments for why): values go to
# SSM as SecureString and are written into the host's protected `deploy/.env` over SSM, the
# private key as ONE line with literal backslash-n.
#
# THIS REPOSITORY IS PUBLIC. No key material may appear in it; values come from the
# environment only.
set -Eeuo pipefail
: "${INSTANCE_ID:?INSTANCE_ID is required}"
: "${AWS_REGION:?AWS_REGION is required}"
: "${SECRET_APPLE_SIGN_IN_KEY_ID:?SECRET_APPLE_SIGN_IN_KEY_ID is required}"
: "${SECRET_APPLE_SIGN_IN_TEAM_ID:?SECRET_APPLE_SIGN_IN_TEAM_ID is required}"
: "${SECRET_APPLE_SIGN_IN_PRIVATE_KEY:?SECRET_APPLE_SIGN_IN_PRIVATE_KEY is required}"
: "${SECRET_APPLE_SIGN_IN_TOKEN_ENCRYPTION_KEY:?SECRET_APPLE_SIGN_IN_TOKEN_ENCRYPTION_KEY is required}"
[[ "${INSTANCE_ID}" =~ ^i-[0-9a-f]{17}$ ]]
[[ "${AWS_REGION}" =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]]

# A malformed value leaves the host unchanged with a warning rather than failing the deploy.
for guard in "APPLE_SIGN_IN_KEY_ID:${SECRET_APPLE_SIGN_IN_KEY_ID}:^[A-Z0-9]{10}$" \
             "APPLE_SIGN_IN_TEAM_ID:${SECRET_APPLE_SIGN_IN_TEAM_ID}:^[A-Z0-9]{10}$" \
             "APPLE_SIGN_IN_TOKEN_ENCRYPTION_KEY:${SECRET_APPLE_SIGN_IN_TOKEN_ENCRYPTION_KEY}:^[A-Za-z0-9+/]{43}=$"; do
  name="${guard%%:*}"; rest="${guard#*:}"; value="${rest%:*}"; pattern="${rest##*:}"
  [[ "${value}" =~ ${pattern} ]] || {
    echo "::warning::${name} does not look right (${#value} chars); the host's Apple sign-in env was left unchanged"
    exit 0
  }
done
# shellcheck source=scripts/release/lib/private-key-pem.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/private-key-pem.sh"

if ! private_key_pem="$(normalize_private_key "${SECRET_APPLE_SIGN_IN_PRIVATE_KEY}")"; then
  echo "::warning::APPLE_SIGN_IN_PRIVATE_KEY is not a readable private key (${#SECRET_APPLE_SIGN_IN_PRIVATE_KEY} chars); the host's Apple sign-in env was left unchanged"
  exit 0
fi

names=(APPLE_SIGN_IN_KEY_ID APPLE_SIGN_IN_TEAM_ID APPLE_SIGN_IN_PRIVATE_KEY APPLE_SIGN_IN_TOKEN_ENCRYPTION_KEY)
values=("${SECRET_APPLE_SIGN_IN_KEY_ID}" "${SECRET_APPLE_SIGN_IN_TEAM_ID}"
        "$(private_key_one_line "${private_key_pem}")" "${SECRET_APPLE_SIGN_IN_TOKEN_ENCRYPTION_KEY}")

for index in "${!names[@]}"; do
  aws ssm put-parameter --region "${AWS_REGION}" \
    --name "/teameet/alpha/env/${names[$index]}" \
    --value "${values[$index]}" --type SecureString --overwrite >/dev/null
done

remote_script=$(cat <<REMOTE
set -Eeuo pipefail
env_file=/home/ec2-user/teameet/deploy/.env
[ -f "\${env_file}" ] || { echo '[alpha-apple-sign-in-env] protected runtime env is missing' >&2; exit 1; }
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
trap - EXIT
REMOTE
)

parameters="$(jq -nc --arg script "${remote_script}" '{commands:[$script]}')"
command_id="$(aws ssm send-command --region "${AWS_REGION}" --instance-ids "${INSTANCE_ID}" --document-name AWS-RunShellScript --comment 'Teameet alpha Sign in with Apple env sync' --parameters "${parameters}" --query 'Command.CommandId' --output text)"
aws ssm wait command-executed --region "${AWS_REGION}" --command-id "${command_id}" --instance-id "${INSTANCE_ID}" || true
status="$(aws ssm get-command-invocation --region "${AWS_REGION}" --command-id "${command_id}" --instance-id "${INSTANCE_ID}" --query Status --output text)"
[[ "${status}" == Success ]] || { echo "[alpha-apple-sign-in-env] sync failed with ${status}" >&2; exit 1; }
echo '[alpha-apple-sign-in-env] sync completed'

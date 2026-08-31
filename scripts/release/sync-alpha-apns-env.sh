#!/usr/bin/env bash
# Puts the APNs credentials into the alpha host's runtime env.
#
# Without them `ApnsPushService` starts disabled and every iOS notification is dropped after
# the row is written — the reader sees a notification in the list and no push, which looks
# like the device failed rather than like the server never tried. That is exactly what alpha
# did until this script existed: the deploy injected four secrets and none of them were APNs.
#
# Same shape as sync-alpha-inquiry-slack-env.sh: the value goes to SSM as a SecureString and
# is written into the host's protected `deploy/.env` over SSM, so it never passes through a
# workflow log or an image layer.
#
# The private key is a `.p8` whose PEM is multi-line. It is carried as ONE line with literal
# backslash-n, which is what `ApnsProviderToken` expects (it converts them back). A real
# newline here would end the `.env` assignment early and leave a truncated key that fails at
# signing time with an unhelpful error.
#
# THIS REPOSITORY IS PUBLIC. No key material may appear in it; values come from the
# environment only.
set -Eeuo pipefail
: "${INSTANCE_ID:?INSTANCE_ID is required}"
: "${AWS_REGION:?AWS_REGION is required}"
: "${SECRET_APNS_KEY_ID:?SECRET_APNS_KEY_ID is required}"
: "${SECRET_APNS_TEAM_ID:?SECRET_APNS_TEAM_ID is required}"
: "${SECRET_APNS_BUNDLE_ID:?SECRET_APNS_BUNDLE_ID is required}"
: "${SECRET_APNS_PRIVATE_KEY:?SECRET_APNS_PRIVATE_KEY is required}"
[[ "${INSTANCE_ID}" =~ ^i-[0-9a-f]{17}$ ]]
[[ "${AWS_REGION}" =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]]

# Apple's identifiers are fixed-width; a pasted-with-whitespace value fails much later, at the
# first send, as a 403 that says nothing about which field was wrong.
# A malformed value is worth refusing to write — a broken key on the host fails at send
# time with a 403 that names nothing — but it is NOT worth failing the deploy over. That was
# the original principle for a missing secret and it applies just as much to a wrong one:
# a push-less alpha is a working alpha, a blocked deploy is not. Measured the hard way, by
# blocking one.
for guard in "APNS_KEY_ID:${SECRET_APNS_KEY_ID}:^[A-Z0-9]{10}$" \
             "APNS_TEAM_ID:${SECRET_APNS_TEAM_ID}:^[A-Z0-9]{10}$" \
             "APNS_BUNDLE_ID:${SECRET_APNS_BUNDLE_ID}:^[A-Za-z0-9.-]+$"; do
  name="${guard%%:*}"; rest="${guard#*:}"; value="${rest%:*}"; pattern="${rest##*:}"
  [[ "${value}" =~ ${pattern} ]] || {
    echo "::warning::${name} does not look right (${#value} chars); iOS push stays disabled"
    exit 0
  }
done
# The key arrives in whichever shape the person storing it chose, and all of these are
# reasonable: the .p8 pasted as-is, the same thing already flattened to one line with literal
# backslash-n, or the file base64-encoded — which is what a lot of "how to put a .p8 in CI"
# advice tells people to do. Rejecting the last two would be rejecting a correct key.
#
# Measured: the first version of this script accepted only a raw PEM and failed the deploy
# with "does not look like a .p8 PEM" on a key that was in fact fine.
normalize_private_key() {
  local raw="$1" candidate
  # Already a PEM, in either line form.
  case "${raw}" in
    *"-----BEGIN"*"PRIVATE KEY-----"*) printf '%s' "${raw}"; return 0 ;;
  esac
  # base64 of a PEM. `base64 -d` is lenient about wrapping; a value that is not base64 at all
  # simply fails here and falls through to the caller's warning.
  candidate="$(printf '%s' "${raw}" | tr -d '[:space:]' | base64 -d 2>/dev/null || true)"
  case "${candidate}" in
    *"-----BEGIN"*"PRIVATE KEY-----"*) printf '%s' "${candidate}"; return 0 ;;
  esac
  return 1
}

if ! private_key_pem="$(normalize_private_key "${SECRET_APNS_PRIVATE_KEY}")"; then
  # Shape of the value only — never the value. This is a key.
  echo "::warning::APNS_PRIVATE_KEY is neither a PEM nor base64 of one (${#SECRET_APNS_PRIVATE_KEY} chars); iOS push stays disabled"
  exit 0
fi

# One line, literal \n. A key stored with real newlines truncates the .env assignment, and
# the failure then surfaces much later as an unhelpful signing error.
private_key_one_line="$(printf '%s' "${private_key_pem}" | awk 'BEGIN{ORS="\\n"} {print}')"

names=(APNS_KEY_ID APNS_TEAM_ID APNS_BUNDLE_ID APNS_PRIVATE_KEY)
values=("${SECRET_APNS_KEY_ID}" "${SECRET_APNS_TEAM_ID}" "${SECRET_APNS_BUNDLE_ID}" "${private_key_one_line}")

for index in "${!names[@]}"; do
  aws ssm put-parameter --region "${AWS_REGION}" \
    --name "/teameet/alpha/env/${names[$index]}" \
    --value "${values[$index]}" --type SecureString --overwrite >/dev/null
done

remote_script=$(cat <<REMOTE
set -Eeuo pipefail
env_file=/home/ec2-user/teameet/deploy/.env
[ -f "\${env_file}" ] || { echo '[alpha-apns-env] protected runtime env is missing' >&2; exit 1; }
tmp="\$(mktemp)"
chmod 600 "\${tmp}"
trap 'rm -f "\${tmp}"' EXIT
cp "\${env_file}" "\${tmp}"
for name in APNS_KEY_ID APNS_TEAM_ID APNS_BUNDLE_ID APNS_PRIVATE_KEY; do
  value="\$(aws ssm get-parameter --region ${AWS_REGION} --name /teameet/alpha/env/\${name} --with-decryption --query Parameter.Value --output text)"
  [ -n "\${value}" ] && [ "\${value}" != None ]
  next="\$(mktemp)"
  chmod 600 "\${next}"
  grep -v "^\${name}=" "\${tmp}" > "\${next}" || true
  printf '%s=%s\n' "\${name}" "\${value}" >> "\${next}"
  mv "\${next}" "\${tmp}"
done
chown ec2-user:ec2-user "\${tmp}"
mv "\${tmp}" "\${env_file}"
trap - EXIT
REMOTE
)

parameters="$(jq -nc --arg script "${remote_script}" '{commands:[$script]}')"
command_id="$(aws ssm send-command --region "${AWS_REGION}" --instance-ids "${INSTANCE_ID}" --document-name AWS-RunShellScript --comment 'Teameet alpha APNs env sync' --parameters "${parameters}" --query 'Command.CommandId' --output text)"
aws ssm wait command-executed --region "${AWS_REGION}" --command-id "${command_id}" --instance-id "${INSTANCE_ID}" || true
status="$(aws ssm get-command-invocation --region "${AWS_REGION}" --command-id "${command_id}" --instance-id "${INSTANCE_ID}" --query Status --output text)"
[[ "${status}" == Success ]] || { echo "[alpha-apns-env] sync failed with ${status}" >&2; exit 1; }
echo '[alpha-apns-env] sync completed'

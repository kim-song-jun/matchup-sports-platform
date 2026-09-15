#!/usr/bin/env bash

set -Eeuo pipefail

# 프로덕션 런타임 시크릿을 EC2 의 .env 로 동기화한다. SSH 를 쓰지 않는다.
#
# 왜 Parameter Store 를 거치는가 —
# SSM send-command 의 파라미터는 CloudTrail 과 명령 이력(get-command-invocation)에 그대로
# 남는다. 시크릿을 명령 문자열에 넣으면 그 자체가 유출 경로가 된다. 그래서 값은
# Parameter Store 에 SecureString(KMS) 으로 올리고, SSM 명령에는 **경로만** 실어 보낸다.
# 인스턴스는 자기 IAM role 로 복호화해 읽는다 — 명령 어디에도 평문이 없다.
#
# alpha 에는 이 단계가 없다(운영자가 .env 를 직접 관리). prod 는 워크플로가 GitHub secrets
# 에서 동기화하던 기존 동작을 유지해야 해서 이 경로를 새로 만들었다.
#
# 입력: SECRET_<NAME> 형태의 환경변수. 예) SECRET_KAKAO_CLIENT_ID=... 는 .env 의
#       KAKAO_CLIENT_ID 로 들어간다. 값이 비어 있으면 그 키는 건너뛴다(기존 값 유지).

: "${INSTANCE_ID:?INSTANCE_ID is required}"
: "${AWS_REGION:?AWS_REGION is required}"
PARAM_PREFIX="${PARAM_PREFIX:-/teameet/prod/env}"

[[ "${INSTANCE_ID}" =~ ^i-[0-9a-f]{17}$ ]] || {
  echo "[prod-env] INSTANCE_ID 형식이 올바르지 않습니다 (실제: '${INSTANCE_ID}')" >&2; exit 1; }
[[ "${AWS_REGION}" =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]] || {
  echo "[prod-env] AWS_REGION 형식이 올바르지 않습니다 (실제: '${AWS_REGION}')" >&2; exit 1; }

# shellcheck source=scripts/release/lib/private-key-pem.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/private-key-pem.sh"

# --- private keys -----------------------------------------------------------------------
# The host .env is compose's raw KEY=VALUE form (deploy-prod.sh never sources it), so a value
# must be one line. A PEM pasted with real newlines would turn every line after the first into
# a junk key and take the deploy down with a compose parse error. Each *_PRIVATE_KEY is
# therefore normalised to one line with literal backslash-n, in whichever shape it arrived;
# one that OpenSSL cannot read is dropped with a warning rather than written broken.
#
# Dropped together with its group, not alone. `ApnsPushService` refuses to start on a
# half-configured set ("APNs credentials are partially configured") and the Firebase adapter
# does the same — writing three of four values would take the API down on the next deploy,
# which is worse than leaving push off. The group's earlier values in Parameter Store, if any,
# stay as they were.
# An explicit list, not a *_PRIVATE_KEY glob: VAPID_PRIVATE_KEY is a base64url string, not a
# PEM, and a glob would have "normalised" it into a warning and dropped the web-push key.
for var_name in SECRET_APNS_PRIVATE_KEY SECRET_FIREBASE_PRIVATE_KEY; do
  raw="${!var_name-}"
  [[ -n "${raw}" ]] || continue
  if pem="$(normalize_private_key "${raw}")"; then
    printf -v "${var_name}" '%s' "$(private_key_one_line "${pem}")"
  else
    echo "::warning::${var_name#SECRET_} is not a readable private key (${#raw} chars); it and its group were left unchanged" >&2
    unset "${var_name}"
  fi
done
for group in APNS_KEY_ID:APNS_TEAM_ID:APNS_BUNDLE_ID:APNS_PRIVATE_KEY FIREBASE_PROJECT_ID:FIREBASE_CLIENT_EMAIL:FIREBASE_PRIVATE_KEY; do
  IFS=: read -r -a members <<<"${group}"
  present=0
  for member in "${members[@]}"; do
    value_var="SECRET_${member}"
    [[ -n "${!value_var-}" ]] && present=$((present + 1))
  done
  if (( present > 0 && present < ${#members[@]} )); then
    echo "::warning::${members[0]%%_*} group is incomplete (${present}/${#members[@]} set); none of it was written so the API keeps starting" >&2
    for member in "${members[@]}"; do unset "SECRET_${member}"; done
  fi
done

pushed=0
skipped=0
# `env` 로 SECRET_ 접두사 변수를 훑는다. 값에 개행이 있을 수 있으므로 이름만 뽑고
# 값은 간접 참조로 읽는다.
while IFS= read -r var_name; do
  key="${var_name#SECRET_}"
  [[ "${key}" =~ ^[A-Z][A-Z0-9_]*$ ]] || {
    echo "[prod-env] 키 이름이 올바르지 않아 건너뜁니다: ${key}" >&2
    continue
  }
  value="${!var_name-}"
  if [[ -z "${value}" ]]; then
    skipped=$((skipped + 1))
    continue
  fi
  aws ssm put-parameter --region "${AWS_REGION}" \
    --name "${PARAM_PREFIX}/${key}" --value "${value}" \
    --type SecureString --overwrite >/dev/null
  pushed=$((pushed + 1))
done < <(compgen -v | grep '^SECRET_' || true)

echo "[prod-env] Parameter Store 반영: ${pushed}건 (빈 값이라 건너뜀: ${skipped}건)"
if (( pushed == 0 )); then
  echo "[prod-env] 반영할 값이 없습니다 — .env 동기화를 건너뜁니다" >&2
  exit 0
fi

# 인스턴스에서 .env 를 재구성한다. 파라미터 경로만 넘어가고 값은 넘어가지 않는다.
# 기존 키는 유지하고 Parameter Store 에 있는 키만 덮어쓴다(부분 동기화).
remote_script=$(cat <<REMOTE
set -Eeuo pipefail
runtime_dir=/home/ec2-user/.teameet-prod-runtime
env_file="\${runtime_dir}/.env"
install -d -o ec2-user -g ec2-user -m 700 "\${runtime_dir}"
# 처음부터 600 으로 만든다 — 시크릿을 다 쓴 뒤 chmod 하면 그 사이 world-readable 이 된다.
if [ ! -f "\${env_file}" ]; then
  install -o ec2-user -g ec2-user -m 600 /dev/null "\${env_file}"
fi
tmp="\$(mktemp)"
chmod 600 "\${tmp}"
trap 'rm -f "\${tmp}"' EXIT
cp "\${env_file}" "\${tmp}"
aws ssm get-parameters-by-path --region ${AWS_REGION} --path ${PARAM_PREFIX} \
  --with-decryption --query 'Parameters[].[Name,Value]' --output text |
while IFS=\$'\t' read -r name value; do
  [ -n "\${name}" ] || continue
  key="\${name##*/}"
  # 같은 키가 이미 있으면 지우고 새 값을 덧붙인다.
  grep -v "^\${key}=" "\${tmp}" > "\${tmp}.next" || true
  mv "\${tmp}.next" "\${tmp}"
  printf '%s=%s\n' "\${key}" "\${value}" >> "\${tmp}"
done
chmod 600 "\${tmp}"
chown ec2-user:ec2-user "\${tmp}"
mv "\${tmp}" "\${env_file}"
trap - EXIT
echo "[prod-env] .env 갱신 완료 (\$(wc -l < "\${env_file}") 줄)"
REMOTE
)

parameters="$(jq -nc --arg script "${remote_script}" '{commands:[$script]}')"
command_id="$(aws ssm send-command --region "${AWS_REGION}" --instance-ids "${INSTANCE_ID}" \
  --document-name AWS-RunShellScript --comment "Teameet prod runtime env sync" \
  --parameters "${parameters}" --query 'Command.CommandId' --output text)"
echo "[prod-env] SSM CommandId: ${command_id}"

for attempt in $(seq 1 30); do
  status="$(aws ssm get-command-invocation --region "${AWS_REGION}" --command-id "${command_id}" \
    --instance-id "${INSTANCE_ID}" --query Status --output text 2>/dev/null || true)"
  case "${status}" in
    Success)
      aws ssm get-command-invocation --region "${AWS_REGION}" --command-id "${command_id}" \
        --instance-id "${INSTANCE_ID}" --query StandardOutputContent --output text
      exit 0
      ;;
    Failed|TimedOut|Cancelled|Cancelling)
      echo "[prod-env] .env 동기화가 ${status} 로 끝났습니다" >&2
      aws ssm get-command-invocation --region "${AWS_REGION}" --command-id "${command_id}" \
        --instance-id "${INSTANCE_ID}" --query '{status:Status,stderr:StandardErrorContent}' --output json
      exit 1
      ;;
  esac
  sleep 5
done
echo "[prod-env] 2분 30초 안에 .env 동기화가 끝나지 않았습니다 (CommandId: ${command_id})" >&2
exit 1

#!/usr/bin/env bash

set -Eeuo pipefail

# 프로덕션 웹 이미지에 구워진 서버측 API origin(EXPECTED_INTERNAL_API_ORIGIN, 워크플로의
# PROD_INTERNAL_API_ORIGIN)과 호스트 런타임 .env 의 V1_INTERNAL_API_ORIGIN 이 어긋나지
# 않는지 대조한다. 승인된 deploy job 에서, 런타임 env 동기화 직후 activation 전에 돈다.
#
# 왜 대조인가 — 웹 이미지는 이 값을 빌드 인자로 굽는데(next.config rewrites), 예전에는 승인
# 전 build-images job 이 호스트 .env 를 SSM 으로 읽어 그 값을 썼다. 서버를 읽는 일을 승인
# 전 job 에 둘 수 없어 값은 워크플로 상수로 고정했다. 호스트에 다른 값이 있으면 구워진 값과
# 런타임(compose 가 같은 .env 로 INTERNAL_API_ORIGIN 을 주입)이 갈라지므로, 조용히 덮지
# 않고 activation 전에 멈춘다. 호스트 값이 비어 있으면 compose 기본값이 같은 상수라 통과한다.

need() {
  local name="$1"
  [[ -n "${!name:-}" ]] || { echo "[prod-internal-origin] ${name} is required" >&2; exit 1; }
}
for name in INSTANCE_ID EXPECTED_INTERNAL_API_ORIGIN; do
  need "${name}"
done
[[ "${INSTANCE_ID}" =~ ^i-[0-9a-f]{17}$ ]] || {
  echo "[prod-internal-origin] INSTANCE_ID 형식이 올바르지 않습니다 (실제: '${INSTANCE_ID}')" >&2
  exit 1
}

# sync-prod-runtime-env.sh 가 방금 갱신한 파일이다. 키가 없으면 awk 는 아무것도 출력하지 않는다.
remote_script=$(cat <<'REMOTE'
awk '/^V1_INTERNAL_API_ORIGIN=/ { sub(/^V1_INTERNAL_API_ORIGIN=/, ""); print; exit }' /home/ec2-user/.teameet-prod-runtime/.env
REMOTE
)
parameters="$(jq -nc --arg script "${remote_script}" '{commands:[$script]}')"
command_id="$(aws ssm send-command --instance-ids "${INSTANCE_ID}" \
  --document-name AWS-RunShellScript --comment "Teameet prod read internal api origin" \
  --parameters "${parameters}" --query 'Command.CommandId' --output text)"

host_value=''
resolved=false
for attempt in $(seq 1 30); do
  status="$(aws ssm get-command-invocation --command-id "${command_id}" \
    --instance-id "${INSTANCE_ID}" --query Status --output text 2>/dev/null || true)"
  case "${status}" in
    Success)
      host_value="$(aws ssm get-command-invocation --command-id "${command_id}" \
        --instance-id "${INSTANCE_ID}" --query StandardOutputContent --output json | jq -r '.')"
      resolved=true
      break
      ;;
    Failed|TimedOut|Cancelled|Cancelling)
      echo "[prod-internal-origin] 호스트 .env 를 읽지 못했습니다 (${status})" >&2
      aws ssm get-command-invocation --command-id "${command_id}" --instance-id "${INSTANCE_ID}" \
        --query '{status:Status,stdout:StandardOutputContent,stderr:StandardErrorContent}' --output json >&2 || true
      exit 1
      ;;
  esac
  sleep 2
done
if [[ "${resolved}" != true ]]; then
  echo "[prod-internal-origin] 호스트 .env 조회가 60초 안에 끝나지 않았습니다 (CommandId: ${command_id})" >&2
  exit 1
fi

host_value="$(tr -d '\r\n' <<< "${host_value}")"
if [[ -n "${host_value}" && "${host_value}" != "${EXPECTED_INTERNAL_API_ORIGIN}" ]]; then
  echo "[prod-internal-origin] 호스트 .env 의 V1_INTERNAL_API_ORIGIN 이 웹 이미지에 구워진 값과 다릅니다" >&2
  echo "[prod-internal-origin]   이미지(PROD_INTERNAL_API_ORIGIN): ${EXPECTED_INTERNAL_API_ORIGIN}" >&2
  echo "[prod-internal-origin]   호스트 .env:                      ${host_value}" >&2
  echo "[prod-internal-origin] 호스트 값을 지우거나, 바꾸려는 값이면 워크플로 상수를 고쳐 새 이미지를 빌드하세요" >&2
  exit 1
fi
echo "[prod-internal-origin] ok (host=${host_value:-<unset>}, image=${EXPECTED_INTERNAL_API_ORIGIN})"

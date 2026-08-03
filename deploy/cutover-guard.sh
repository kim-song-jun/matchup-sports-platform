#!/usr/bin/env bash

set -Eeuo pipefail

# cutover-to-rds.sh 의 마지막 안전망. systemd 의 ExecStopPost 로 실행된다.
#
# cutover-to-rds.sh 는 자체 ERR trap 으로 롤백하지만, trap 은 **셸이 계속 살아 있을 때만**
# 동작한다. TimeoutStartSec 초과로 systemd 가 SIGTERM 을 보내거나, OOM killer 가 SIGKILL 을
# 보내면 trap 은 돌지 않는다. 그 경우 남는 상태가 최악이다 — **점검창이 켜진 채로 아무도
# 끄지 않는다.** 새벽 4시 무인 실행이므로 아침까지 503 이 계속될 수 있다.
#
# 그래서 이 스크립트는 서비스가 어떻게 끝났든 한 번 더 실행되어, 되돌려야 할 것이 남아
# 있으면 되돌린다. 성공적으로 끝난 실행에는 아무것도 하지 않는다.

AWS_REGION="${AWS_REGION:-ap-northeast-2}"
PROD_HOME_DIR="${PROD_HOME_DIR:-/home/ec2-user}"
PROD_LIVE_DIR="${PROD_LIVE_DIR:-${PROD_HOME_DIR}/teameet}"
ENV_FILE="${ENV_FILE:-${PROD_HOME_DIR}/.teameet-prod-runtime/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-${PROD_LIVE_DIR}/deploy/docker-compose.prod.yml}"
INTERNAL_HEALTH_URL="${INTERNAL_HEALTH_URL:-http://127.0.0.1:8121/api/v1/health}"
PUBLIC_URL="${PUBLIC_URL:-https://teameet.co.kr/landing}"
# 다른 설정과 마찬가지로 재정의 가능해야 한다 — 이 값이 고정이면 안전망을 실제 상태와
# 분리해서 시험할 방법이 없다(2026-08-03 검증 시도에서 실제로 막혔다).
RUN_ROOT="${RUN_ROOT:-${PROD_HOME_DIR}/.teameet-cutover}"
OPS_TOPIC_ARN="${OPS_TOPIC_ARN:-arn:aws:sns:ap-northeast-2:851725525576:teameet-prod-ops-alerts}"

log() { echo "[cutover-guard] $*"; }

# systemd 가 넣어 주는 값. 정상 종료면 손댈 것이 없다.
if [[ "${SERVICE_RESULT:-}" == "success" ]]; then
  log "정상 종료 — 확인할 것이 없습니다"
  exit 0
fi

log "비정상 종료 감지 (SERVICE_RESULT=${SERVICE_RESULT:-unknown}, EXIT_STATUS=${EXIT_STATUS:-?}) — 잔여 상태를 점검합니다"

# 여기서부터는 **best-effort** 다. errexit 을 끈다.
#
# 이 스크립트는 마지막 안전망인데, `set -e` 가 켜져 있으면 첫 실패에서 그대로 죽는다.
# 예를 들어 점검창 해제(`aws elbv2 modify-rule`)가 스로틀링으로 한 번 실패하면 그 자리에서
# 종료되고, 앱 복구도 SNS 알림도 시도조차 못 한다 — 정작 사람이 알아야 할 상황에서 침묵한다.
# 안전망은 한 단계가 실패해도 나머지를 끝까지 시도해야 의미가 있다. (Copilot 리뷰 지적,
# 2026-08-03 재현으로 확인.)
#
# nounset/pipefail 은 남겨 둔다 — 오타로 빈 변수를 쓰는 사고는 여전히 막아야 한다.
set +e

run_dir="$(find "${RUN_ROOT}" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort | tail -1)"
if [[ -z "${run_dir}" ]]; then
  log "실행 디렉터리를 찾지 못했습니다 — 전환이 시작되기 전에 죽은 것으로 보입니다"
  exit 0
fi
log "대상 실행 디렉터리: ${run_dir}"

# --- 1. 점검창이 켜진 채 남아 있으면 끈다 ------------------------------------
snapshot="${run_dir}/alb-default-rule.json"
if [[ -f "${snapshot}" ]]; then
  rule_arn="$(jq -r '.[0].RuleArn' "${snapshot}" 2>/dev/null)"
  target_group="$(jq -r '.[0].Actions[0].TargetGroupArn // empty' "${snapshot}" 2>/dev/null)"

  current_type="$(aws elbv2 describe-rules --region "${AWS_REGION}" \
    --rule-arns "${rule_arn}" \
    --query 'Rules[0].Actions[0].Type' --output text 2>/dev/null || echo unknown)"

  if [[ "${current_type}" == "fixed-response" && -n "${target_group}" ]]; then
    log "점검창이 켜진 채 남아 있습니다 — 해제합니다"
    # 점검창이 남는 것이 이 작업의 최악 시나리오라, 한 번 실패했다고 포기하지 않는다.
    for attempt in 1 2 3; do
      if aws elbv2 modify-rule --region "${AWS_REGION}" \
        --rule-arn "${rule_arn}" \
        --actions "Type=forward,TargetGroupArn=${target_group}" >/dev/null 2>&1; then
        log "점검창 해제 완료"
        break
      fi
      log "점검창 해제 실패 (${attempt}/3)"
      [[ "${attempt}" == 3 ]] && log "!!! 점검창이 켜진 채 남았습니다 — 즉시 사람이 해제해야 합니다"
      sleep 5
    done
  else
    log "점검창 상태 정상 (현재 액션: ${current_type})"
  fi
else
  log "ALB 스냅샷이 없습니다 — 점검창을 열기 전에 죽은 것으로 보입니다"
fi

# --- 2. 앱이 죽어 있으면 .env 를 되돌리고 다시 띄운다 -------------------------
if curl -fsS --max-time 10 "${INTERNAL_HEALTH_URL}" 2>/dev/null | jq -e '.data.checks.db == true' >/dev/null 2>&1; then
  log "앱 헬스 정상 — 애플리케이션은 손댈 것이 없습니다"
else
  log "앱이 정상이 아닙니다 — 컨테이너 DB 기준으로 되돌립니다"
  env_snapshot="${run_dir}/env.before"
  if [[ -f "${env_snapshot}" ]]; then
    install -m 600 "${env_snapshot}" "${ENV_FILE}"
    log ".env 복원"
  fi

  source "${PROD_LIVE_DIR}/deploy/prod-release-common.sh"
  mapfile -t compose_binary < <(resolve_compose_binary)
  # 이미지 URI 는 .env 가 아니라 릴리스 매니페스트에서 온다. 이걸 빼먹으면 compose 가 빈
  # 이미지 이름으로 앱을 띄우려 하고, 복구하려던 가드가 오히려 장애를 굳힌다.
  # sudoers 의 env_reset 때문에 --preserve-env 도 함께 필요하다.
  guard_manifest="${run_dir}/guard-active-manifest.json"
  if extract_active_manifest "${guard_manifest}" && load_prod_release_manifest "${guard_manifest}"; then
    log "활성 릴리스 이미지 로드: ${PROD_RELEASE_VERSION}"

    compose=(
      sudo --preserve-env=V1_API_IMAGE,V1_WEB_IMAGE "${compose_binary[@]}"
      --project-name deploy
      -f "${COMPOSE_FILE}"
      --env-file "${ENV_FILE}"
    )
    "${compose[@]}" up -d --no-deps v1_api v1_web || log "앱 재기동 실패 — 사람이 개입해야 합니다"

    for _ in $(seq 1 24); do
      if curl -fsS --max-time 10 "${INTERNAL_HEALTH_URL}" 2>/dev/null | jq -e '.data.checks.db == true' >/dev/null 2>&1; then
        log "앱 복구 확인"
        break
      fi
      sleep 5
    done
  else
    # 여기서 스크립트를 끝내면 안 된다. 앱 재기동은 포기하더라도 아래 SNS 알림은 반드시
    # 나가야 한다 — 사람을 불러야 하는 상황이 바로 이 경우다.
    log "!!! 릴리스 매니페스트를 읽지 못했습니다 — 앱 재기동은 건너뜁니다(빈 이미지로 덮어쓰는 것이 더 위험)"
  fi
fi

code="$(curl -sS --no-keepalive -o /dev/null -w '%{http_code}' --max-time 15 "${PUBLIC_URL}" || echo 000)"
log "최종 공개 응답: ${code}"
[[ "${code}" == "200" ]] || log "!!! 공개 응답이 200 이 아닙니다 — 즉시 사람이 확인해야 합니다"

# 여기까지 왔다는 것은 전환 서비스가 비정상 종료했다는 뜻이다. 그 자체로 알릴 가치가 있다.
# SNS 의 Subject 는 ASCII 만 받는다.
aws sns publish --region "${AWS_REGION}" \
  --topic-arn "${OPS_TOPIC_ARN}" \
  --subject "[teameet] RDS cutover guard intervened" \
  --message "전환 서비스가 비정상 종료해(SERVICE_RESULT=${SERVICE_RESULT:-unknown}, EXIT_STATUS=${EXIT_STATUS:-?})
안전망(ExecStopPost)이 실행됐습니다.

최종 공개 응답: ${code}  ← 200 이 아니면 즉시 확인이 필요합니다.
대상 실행 디렉터리: ${run_dir}

journalctl -u teameet-rds-cutover.service 로 전체 로그를 확인하세요." >/dev/null 2>&1 \
  || log "SNS 알림 발행 실패"

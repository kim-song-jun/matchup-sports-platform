#!/usr/bin/env bash

set -Eeuo pipefail

# 컨테이너 Postgres → Amazon RDS 전환. 무인 실행을 전제로 쓴다.
#
# 설계 근거는 docs/ops/rds-migration-design.md, 절차 근거는 docs/ops/rds-cutover-runbook.md.
# 이 스크립트가 지키는 성질은 네 가지다.
#
#  1. **컨테이너 Postgres 를 절대 정지·삭제하지 않는다.** 앱만 세운다. 그래서 롤백은
#     ".env 를 되돌리고 앱을 다시 띄우는 것"으로 끝나고, 되돌릴 데이터가 항상 제자리에 있다.
#  2. **사용자 영향이 생기기 전에 실패할 수 있는 것은 전부 먼저 실패시킨다**(프리플라이트).
#     점검창을 연 뒤에 "RDS 에 붙을 수 없다"를 알게 되는 것이 최악이다.
#  3. **점검창을 연 이후의 모든 실패는 자동 롤백**한다. ERR trap 이 한 곳에서 처리하므로
#     새 단계를 추가해도 롤백 경로를 따로 손볼 필요가 없다.
#  4. **행 수를 테이블 단위로 대조**하기 전에는 전환을 확정하지 않는다. 덤프·복원이 조용히
#     일부만 옮기는 실패 모드를 성공으로 착각하지 않기 위해서다.
#
# 2026-08-03 실측으로 확정한 전제:
#   - RDS 는 컨테이너와 같은 PostgreSQL 16.13, `rds.force_ssl=1`
#   - sslmode 를 지정하지 않은 URL 도 TLSv1.3 으로 접속된다 → compose 의 DATABASE_URL 을
#     고칠 필요가 없다(검증: pg_stat_ssl.ssl = t)
#   - 호스트에는 psql 이 없다 → 모든 psql/pg_dump 는 teameet_v1_postgres 컨테이너를 경유한다
#   - RDS 마스터 사용자명은 `teameet_v1` 로, 앱이 쓰는 사용자명과 같다

RDS_HOST="${RDS_HOST:-teameet-prod-v1.ch0m6cquiuw6.ap-northeast-2.rds.amazonaws.com}"
RDS_PORT="${RDS_PORT:-5432}"
DB_USER="${DB_USER:-teameet_v1}"
DB_NAME="${DB_NAME:-teameet_v1}"
PG_CONTAINER="${PG_CONTAINER:-teameet_v1_postgres}"
RDS_PASSWORD_PARAM="${RDS_PASSWORD_PARAM:-/teameet/prod/rds/MASTER_PASSWORD}"

AWS_REGION="${AWS_REGION:-ap-northeast-2}"
ALB_NAME="${ALB_NAME:-teameet-alb}"
PUBLIC_URL="${PUBLIC_URL:-https://teameet.co.kr/landing}"
ALPHA_URL="${ALPHA_URL:-https://alpha.teameet.co.kr/}"
INTERNAL_HEALTH_URL="${INTERNAL_HEALTH_URL:-http://127.0.0.1:8121/api/v1/health}"

PROD_HOME_DIR="${PROD_HOME_DIR:-/home/ec2-user}"
PROD_LIVE_DIR="${PROD_LIVE_DIR:-${PROD_HOME_DIR}/teameet}"
ENV_FILE="${ENV_FILE:-${PROD_HOME_DIR}/.teameet-prod-runtime/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-${PROD_LIVE_DIR}/deploy/docker-compose.prod.yml}"
# 점검 페이지는 **저장소 체크아웃이 아니라** 별도로 설치된 경로에서 읽는다.
# ${PROD_LIVE_DIR}/docs 는 배포된 릴리스의 내용이라 이 스크립트보다 뒤처져 있을 수 있고,
# 실제로 2026-08-03 시점 호스트에는 docs/ops/maintenance.html 이 없었다(해당 파일이
# 아직 프로덕션에 배포되지 않은 커밋에 있었다). 점검창을 못 여는 것은 전환 자체를 막는
# 실패이므로, 앱 릴리스 주기와 분리해서 /usr/local 아래에 설치한다
# (teameet-backup-db.sh 가 /usr/local/bin 에 설치되는 것과 같은 방식).
MAINTENANCE_HTML="${MAINTENANCE_HTML:-/usr/local/share/teameet/maintenance.html}"

BACKUP_BUCKET="${BACKUP_BUCKET:-teameet-prod-backups-851725525576-ap-northeast-2}"
# 인스턴스 롤의 S3 쓰기 권한은 `pg/*` 하나로 좁혀져 있다(TeameetProdBackupWrite).
# 전환 산출물도 결국 pg_dump 결과물이므로 같은 접두사 안에 둔다 — 이것 하나 때문에
# 권한을 넓히지 않기 위해서다.
S3_PREFIX="${S3_PREFIX:-pg/cutover}"
# 덤프가 이보다 작으면 뭔가 잘못된 것이다. backup-prod-db.sh 와 같은 기준을 쓴다.
MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-1024}"
OPS_TOPIC_ARN="${OPS_TOPIC_ARN:-arn:aws:sns:ap-northeast-2:851725525576:teameet-prod-ops-alerts}"

MODE=rehearse
case "${1:-}" in
  --cutover) MODE=cutover ;;
  --rehearse | '') MODE=rehearse ;;
  *)
    echo "사용법: $0 [--rehearse|--cutover]" >&2
    exit 2
    ;;
esac

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_DIR="${PROD_HOME_DIR}/.teameet-cutover/${RUN_ID}"
install -d -m 700 "$(dirname "${RUN_DIR}")" "${RUN_DIR}"
LOG_FILE="${RUN_DIR}/cutover.log"

log() { echo "[cutover] $*" | tee -a "${LOG_FILE}"; }
fail() { echo "[cutover] $*" >&2; echo "[cutover] $*" >> "${LOG_FILE}"; return 1; }

# 리허설에서 쓰는 임시 DB. 프로덕션 DB 이름과 절대 겹치지 않게 고정한다.
REHEARSAL_DB="teameet_v1_rehearsal"
TARGET_DB="${DB_NAME}"
[[ "${MODE}" == "rehearse" ]] && TARGET_DB="${REHEARSAL_DB}"

# 롤백이 필요한 지점을 통과했는지. 점검창을 연 순간 1 이 된다.
DANGER_ZONE=0
MAINTENANCE_ON=0
ENV_SNAPSHOT=""
ALB_RULE_SNAPSHOT=""
ALB_RULE_ARN=""
ALB_LISTENER_ARN=""
ALB_TARGET_GROUP=""

# ---------------------------------------------------------------------------
# 공통 헬퍼
# ---------------------------------------------------------------------------

# 비밀번호는 argv 에 실리면 `ps` 로 새어 나간다. `docker exec -e VAR`(값 없이)는 호출자
# 환경에서 값을 가져오므로 명령줄에 남지 않는다. sudo 가 환경을 지우지 않도록 -E 를 쓴다.
rds_psql() {
  local db="$1"
  shift
  sudo -E docker exec -e PGPASSWORD -i "${PG_CONTAINER}" \
    psql -h "${RDS_HOST}" -p "${RDS_PORT}" -U "${DB_USER}" -d "${db}" \
    -v ON_ERROR_STOP=1 "$@"
}

local_psql() {
  sudo docker exec -i "${PG_CONTAINER}" \
    psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 "$@"
}

# 테이블별 실제 행 수. `pg_class.reltuples` 는 추정치라 대조에 쓸 수 없어서, 테이블마다
# 진짜 count(*) 를 돌린다(query_to_xml 로 동적 실행). 정렬해서 내보내므로 diff 로 바로 비교된다.
row_count_query() {
  cat <<'SQL'
SELECT format('%s=%s', c.relname,
              (xpath('/row/c/text()',
                     query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname),
                                  false, true, '')))[1]::text::bigint)
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname = 'public'
ORDER BY c.relname;
SQL
}

collect_local_counts() {
  row_count_query | local_psql -tA
}

collect_rds_counts() {
  row_count_query | rds_psql "$1" -tA
}

publish_metric() {
  local value="$1"
  aws cloudwatch put-metric-data \
    --region "${AWS_REGION}" \
    --namespace Teameet/Cutover \
    --metric-name CutoverSuccess \
    --value "${value}" \
    --unit Count >/dev/null 2>&1 \
    || log "CloudWatch 지표 발행 실패 — 전환 결과 자체와는 무관합니다"
}

upload_log() {
  aws s3 cp "${LOG_FILE}" \
    "s3://${BACKUP_BUCKET}/${S3_PREFIX}/${RUN_ID}/cutover.log" \
    --region "${AWS_REGION}" --only-show-errors 2>/dev/null \
    || log "로그 S3 업로드 실패"
}

# aws elbv2 modify-listener 는 API 가 성공을 반환해도 실제 트래픽 경로에 반영되기까지
# 지연이 있다 — 2026-08-04 이 계정/리전에서 격리 실측 시 최대 약 37초(1회 즉시 확인으로는
# 항상 놓치는 수준). 단발성 확인은 두 가지로 위험하다: maintenance_on 에서 쓰면 점검창이
# 실제로는 켜지는 중인데 "실패"로 오판해 불필요한 롤백을 트리거하고, 9단계 최종 확인에서
# 쓰면 **전환 자체는 성공했는데** 점검 해제 반영이 늦었다는 이유만으로 성공한 전환을
# 되돌린다. 그래서 짧은 간격으로 관대하게 재시도한다.
wait_for_public_status() {
  local url="$1" expected="$2" timeout_s="${3:-90}" interval_s="${4:-3}"
  local elapsed=0 code="000"
  while (( elapsed < timeout_s )); do
    code="$(curl -sS --no-keepalive -o /dev/null -w '%{http_code}' --max-time 10 "${url}" || echo 000)"
    if [[ "${code}" == "${expected}" ]]; then
      log "${url} → ${code} 확인 (${elapsed}초 소요)"
      return 0
    fi
    sleep "${interval_s}"
    elapsed=$(( elapsed + interval_s ))
  done
  log "${url} 이 ${timeout_s}초 안에 ${expected} 로 확인되지 않았습니다 (마지막 응답: ${code})"
  return 1
}

# 새벽 무인 실행이라 사람이 화면을 보고 있지 않다. 결과는 반드시 밖으로 나가야 한다.
# SNS 의 Subject 는 ASCII 만 받으므로 제목은 영문으로 쓰고 본문에 한국어를 담는다.
notify() {
  local subject="$1" message="$2"
  aws sns publish --region "${AWS_REGION}" \
    --topic-arn "${OPS_TOPIC_ARN}" \
    --subject "${subject}" \
    --message "${message}" >/dev/null 2>&1 \
    || log "SNS 알림 발행 실패 — 전환 결과 자체와는 무관합니다"
}

# ---------------------------------------------------------------------------
# 점검창 (ALB 고정응답)
# ---------------------------------------------------------------------------

resolve_alb_default_rule() {
  local lb_arn listener_arn
  lb_arn="$(aws elbv2 describe-load-balancers --region "${AWS_REGION}" \
    --names "${ALB_NAME}" --query 'LoadBalancers[0].LoadBalancerArn' --output text)"
  [[ -n "${lb_arn}" && "${lb_arn}" != "None" ]] || fail "ALB ${ALB_NAME} 를 찾을 수 없습니다"

  listener_arn="$(aws elbv2 describe-listeners --region "${AWS_REGION}" \
    --load-balancer-arn "${lb_arn}" \
    --query 'Listeners[?Port==`443`].ListenerArn' --output text)"
  [[ -n "${listener_arn}" && "${listener_arn}" != "None" ]] || fail "443 리스너를 찾을 수 없습니다"
  ALB_LISTENER_ARN="${listener_arn}"
  # 가드(cutover-guard.sh)는 별도 프로세스라 run_dir 파일로만 이 값을 받을 수 있다.
  printf '%s' "${listener_arn}" > "${RUN_DIR}/alb-listener-arn.txt"

  ALB_RULE_SNAPSHOT="${RUN_DIR}/alb-default-rule.json"
  aws elbv2 describe-rules --region "${AWS_REGION}" \
    --listener-arn "${listener_arn}" \
    --query 'Rules[?IsDefault==`true`]' --output json > "${ALB_RULE_SNAPSHOT}"

  ALB_RULE_ARN="$(jq -r '.[0].RuleArn' "${ALB_RULE_SNAPSHOT}")"
  ALB_TARGET_GROUP="$(jq -r '.[0].Actions[0].TargetGroupArn // empty' "${ALB_RULE_SNAPSHOT}")"

  [[ -n "${ALB_RULE_ARN}" && "${ALB_RULE_ARN}" != "null" ]] \
    || fail "기본 규칙 ARN 을 읽을 수 없습니다"
  # 이미 점검 중이면 되돌릴 타깃 그룹을 모른다 — 그 상태로 진행하면 점검을 못 끈다.
  [[ -n "${ALB_TARGET_GROUP}" ]] \
    || fail "기본 규칙이 forward 가 아닙니다(이미 점검 중일 수 있음) — 사람이 먼저 확인해야 합니다"
}

maintenance_on() {
  local body actions body_bytes
  [[ -f "${MAINTENANCE_HTML}" ]] || fail "점검 안내 페이지가 없습니다: ${MAINTENANCE_HTML}"
  body="$(cat "${MAINTENANCE_HTML}")"

  # ALB 고정응답 본문 한도는 1024 **바이트**다. 넘으면 modify-listener 가 거부한다.
  #
  # `${#body}` 로 세면 안 된다 — 그건 로케일에 따라 **문자 수**를 센다. 이 페이지는
  # 한국어라 차이가 크다: 실측(2026-08-03) 750바이트짜리 페이지가 UTF-8 로케일에서는
  # 669 로 나왔다. 즉 1024자(≈1800바이트)까지 이 검사를 통과하고 ALB 에서 거부당한다 —
  # 한도를 넘었을 때 정작 침묵하는 가드가 된다. 바이트로 직접 센다.
  body_bytes="$(printf '%s' "${body}" | wc -c)"
  (( body_bytes <= 1024 )) \
    || fail "점검 페이지가 ALB 한도(1024바이트)를 넘습니다: ${body_bytes}바이트"

  actions="$(jq -n --arg body "${body}" '[{
    Type: "fixed-response",
    FixedResponseConfig: {
      StatusCode: "503",
      ContentType: "text/html",
      MessageBody: $body
    }
  }]')"

  # ELBv2 는 리스너의 **기본 규칙**을 modify-rule 대상으로 허용하지 않는다
  # (`OperationNotPermitted: Default rule ... cannot be modified`, 2026-08-04 실측). 기본
  # 액션을 바꾸려면 modify-listener 로 리스너 자체를 대상으로 해야 한다 — IAM 정책도
  # 리스너 ARN 에 ModifyListener 로 함께 바꿨다(TeameetProdMaintenanceWindow).
  aws elbv2 modify-listener --region "${AWS_REGION}" \
    --listener-arn "${ALB_LISTENER_ARN}" --default-actions "${actions}" >/dev/null
  # 이 두 줄은 반드시 붙어 있어야 한다. 사용자 눈에 보이는 상태가 바뀐 순간이 바로 여기이고,
  # 그 전에 실패한 것(페이지 부재·크기 초과·API 거부)은 되돌릴 것이 없다.
  #
  # DANGER_ZONE 을 호출부에서 maintenance_on 앞에 두면, 아직 아무것도 바꾸지 않은 실패까지
  # "롤백 필요"로 분류해 앱 재기동과 실패 알림을 낸다. 반대로 maintenance_on 이 **반환한 뒤**
  # 로 옮기면 더 나쁘다 — modify-listener 는 성공했는데 아래 503 검증에서 실패하는 경우 롤백이
  # "영향 없음" 경로를 타서 **점검창이 켜진 채 남는다**. 그래서 여기가 유일하게 맞는 자리다.
  MAINTENANCE_ON=1
  DANGER_ZONE=1
  log "점검창 ON"

  # 켜졌는지 확인한다. ALB 전파 지연을 버텨야 하므로 즉시 1회가 아니라 폴링한다.
  wait_for_public_status "${PUBLIC_URL}" 503 \
    || fail "점검창을 켰는데 ${PUBLIC_URL} 이 확인 시간 안에 503 이 되지 않았습니다"
  # alpha 는 우선순위 10 규칙이 따로 처리하므로 계속 살아 있어야 한다.
  local code
  code="$(curl -sS --no-keepalive -o /dev/null -w '%{http_code}' --max-time 15 "${ALPHA_URL}" || echo 000)"
  [[ "${code}" == "200" ]] || log "경고: alpha 가 ${code} 입니다 — 점검창이 alpha 까지 덮었을 수 있습니다"
}

maintenance_off() {
  (( MAINTENANCE_ON == 1 )) || return 0
  aws elbv2 modify-listener --region "${AWS_REGION}" \
    --listener-arn "${ALB_LISTENER_ARN}" \
    --default-actions "Type=forward,TargetGroupArn=${ALB_TARGET_GROUP}" >/dev/null
  MAINTENANCE_ON=0
  log "점검창 OFF"
}

# ---------------------------------------------------------------------------
# 롤백
# ---------------------------------------------------------------------------

rollback() {
  local exit_code=$?

  # `set -E` 는 ERR trap 을 **명령 치환·프로세스 치환·서브셸에도 상속**시킨다. 그래서 `$(...)`
  # 안의 명령이 실패하면 롤백이 그 서브셸 안에서 실행된다. 두 가지가 망가진다.
  #
  #  1. 롤백의 stdout 이 호출부의 변수·배열로 흘러들어간다. 실측(2026-08-03): 프로세스 치환
  #     `< <(resolve_compose_binary)` 이 실패했을 때 `compose_binary` 에 담긴 것은 compose
  #     실행 파일이 아니라 **롤백이 찍은 로그 한 줄**이었다. "배열이 비었는가" 로 실패를
  #     판정하던 가드가 그래서 영원히 통과했다.
  #  2. 알림과 지표가 중복 발행된다 — 서브셸에서 한 번, 바깥 셸에서 다시 한 번.
  #
  # 롤백은 메인 셸에서만 의미가 있다(서브셸에서 exit 해도 서브셸만 끝난다). 상속된 호출은
  # 종료 코드만 그대로 넘기고 빠진다.
  if [[ "${BASHPID}" != "$$" ]]; then
    return "${exit_code}"
  fi

  trap - ERR EXIT

  if (( DANGER_ZONE == 0 )); then
    log "실패했지만 사용자 영향 구간 이전입니다 — 되돌릴 것이 없습니다 (exit ${exit_code})"
    publish_metric 0
    notify "[teameet] RDS cutover aborted before maintenance window" \
      "전환이 프리플라이트 단계에서 중단됐습니다(exit ${exit_code}). 사용자 영향은 없습니다.
실행 ID: ${RUN_ID}
로그: ${LOG_FILE}
$(tail -20 "${LOG_FILE}")"
    upload_log
    exit "${exit_code}"
  fi

  log "!!! 전환 실패 — 컨테이너 DB 로 자동 롤백합니다 (exit ${exit_code})"

  # 롤백 자체가 실패해도 남은 단계는 계속 시도한다. 하나가 막혀서 점검창이 켜진 채로
  # 끝나는 것이 가장 나쁘다.
  set +e

  if [[ -n "${ENV_SNAPSHOT}" && -f "${ENV_SNAPSHOT}" ]]; then
    sudo install -m 600 "${ENV_SNAPSHOT}" "${ENV_FILE}"
    log "롤백: .env 복원"
  fi

  "${compose[@]}" up -d --no-deps v1_api v1_web
  log "롤백: 앱 재기동(컨테이너 DB 기준)"

  # --no-deps 로 v1_api/v1_web 만 재생성하면 새 컨테이너가 새 내부 IP 를 받는다. nginx 는
  # 건드리지 않아 업스트림 IP 를 예전 값으로 계속 붙잡는다 — 내부 헬스체크(포트 8121 직접
  # 접속)는 nginx 를 거치지 않아 통과하지만, 공개 URL 은 "Host is unreachable" 502 로 계속
  # 막힌다(2026-08-04 실제 장애로 확인, 수동 `nginx -s reload` 로 복구). 그래서 컨테이너
  # 재기동 직후 반드시 nginx 를 리로드한다.
  "${compose[@]}" exec -T nginx nginx -s reload 2>&1 | while IFS= read -r line; do log "nginx reload: ${line}"; done
  log "롤백: nginx 리로드(새 컨테이너 IP 반영)"

  local ok=1
  for _ in $(seq 1 36); do
    if curl -fsS --max-time 10 "${INTERNAL_HEALTH_URL}" | jq -e '.data.checks.db == true' >/dev/null 2>&1; then
      ok=0
      break
    fi
    sleep 5
  done
  if (( ok == 0 )); then
    log "롤백: 헬스체크 통과"
  else
    log "롤백: !!! 헬스체크 실패 — 사람이 즉시 개입해야 합니다"
  fi

  maintenance_off

  # ALB 전파 지연을 감안해 폴링한다 — 실패로 로그해도 이 지점은 이미 exit 을 앞두고
  # 있어 fail() 로 다시 걸지는 않는다(무한 재귀 방지), 대신 SNS 본문을 정확히 남긴다.
  local code
  if wait_for_public_status "${PUBLIC_URL}" 200; then
    code=200
  else
    code="$(curl -sS --no-keepalive -o /dev/null -w '%{http_code}' --max-time 15 "${PUBLIC_URL}" || echo 000)"
  fi
  log "롤백 후 공개 응답: ${code}"

  publish_metric 0
  notify "[teameet] RDS cutover FAILED - rolled back to container DB" \
    "전환이 실패해 컨테이너 DB 로 자동 롤백했습니다(exit ${exit_code}).
롤백 후 공개 응답: ${code}  ← 200 이 아니면 즉시 확인이 필요합니다.
실행 ID: ${RUN_ID}
로그: ${LOG_FILE}
$(tail -30 "${LOG_FILE}")"
  upload_log
  exit "${exit_code}"
}

# ---------------------------------------------------------------------------
# 1단계 — 프리플라이트 (사용자 영향 없음)
# ---------------------------------------------------------------------------

log "모드: ${MODE} / 대상 DB: ${TARGET_DB} / 실행 ID: ${RUN_ID}"

# 프리플라이트 실패도 같은 경로로 처리한다. DANGER_ZONE 이 0 이면 rollback 은 되돌리지 않고
# 로그·지표만 남기고 끝낸다 — 무인 실행이라 "왜 안 돌았는지"가 남지 않는 것이 가장 나쁘다.
trap rollback ERR

source "${PROD_LIVE_DIR}/deploy/prod-release-common.sh"

# 프로세스 치환의 종료코드는 mapfile 로 전파되지 않는다 — `mapfile ... < <(f) || fail` 은
# f 가 실패해도 fail 을 부르지 않는다(bash 5.2 실측: 종료코드 0 으로 통과). 그래서 출력을
# 먼저 받아 두고 **종료 코드로** 판정한다.
#
# 호출을 `if` 조건에 두는 것이 중요하다. 조건부 컨텍스트는 errexit 이 면제되므로 상속된
# ERR trap 이 서브셸에서 발화하지 않는다 — 발화하면 롤백 출력이 이 값에 섞인다(rollback()
# 주석 참조). 두 겹으로 막는 셈이고, 둘 중 하나만 있어도 안전하지만 이 줄은 실패했을 때
# 되돌릴 수단 자체를 잃는 자리라 양쪽 다 둔다.
compose_binary=()
if compose_binary_out="$(resolve_compose_binary)"; then
  while IFS= read -r compose_token; do
    [[ -n "${compose_token}" ]] && compose_binary+=("${compose_token}")
  done <<< "${compose_binary_out}"
fi
[[ ${#compose_binary[@]} -gt 0 ]] || fail "compose 실행 파일을 찾지 못했습니다"

# --preserve-env 가 반드시 있어야 한다. compose 는 이미지를 ${V1_API_IMAGE}/${V1_WEB_IMAGE}
# 로 참조하는데 이 값들은 .env 가 아니라 릴리스 매니페스트에서 오고, 이 호스트의
# /etc/sudoers 에는 `Defaults env_reset` 이 걸려 있어 그냥 sudo 로 부르면 root 에 전달되지
# 않는다. deploy-prod.sh / rollback-prod.sh 와 같은 형태를 그대로 쓴다.
compose=(
  sudo --preserve-env=V1_API_IMAGE,V1_WEB_IMAGE "${compose_binary[@]}"
  --project-name deploy
  -f "${COMPOSE_FILE}"
  --env-file "${ENV_FILE}"
)

[[ -f "${ENV_FILE}" ]] || fail "런타임 .env 가 없습니다: ${ENV_FILE}"
[[ -f "${COMPOSE_FILE}" ]] || fail "compose 파일이 없습니다: ${COMPOSE_FILE}"

# 전환은 compose 가 V1_DB_HOST 를 읽을 수 있을 때만 의미가 있다. 이 지원이 없는 릴리스에
# .env 만 고치면 값이 조용히 무시되고, 앱은 컨테이너 DB 를 계속 쓰면서 "전환 성공"으로 보인다.
#
# 리허설은 .env 도 compose 도 건드리지 않으므로 이 지원이 없어도 덤프·복원·행수대조를
# 그대로 검증할 수 있다. 그래서 리허설에서는 경고로만 남긴다 — 릴리스가 배포되기 전에
# 파이프라인을 미리 검증할 수 있어야 전환 당일에 처음 실행하는 일이 없다.
if ! grep -q 'V1_DB_HOST' "${COMPOSE_FILE}"; then
  if [[ "${MODE}" == "cutover" ]]; then
    fail "배포된 compose 가 V1_DB_HOST 를 지원하지 않습니다 — 먼저 해당 릴리스를 프로덕션에 배포해야 합니다"
  fi
  log "경고: 배포된 compose 에 V1_DB_HOST 지원이 없습니다 — 리허설은 계속하지만 이대로면 전환은 거부됩니다"
fi

# 이미 전환된 상태에서 다시 돌면 컨테이너 DB(구 데이터)를 RDS 에 덮어쓸 수 있다.
if grep -q '^V1_DB_HOST=' "${ENV_FILE}"; then
  fail ".env 에 V1_DB_HOST 가 이미 있습니다 — 이미 전환된 것으로 보고 중단합니다"
fi

sudo docker inspect "${PG_CONTAINER}" >/dev/null 2>&1 \
  || fail "컨테이너 ${PG_CONTAINER} 가 없습니다"
[[ "$(sudo docker inspect -f '{{.State.Running}}' "${PG_CONTAINER}")" == "true" ]] \
  || fail "컨테이너 ${PG_CONTAINER} 가 실행 중이 아닙니다"

PGPASSWORD="$(aws ssm get-parameter --name "${RDS_PASSWORD_PARAM}" \
  --with-decryption --region "${AWS_REGION}" --query Parameter.Value --output text)" \
  || fail "RDS 비밀번호 파라미터를 읽지 못했습니다: ${RDS_PASSWORD_PARAM}"
[[ -n "${PGPASSWORD}" && "${PGPASSWORD}" != "None" ]] || fail "RDS 비밀번호가 비어 있습니다"
export PGPASSWORD

# RDS 접속 + 버전 동일성. 메이저 버전이 다르면 덤프 복원이 조용히 어긋날 수 있다.
rds_server_version="$(rds_psql postgres -tAc 'SHOW server_version' | tr -d '[:space:]')" \
  || fail "RDS 에 접속할 수 없습니다"
local_server_version="$(local_psql -tAc 'SHOW server_version' | tr -d '[:space:]')"
log "PostgreSQL — 컨테이너 ${local_server_version} / RDS ${rds_server_version}"
[[ "${rds_server_version%%.*}" == "${local_server_version%%.*}" ]] \
  || fail "메이저 버전이 다릅니다 (컨테이너 ${local_server_version} / RDS ${rds_server_version})"

# 디스크 여유. 덤프는 압축 전 원본 크기만큼 임시로 필요하다.
avail_kb="$(df -Pk / | awk 'NR==2 {print $4}')"
db_bytes="$(local_psql -tAc "SELECT pg_database_size(current_database())")"
need_kb=$(( db_bytes / 1024 * 3 ))
(( avail_kb > need_kb )) \
  || fail "디스크 여유 부족: ${avail_kb}KB 남음, ${need_kb}KB 필요"
log "디스크 여유 ${avail_kb}KB / 필요 ${need_kb}KB"

resolve_alb_default_rule
log "ALB 기본 규칙 확인: ${ALB_RULE_ARN}"

# 지금 떠 있는 릴리스의 이미지 URI 를 확보한다. 이것 없이 compose 를 부르면 이미지 이름이
# 빈 문자열이 되어, 앱을 정지시킨 뒤 **다시 띄우지 못한다** — 롤백 경로도 같은 compose 를
# 쓰므로 함께 죽는다. 리허설(2026-08-03)에서 실제로 이 상태가 잡혔다.
[[ -f "${PROD_RELEASE_STATE_FILE}" ]] \
  || fail "릴리스 상태 파일이 없습니다: ${PROD_RELEASE_STATE_FILE}"
ACTIVE_MANIFEST="${RUN_DIR}/active-manifest.json"
extract_active_manifest "${ACTIVE_MANIFEST}" \
  || fail "활성 릴리스 매니페스트를 읽지 못했습니다"
load_prod_release_manifest "${ACTIVE_MANIFEST}" \
  || fail "릴리스 매니페스트에서 이미지 URI 를 읽지 못했습니다"
log "활성 릴리스: ${PROD_RELEASE_VERSION} (${PROD_RELEASE_SHA:0:8})"

assert_compose_variables_resolve "${compose[@]}" \
  || fail "현재 compose 설정이 해석되지 않습니다 — 전환 전에 먼저 고쳐야 합니다"

log "프리플라이트 통과"

# ---------------------------------------------------------------------------
# 2단계 — 롤백 자산 확보
# ---------------------------------------------------------------------------

ENV_SNAPSHOT="${RUN_DIR}/env.before"
sudo install -m 600 "${ENV_FILE}" "${ENV_SNAPSHOT}"
log "롤백 자산 확보: ${ENV_SNAPSHOT}, ${ALB_RULE_SNAPSHOT}"

# ---------------------------------------------------------------------------
# 3단계 — 점검창 + 앱 정지 (cutover 모드만)
# ---------------------------------------------------------------------------

if [[ "${MODE}" == "cutover" ]]; then
  # DANGER_ZONE 은 maintenance_on() 안에서 ALB 를 실제로 바꾼 직후에 세운다 — 이유는 그 자리 주석 참조.
  maintenance_on

  # DB 컨테이너는 살려 둔다 — 이것이 롤백 경로 전체를 지탱한다.
  "${compose[@]}" stop v1_api v1_web
  log "앱 컨테이너 정지 (v1_postgres 는 유지)"
  # 정지 직후에도 열려 있는 커넥션이 남을 수 있다. 덤프 일관성을 위해 잠시 기다린다.
  sleep 5
fi

# ---------------------------------------------------------------------------
# 4단계 — 원본 행 수 수집
# ---------------------------------------------------------------------------

BEFORE_COUNTS="${RUN_DIR}/counts.before"
collect_local_counts > "${BEFORE_COUNTS}"
before_tables="$(grep -c '=' "${BEFORE_COUNTS}" || true)"
log "원본 테이블 ${before_tables}개 행 수 수집"
(( before_tables > 0 )) || fail "원본에서 테이블을 하나도 찾지 못했습니다"

# ---------------------------------------------------------------------------
# 5단계 — 덤프
# ---------------------------------------------------------------------------

DUMP_FILE="${RUN_DIR}/${DB_NAME}.sql"
sudo docker exec "${PG_CONTAINER}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" > "${DUMP_FILE}"
dump_size="$(stat -c %s "${DUMP_FILE}")"
(( dump_size >= MIN_DUMP_BYTES )) || fail "덤프가 너무 작습니다: ${dump_size} bytes"
log "덤프 완료: ${dump_size} bytes"

# 전환 직전 덤프는 되돌릴 수 없는 시점의 유일한 사본이다. S3 에 먼저 올린다.
gzip -9 -c "${DUMP_FILE}" > "${DUMP_FILE}.gz"
aws s3 cp "${DUMP_FILE}.gz" \
  "s3://${BACKUP_BUCKET}/${S3_PREFIX}/${RUN_ID}/${DB_NAME}.sql.gz" \
  --region "${AWS_REGION}" --only-show-errors \
  || fail "전환 직전 덤프를 S3 에 올리지 못했습니다"
log "전환 직전 덤프 S3 업로드 완료"

# ---------------------------------------------------------------------------
# 6단계 — RDS 초기화 + 복원
# ---------------------------------------------------------------------------

# 리허설 DB 는 매번 새로 만든다. 프로덕션 DB 는 이미 존재하므로 스키마만 비운다.
if [[ "${MODE}" == "rehearse" ]]; then
  rds_psql postgres -c "DROP DATABASE IF EXISTS ${REHEARSAL_DB}" >/dev/null
  rds_psql postgres -c "CREATE DATABASE ${REHEARSAL_DB}" >/dev/null
  log "리허설 DB 재생성: ${REHEARSAL_DB}"
fi

# public 스키마를 통째로 비운다. `pg_dump --clean` 은 덤프에 있는 객체만 지우므로,
# 리허설 등으로 먼저 들어간 객체가 남아 조용히 섞일 수 있다. 실측(2026-08-03) 기준
# RDS 에는 이미 리허설 복원본 72개 테이블이 있었다.
rds_psql "${TARGET_DB}" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" >/dev/null
log "RDS ${TARGET_DB} 스키마 초기화"

rds_psql "${TARGET_DB}" -q < "${DUMP_FILE}" > "${RUN_DIR}/restore.log" 2>&1 \
  || { tail -30 "${RUN_DIR}/restore.log" >&2; fail "RDS 복원 실패 — 자세한 내용은 ${RUN_DIR}/restore.log"; }
log "RDS 복원 완료"

# ---------------------------------------------------------------------------
# 7단계 — 행 수 대조
# ---------------------------------------------------------------------------

AFTER_COUNTS="${RUN_DIR}/counts.after"
collect_rds_counts "${TARGET_DB}" > "${AFTER_COUNTS}"

if ! diff -u "${BEFORE_COUNTS}" "${AFTER_COUNTS}" > "${RUN_DIR}/counts.diff"; then
  cat "${RUN_DIR}/counts.diff" >&2
  fail "행 수가 일치하지 않습니다 — ${RUN_DIR}/counts.diff 참조"
fi
log "행 수 대조 통과: ${before_tables}개 테이블 전부 일치"

if [[ "${MODE}" == "rehearse" ]]; then
  rds_psql postgres -c "DROP DATABASE IF EXISTS ${REHEARSAL_DB}" >/dev/null
  log "리허설 DB 정리 완료"
  log "리허설 성공 — 실제 전환은 --cutover 로 실행합니다"
  trap - ERR
  publish_metric 1
  upload_log
  exit 0
fi

# ---------------------------------------------------------------------------
# 8단계 — .env 전환 + 앱 기동
# ---------------------------------------------------------------------------

# compose 는 이 파일을 --env-file 로 직접 읽는다. 셸이 해석하지 않으므로 따옴표를 쓰지
# 않는다(따옴표를 붙이면 compose 가 값의 일부로 읽는다).
ENV_NEXT="${RUN_DIR}/env.after"
{
  cat "${ENV_SNAPSHOT}"
  printf 'V1_DB_HOST=%s\n' "${RDS_HOST}"
  printf 'V1_DB_APP_PASSWORD=%s\n' "${PGPASSWORD}"
} > "${ENV_NEXT}"
chmod 600 "${ENV_NEXT}"
sudo install -m 600 "${ENV_NEXT}" "${ENV_FILE}"
log ".env 전환 완료 (V1_DB_HOST=${RDS_HOST})"

# 전환된 설정이 실제로 RDS 를 가리키는지 compose 에게 직접 물어본다.
"${compose[@]}" config 2>/dev/null | grep -q "@${RDS_HOST}:" \
  || fail "compose 가 해석한 DATABASE_URL 이 RDS 를 가리키지 않습니다"
log "compose 해석 결과가 RDS 를 가리킴을 확인"

"${compose[@]}" up -d --no-deps v1_api v1_web
log "앱 기동"

# --no-deps 로 재생성된 컨테이너는 새 내부 IP 를 받는다 — nginx 를 리로드하지 않으면
# 업스트림이 예전 IP 를 계속 붙잡아 공개 URL 이 "Host is unreachable" 502 를 낸다
# (2026-08-04 롤백 경로에서 실제 장애로 확인, 성공 경로도 같은 코드로 컨테이너를
# 재기동하므로 동일하게 필요하다).
"${compose[@]}" exec -T nginx nginx -s reload 2>&1 | while IFS= read -r line; do log "nginx reload: ${line}"; done
log "nginx 리로드(새 컨테이너 IP 반영)"

# ---------------------------------------------------------------------------
# 9단계 — 검증
# ---------------------------------------------------------------------------

healthy=1
for _ in $(seq 1 36); do
  if curl -fsS --max-time 10 "${INTERNAL_HEALTH_URL}" | jq -e '.data.checks.db == true' >/dev/null 2>&1; then
    healthy=0
    break
  fi
  sleep 5
done
(( healthy == 0 )) || fail "내부 헬스체크가 db=true 를 반환하지 않습니다"
log "내부 헬스체크 통과 (db=true)"

# 앱이 정말 RDS 를 보고 있는지 확인한다. 헬스체크만으로는 컨테이너 DB 에 붙어 있어도 통과한다.
api_container="$("${compose[@]}" ps -q v1_api)"
sudo docker exec "${api_container}" sh -c 'echo "$DATABASE_URL"' | grep -q "@${RDS_HOST}:" \
  || fail "실행 중인 v1_api 의 DATABASE_URL 이 RDS 를 가리키지 않습니다"
log "실행 중인 컨테이너가 RDS 를 사용 중임을 확인"

# RDS 쪽에서도 앱 커넥션이 보이는지 본다 — 양방향으로 확인해야 착각이 없다.
conn_count="$(rds_psql "${TARGET_DB}" -tAc \
  "SELECT count(*) FROM pg_stat_activity WHERE datname='${TARGET_DB}' AND application_name <> 'psql'")"
log "RDS 측 앱 커넥션 수: ${conn_count}"
(( conn_count > 0 )) || fail "RDS 에 앱 커넥션이 보이지 않습니다"

maintenance_off

# 전환 자체는 이미 끝났다 — 여기서 ALB 전파 지연 때문에 fail() 하면 **성공한 전환을
# 불필요하게 되돌린다.** 그래서 폴링으로 확인한다.
wait_for_public_status "${PUBLIC_URL}" 200 \
  || fail "점검 해제 후 ${PUBLIC_URL} 이 확인 시간 안에 200 이 되지 않았습니다 — 전환 자체는 끝났으니 ALB 상태를 직접 확인하세요"
# 아래 완료 알림(notify)의 "공개 응답" 문구가 이 값을 쓴다. wait_for_public_status 는
# 성공 여부만 반환하므로, 여기서 통과했다는 사실 자체가 200 이 확인됐다는 뜻이다.
code=200
log "공개 검증 통과: ${PUBLIC_URL} → 200"

# ---------------------------------------------------------------------------
# 완료
# ---------------------------------------------------------------------------

trap - ERR
publish_metric 1
log "전환 완료. 컨테이너 Postgres 는 정지하지 않고 그대로 뒀습니다 — 롤백 창이 유지됩니다."
log "롤백이 필요하면: sudo install -m 600 ${ENV_SNAPSHOT} ${ENV_FILE} && 앱 재기동"
notify "[teameet] RDS cutover SUCCESS" \
    "컨테이너 Postgres → RDS 전환이 완료됐습니다.
대상: ${RDS_HOST}
대조한 테이블: ${before_tables}개 (행 수 전부 일치)
공개 응답: ${code}
실행 ID: ${RUN_ID}

컨테이너 Postgres 는 정지하지 않았습니다 — 롤백 창이 유지됩니다.
롤백: sudo install -m 600 ${ENV_SNAPSHOT} ${ENV_FILE} 후 앱 재기동"
upload_log

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
  local body actions
  [[ -f "${MAINTENANCE_HTML}" ]] || fail "점검 안내 페이지가 없습니다: ${MAINTENANCE_HTML}"
  body="$(cat "${MAINTENANCE_HTML}")"
  # ALB 고정응답 본문 한도는 1024 바이트다. 넘으면 modify-rule 이 거부한다.
  (( ${#body} <= 1024 )) || fail "점검 페이지가 ALB 한도(1024바이트)를 넘습니다: ${#body}"

  actions="$(jq -n --arg body "${body}" '[{
    Type: "fixed-response",
    FixedResponseConfig: {
      StatusCode: "503",
      ContentType: "text/html",
      MessageBody: $body
    }
  }]')"

  aws elbv2 modify-rule --region "${AWS_REGION}" \
    --rule-arn "${ALB_RULE_ARN}" --actions "${actions}" >/dev/null
  MAINTENANCE_ON=1
  log "점검창 ON"

  # 켜졌는지 확인한다. --no-keepalive 로 새 연결을 강제해야 기존 연결의 응답을 보지 않는다.
  local code
  code="$(curl -sS --no-keepalive -o /dev/null -w '%{http_code}' --max-time 15 "${PUBLIC_URL}" || echo 000)"
  [[ "${code}" == "503" ]] || fail "점검창을 켰는데 ${PUBLIC_URL} 이 ${code} 입니다"
  # alpha 는 우선순위 10 규칙이 따로 처리하므로 계속 살아 있어야 한다.
  code="$(curl -sS --no-keepalive -o /dev/null -w '%{http_code}' --max-time 15 "${ALPHA_URL}" || echo 000)"
  [[ "${code}" == "200" ]] || log "경고: alpha 가 ${code} 입니다 — 점검창이 alpha 까지 덮었을 수 있습니다"
}

maintenance_off() {
  (( MAINTENANCE_ON == 1 )) || return 0
  aws elbv2 modify-rule --region "${AWS_REGION}" \
    --rule-arn "${ALB_RULE_ARN}" \
    --actions "Type=forward,TargetGroupArn=${ALB_TARGET_GROUP}" >/dev/null
  MAINTENANCE_ON=0
  log "점검창 OFF"
}

# ---------------------------------------------------------------------------
# 롤백
# ---------------------------------------------------------------------------

rollback() {
  local exit_code=$?
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

  local code
  code="$(curl -sS --no-keepalive -o /dev/null -w '%{http_code}' --max-time 15 "${PUBLIC_URL}")"
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

mapfile -t compose_binary < <(resolve_compose_binary) || fail "compose 실행 파일을 찾지 못했습니다"

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
  DANGER_ZONE=1
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

code="$(curl -sS --no-keepalive -o /dev/null -w '%{http_code}' --max-time 15 "${PUBLIC_URL}")"
[[ "${code}" == "200" ]] || fail "점검 해제 후 ${PUBLIC_URL} 이 ${code} 입니다"
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

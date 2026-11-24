#!/usr/bin/env bash

set -Eeuo pipefail

# 운영 DB(RDS) 논리 백업 → S3. systemd 타이머(deploy/systemd/teameet-backup-db.timer)가 매일 돌린다.
#
# 접속 정보는 실행 중인 API 컨테이너의 DATABASE_URL 이다 — 앱이 실제로 쓰는 DB 를 뜬다. 비밀번호는
# 명령줄 인자·로그에 싣지 않는다: libpq 환경변수(PG*)로 나눠 0600 임시 파일로만 일회용 클라이언트
# 컨테이너에 넘긴다. pg_dump 는 서버보다 주 버전이 낮으면 거부하므로, RDS 주 버전을 올리면
# BACKUP_PG_CLIENT_IMAGE 도 같은 주 버전 이상으로 올린다.
#
# source 하면 함수만 정의하고 백업은 돌지 않는다. prod_db_client 로 운영 DB 를 읽기 전용으로 조회할 때
# 쓴다(docs/ops/prod-backup.md).

# Docker Hub 공식 이미지의 ECR Public 사본(같은 digest). Docker Hub 익명 받기는 IP 당 한도에 자주 걸린다.
BACKUP_PG_CLIENT_IMAGE="${BACKUP_PG_CLIENT_IMAGE:-public.ecr.aws/docker/library/postgres:16.15-alpine3.24@sha256:aa6cb33cf4c19c765cefcf48d96176258800870a9a1e930ad126200f9d825139}"
BACKUP_API_CONTAINER="${BACKUP_API_CONTAINER:-teameet_v1_api}"
# 앱 컨테이너와 같은 네트워크로 붙는다 — 앱이 DB 에 닿는 경로 그대로다.
BACKUP_DOCKER_NETWORK="${BACKUP_DOCKER_NETWORK:-deploy_default}"
AWS_REGION="${AWS_REGION:-ap-northeast-2}"
# 덤프가 이보다 작으면 빈 DB·권한 오류·조기 종료다. 올려 두면 복구할 때에야 안다.
MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-1024}"
read -r -a BACKUP_DOCKER <<< "${BACKUP_DOCKER_CMD:-sudo docker}"

backup_log() { echo "[prod-backup] $*"; }

# URL 의 %XX 를 푼다. 원문의 백슬래시는 printf 가 해석하지 않게 먼저 감싼다.
_backup_url_decode() {
  local s="${1//\\/\\\\}"
  printf '%b' "${s//%/\\x}"
}

# 실행 중인 API 컨테이너의 DATABASE_URL 을 libpq 환경변수 줄로 바꿔 stdout 에 낸다(docker --env-file 형식).
# 운영 API 가 옛 DB 컨테이너나 자기 자신을 가리키면 거부한다 — 운영 DB 는 RDS 다.
prod_db_env() {
  local url rest db userinfo hostport user password host port

  url="$("${BACKUP_DOCKER[@]}" inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "${BACKUP_API_CONTAINER}" \
    | sed -n 's/^DATABASE_URL=//p')" || {
    backup_log "${BACKUP_API_CONTAINER} 컨테이너의 환경을 읽지 못했습니다"
    return 1
  }
  if [[ ! "${url}" =~ ^postgres(ql)?:// ]]; then
    backup_log "${BACKUP_API_CONTAINER} 컨테이너에 postgres DATABASE_URL 이 없습니다"
    return 1
  fi

  rest="${url#*://}"
  rest="${rest%%\?*}"
  db="${rest#*/}"
  [[ "${db}" != "${rest}" ]] || db=''
  rest="${rest%%/*}"
  hostport="${rest##*@}"
  userinfo=''
  [[ "${hostport}" == "${rest}" ]] || userinfo="${rest%@*}"
  user="${userinfo%%:*}"
  password=''
  [[ "${userinfo}" != *:* ]] || password="${userinfo#*:}"
  host="${hostport%%:*}"
  port=5432
  [[ "${hostport}" != *:* ]] || port="${hostport##*:}"

  case "${host}" in
    '' | v1_postgres | teameet_v1_postgres | localhost | 127.0.0.1)
      backup_log "운영 API 의 DATABASE_URL 이 운영 DB(RDS)가 아닌 '${host}' 를 가리킵니다 — 백업하지 않습니다"
      return 1
      ;;
  esac
  if [[ -z "${user}" || -z "${db}" || ! "${port}" =~ ^[0-9]+$ ]]; then
    backup_log "DATABASE_URL 에서 사용자·DB 이름·포트를 읽지 못했습니다"
    return 1
  fi

  printf 'PGHOST=%s\nPGPORT=%s\nPGDATABASE=%s\nPGUSER=%s\nPGPASSWORD=%s\n' \
    "${host}" "${port}" "$(_backup_url_decode "${db}")" "$(_backup_url_decode "${user}")" "$(_backup_url_decode "${password}")"
  printf 'PGOPTIONS=-c default_transaction_read_only=on\nPGCONNECT_TIMEOUT=10\nPGAPPNAME=teameet-prod-db-client\n'
}

# 운영 DB 에 일회용 클라이언트 컨테이너로 붙는다: prod_db_client <명령…>  (예: psql -X -At -c 'select 1')
# 세션은 읽기 전용이다. 표준입력은 컨테이너로 넘긴다 — 넘길 것이 없으면 호출자가 </dev/null 을 붙인다.
# 로그 드라이버를 끈다: 켜 두면 표준출력(덤프 등)이 서버 디스크의 컨테이너 로그에도 그대로 쌓인다.
prod_db_client() {
  local dir rc tty=()

  dir="$(mktemp -d)" || return 1
  if ! (umask 077 && prod_db_env > "${dir}/pg.env"); then
    rm -rf "${dir}"
    return 1
  fi
  [[ ! -t 0 || ! -t 1 ]] || tty=(-t)
  "${BACKUP_DOCKER[@]}" run --rm -i ${tty[@]+"${tty[@]}"} --log-driver none \
    --network "${BACKUP_DOCKER_NETWORK}" --env-file "${dir}/pg.env" \
    "${BACKUP_PG_CLIENT_IMAGE}" "$@" && rc=0 || rc=$?
  rm -rf "${dir}"
  return "${rc}"
}

# 덤프 목차에서 "테이블 수 데이터항목 수 _prisma_migrations 유무" 를 센다.
backup_toc_counts() {
  awk '
    $1 ~ /^[0-9]+;$/ && $4 == "TABLE" && $5 == "DATA" { data++; next }
    $1 ~ /^[0-9]+;$/ && $4 == "TABLE" { tables++; if ($6 == "_prisma_migrations") ledger = 1 }
    END { printf "%d %d %d\n", tables, data, ledger }
  '
}

# CloudWatch 하트비트. 성공했을 때만 1 을 올린다 — 알람은 "지표 없음"을 위반으로 보므로 스크립트 실패뿐
# 아니라 타이머가 안 돌았거나 인스턴스가 꺼져 있던 경우도 잡힌다.
publish_heartbeat() {
  aws cloudwatch put-metric-data \
    --region "${AWS_REGION}" \
    --namespace Teameet/Backup \
    --metric-name BackupSuccess \
    --value 1 \
    --unit Count >/dev/null 2>&1 \
    || backup_log "하트비트 지표 발행 실패 — 백업 자체는 성공했습니다"
}

backup_main() {
  local workdir dump stamp key size toc tables data ledger

  : "${BACKUP_BUCKET:?BACKUP_BUCKET 이 없습니다 — /etc/teameet/backup-db.env 에 넣으세요}"
  umask 077
  workdir="$(mktemp -d)"
  # shellcheck disable=SC2064 # 지금 정해진 경로를 지운다.
  trap "rm -rf '${workdir}'" EXIT
  dump="${workdir}/db.dump"

  # custom 형식(-Fc)은 압축돼 있고 pg_restore 로 목차를 읽거나 테이블 하나만 되돌릴 수 있다.
  # 다른 세션의 DDL 을 무한정 기다리지 않게 잠금 대기를 끊는다.
  if ! prod_db_client pg_dump --format=custom --no-password --lock-wait-timeout=60s < /dev/null > "${dump}"; then
    backup_log "pg_dump 실패"
    return 1
  fi

  size="$(wc -c < "${dump}" | tr -d ' ')"
  if (( size < MIN_DUMP_BYTES )); then
    backup_log "덤프가 너무 작습니다 (${size} bytes) — 업로드하지 않습니다"
    return 1
  fi

  if ! toc="$("${BACKUP_DOCKER[@]}" run --rm -i --log-driver none --network none \
    "${BACKUP_PG_CLIENT_IMAGE}" pg_restore --list < "${dump}")"; then
    backup_log "pg_restore 가 덤프 목차를 읽지 못했습니다"
    return 1
  fi
  read -r tables data ledger < <(backup_toc_counts <<< "${toc}")
  if (( tables == 0 || data == 0 || ledger != 1 )); then
    backup_log "덤프 목차가 앱 DB 가 아닙니다 (테이블 ${tables}개, 데이터 ${data}개, _prisma_migrations ${ledger}) — 업로드하지 않습니다"
    return 1
  fi

  # 일일 덤프는 pg/daily/ 아래에만 둔다 — 보존 규칙(lifecycle)이 이 접두어를 지운다.
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  key="pg/daily/${stamp:0:4}/${stamp:4:2}/${stamp:6:2}/teameet-v1-${stamp}.dump"
  if ! aws s3 cp "${dump}" "s3://${BACKUP_BUCKET}/${key}" --region "${AWS_REGION}" --only-show-errors; then
    backup_log "S3 업로드 실패"
    return 1
  fi

  backup_log "s3://${BACKUP_BUCKET}/${key} (${size} bytes, 테이블 ${tables}개, 데이터 항목 ${data}개)"
  publish_heartbeat
  backup_log "백업 완료"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  backup_main "$@"
fi

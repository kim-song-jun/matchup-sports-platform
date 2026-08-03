#!/usr/bin/env bash

set -Eeuo pipefail

# 백업 복원 리허설. **운영 DB 를 건드리지 않는다** — 임시 Postgres 컨테이너를 따로 띄워서
# S3 의 최신 덤프를 복원하고, 끝나면 컨테이너와 볼륨을 지운다.
#
# 왜 필요한가: 덤프 파일이 존재하고 gzip 이 풀린다고 해서 복원되는 것은 아니다. 권한 누락,
# 확장(extension) 부재, 순서 의존 같은 이유로 복원 단계에서 처음 깨지는 경우가 흔하고,
# 그걸 진짜 장애 상황에서 알게 되면 이미 늦다. 백업은 복원해 본 적이 있을 때만 백업이다.
#
# psql 은 ON_ERROR_STOP=1 로 실행한다 — 기본값은 오류가 나도 계속 진행해서, 절반만 복원된
# DB 를 "성공"으로 보고하게 된다.

BACKUP_BUCKET="${BACKUP_BUCKET:-teameet-prod-backups-851725525576-ap-northeast-2}"
AWS_REGION="${AWS_REGION:-ap-northeast-2}"
LABEL="${LABEL:-v1}"
PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"
# 운영 컨테이너와 절대 이름이 겹치지 않게 한다. 포트도 퍼블리시하지 않는다.
SCRATCH_CONTAINER="teameet-restore-rehearsal"
SCRATCH_VOLUME="teameet_restore_rehearsal_data"
SCRATCH_DB="rehearsal"
SCRATCH_USER="rehearsal"
# 리허설 전용 일회성 비밀번호. 이 컨테이너는 네트워크에 노출되지 않고 즉시 파기된다.
SCRATCH_PASSWORD="$(while true; do p="$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"; [[ ${#p} -ge 16 ]] && { echo "$p"; break; }; done)"

log() { echo "[restore-rehearsal] $*"; }

cleanup() {
  log "정리 중"
  sudo docker rm -f "${SCRATCH_CONTAINER}" >/dev/null 2>&1 || true
  sudo docker volume rm "${SCRATCH_VOLUME}" >/dev/null 2>&1 || true
  rm -f "${dump_file:-}" 2>/dev/null || true
}
trap cleanup EXIT

# 혹시 이전 리허설 잔재가 있으면 먼저 치운다 — 남아 있으면 옛 데이터로 복원해 놓고
# 성공했다고 착각할 수 있다.
sudo docker rm -f "${SCRATCH_CONTAINER}" >/dev/null 2>&1 || true
sudo docker volume rm "${SCRATCH_VOLUME}" >/dev/null 2>&1 || true

latest_key="$(aws s3 ls "s3://${BACKUP_BUCKET}/pg/${LABEL}/" --recursive --region "${AWS_REGION}" \
  | sort | tail -1 | awk '{print $4}')"
if [[ -z "${latest_key}" ]]; then
  log "${LABEL}: S3 에 덤프가 없습니다"
  exit 1
fi
log "대상 덤프: s3://${BACKUP_BUCKET}/${latest_key}"

dump_file="$(mktemp)"
aws s3 cp "s3://${BACKUP_BUCKET}/${latest_key}" "${dump_file}" --region "${AWS_REGION}" --only-show-errors
gunzip -t "${dump_file}" || { log "gzip 무결성 실패"; exit 1; }

log "임시 Postgres 기동"
sudo docker run -d --name "${SCRATCH_CONTAINER}" \
  -v "${SCRATCH_VOLUME}:/var/lib/postgresql/data" \
  -e POSTGRES_USER="${SCRATCH_USER}" \
  -e POSTGRES_PASSWORD="${SCRATCH_PASSWORD}" \
  -e POSTGRES_DB="${SCRATCH_DB}" \
  "${PG_IMAGE}" >/dev/null

ready=false
for _ in $(seq 1 30); do
  if sudo docker exec "${SCRATCH_CONTAINER}" pg_isready -U "${SCRATCH_USER}" -d "${SCRATCH_DB}" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 2
done
[[ "${ready}" == true ]] || { log "임시 Postgres 가 준비되지 않았습니다"; exit 1; }

log "복원 시작"
# 덤프는 원본 role(teameet_v1) 소유로 뜨므로, 그 role 이 없으면 GRANT/OWNER 문에서 깨진다.
sudo docker exec "${SCRATCH_CONTAINER}" psql -U "${SCRATCH_USER}" -d "${SCRATCH_DB}" \
  -v ON_ERROR_STOP=1 -c "CREATE ROLE teameet_v1 LOGIN" >/dev/null 2>&1 || true

if ! gunzip -c "${dump_file}" \
  | sudo docker exec -i "${SCRATCH_CONTAINER}" psql -U "${SCRATCH_USER}" -d "${SCRATCH_DB}" \
      -v ON_ERROR_STOP=1 --quiet > /tmp/restore-rehearsal.log 2>&1; then
  log "복원 실패 — 마지막 오류:"
  tail -20 /tmp/restore-rehearsal.log >&2
  exit 1
fi
log "복원 완료 — SQL 오류 없음"

q() { sudo docker exec "${SCRATCH_CONTAINER}" psql -U "${SCRATCH_USER}" -d "${SCRATCH_DB}" -tAc "$1"; }

tables="$(q "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")"
rows="$(q "select coalesce(sum(cnt),0) from (select (xpath('/row/c/text()', query_to_xml(format('select count(*) c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint cnt from information_schema.tables where table_schema='public' and table_type='BASE TABLE') s")"
fks="$(q "select count(*) from information_schema.table_constraints where table_schema='public' and constraint_type='FOREIGN KEY'")"
indexes="$(q "select count(*) from pg_indexes where schemaname='public'")"

log "복원 결과: 테이블 ${tables}개 / 총 행 ${rows}개 / 외래키 ${fks}개 / 인덱스 ${indexes}개"

# 구조만 복원되고 데이터가 비어 있는 경우를 잡는다 — 스키마 마이그레이션만 담긴 덤프를
# 정상 백업으로 착각하는 것이 가장 흔한 함정이다.
if (( tables == 0 )); then log "테이블이 하나도 없습니다"; exit 1; fi
if (( rows == 0 )); then log "행이 하나도 없습니다 — 데이터가 담기지 않았습니다"; exit 1; fi
if (( fks == 0 )); then log "외래키가 하나도 없습니다 — 제약이 복원되지 않았습니다"; exit 1; fi

log "리허설 성공"

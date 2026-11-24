#!/usr/bin/env bash

set -Eeuo pipefail

# 백업 복원 리허설. 덤프(custom 형식)를 네트워크 없는 일회용 Postgres 에 복원하고, 테이블 목록과
# 테이블별 행 수를 원본 DB 와 대조한 뒤 컨테이너와 볼륨을 지운다. 원본 DB 는 읽기만 한다.
#
#   verify-prod-backup-restore.sh [--key <S3 키> | --file <덤프 파일>] [--against api | --against-container <이름>] [--exact-rows]
#
#   --key       S3 의 덤프(기본: pg/daily/ 의 가장 최근 것). S3 읽기 권한이 필요하다(docs/ops/prod-backup.md).
#   --file      이 호스트에 있는 덤프 파일
#   --against   api(기본): 실행 중인 API 컨테이너가 쓰는 DB(운영 RDS)와 대조한다
#               --against-container: 그 Postgres 컨테이너 안의 DB 와 대조한다(옛 DB 컨테이너 보관 덤프 확인용)
#   --exact-rows  행 수가 하나라도 다르면 실패. 원본이 바뀌지 않는 DB 에 쓴다 — 운영 DB 는 덤프 뒤에도 쓰기가 들어온다.
#
# pg_restore 는 --exit-on-error 로 돌린다 — 오류를 건너뛰면 절반만 복원된 DB 가 "성공"으로 보인다.

# shellcheck source=deploy/backup-prod-db.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backup-prod-db.sh"

log() { echo "[restore-rehearsal] $*"; }
usage() { sed -n '8,14p' "${BASH_SOURCE[0]}" >&2; exit 64; }

KEY='' FILE='' AGAINST=api SOURCE_CONTAINER='' EXACT_ROWS=false
while (($#)); do
  case "$1" in
    --key) KEY="${2:?}"; shift 2 ;;
    --file) FILE="${2:?}"; shift 2 ;;
    --against) [[ "${2:-}" == api ]] || usage; shift 2 ;;
    --against-container) AGAINST=container; SOURCE_CONTAINER="${2:?}"; shift 2 ;;
    --exact-rows) EXACT_ROWS=true; shift ;;
    *) usage ;;
  esac
done
[[ -z "${KEY}" || -z "${FILE}" ]] || usage

# 사용자 테이블별 "스키마.테이블|행 수". 복원본과 원본에 같은 쿼리를 쓴다.
COUNT_SQL="SELECT table_schema || '.' || table_name || '|' || (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY 1"

# 이번 실행만의 이름이다 — 정리는 이 이름으로만 한다.
SCRATCH="teameet-restore-rehearsal-$$"
WORK="$(mktemp -d)"
cleanup() {
  "${BACKUP_DOCKER[@]}" rm -f -v "${SCRATCH}" >/dev/null 2>&1 || true
  "${BACKUP_DOCKER[@]}" volume rm "${SCRATCH}" >/dev/null 2>&1 || true
  rm -rf "${WORK}"
}
trap cleanup EXIT

dump="${WORK}/db.dump"
if [[ -n "${FILE}" ]]; then
  cp "${FILE}" "${dump}"
  log "대상 덤프: ${FILE}"
else
  : "${BACKUP_BUCKET:?BACKUP_BUCKET 이 없습니다}"
  if [[ -z "${KEY}" ]]; then
    KEY="$(aws s3 ls "s3://${BACKUP_BUCKET}/pg/daily/" --recursive --region "${AWS_REGION}" | sort | tail -1 | awk '{print $4}')"
    [[ -n "${KEY}" ]] || { log "pg/daily/ 에 덤프가 없습니다"; exit 1; }
  fi
  log "대상 덤프: s3://${BACKUP_BUCKET}/${KEY}"
  aws s3 cp "s3://${BACKUP_BUCKET}/${KEY}" "${dump}" --region "${AWS_REGION}" --only-show-errors
fi

log "임시 Postgres 기동 (${SCRATCH}, 네트워크 없음)"
"${BACKUP_DOCKER[@]}" run -d --name "${SCRATCH}" --network none --log-driver none \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=rehearsal \
  -v "${SCRATCH}:/var/lib/postgresql/data" "${BACKUP_PG_CLIENT_IMAGE}" >/dev/null
# 초기화 중의 임시 서버는 TCP 를 열지 않는다 — TCP 로 응답해야 진짜 서버다.
ready=false
for _ in $(seq 1 60); do
  if "${BACKUP_DOCKER[@]}" exec "${SCRATCH}" pg_isready -q -h 127.0.0.1 -U postgres -d rehearsal; then
    ready=true
    break
  fi
  sleep 2
done
[[ "${ready}" == true ]] || { log "임시 Postgres 가 준비되지 않았습니다"; exit 1; }

log "복원 시작"
if ! "${BACKUP_DOCKER[@]}" exec -i "${SCRATCH}" pg_restore --exit-on-error --no-owner --no-acl \
  -U postgres -d rehearsal < "${dump}" 2> "${WORK}/restore.err"; then
  log "복원 실패 — 마지막 오류:"
  tail -20 "${WORK}/restore.err" >&2
  exit 1
fi

"${BACKUP_DOCKER[@]}" exec "${SCRATCH}" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d rehearsal \
  -c "${COUNT_SQL}" > "${WORK}/restored.txt"
if [[ "${AGAINST}" == api ]]; then
  prod_db_client psql -X -At -v ON_ERROR_STOP=1 -c "${COUNT_SQL}" < /dev/null > "${WORK}/source.txt"
else
  "${BACKUP_DOCKER[@]}" exec -e PGOPTIONS='-c default_transaction_read_only=on' "${SOURCE_CONTAINER}" \
    sh -c 'exec psql -X -At -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-${POSTGRES_USER:-postgres}}" -c "$1"' \
    sh "${COUNT_SQL}" < /dev/null > "${WORK}/source.txt"
fi
# 두 DB 의 정렬 규칙(collation)이 다를 수 있어 여기서 같은 순서로 다시 정렬한다(join 은 정렬된 입력을 요구한다).
for f in "${WORK}/restored.txt" "${WORK}/source.txt"; do
  LC_ALL=C sort -t'|' -k1,1 -o "${f}" "${f}"
done

restored_tables="$(wc -l < "${WORK}/restored.txt" | tr -d ' ')"
restored_rows="$(awk -F'|' '{ s += $2 } END { print s + 0 }' "${WORK}/restored.txt")"
source_tables="$(wc -l < "${WORK}/source.txt" | tr -d ' ')"
log "복원본: 테이블 ${restored_tables}개 / 행 ${restored_rows}개 — 원본: 테이블 ${source_tables}개"

if (( restored_tables == 0 || restored_rows == 0 )); then
  log "복원본에 테이블이나 행이 없습니다"
  exit 1
fi
if ! diff <(cut -d'|' -f1 "${WORK}/restored.txt") <(cut -d'|' -f1 "${WORK}/source.txt") > "${WORK}/tables.diff"; then
  log "테이블 목록이 원본과 다릅니다 (< 복원본, > 원본):"
  grep -E '^[<>]' "${WORK}/tables.diff" >&2
  exit 1
fi
row_diffs="$(LC_ALL=C join -t'|' "${WORK}/restored.txt" "${WORK}/source.txt" | awk -F'|' '$2 != $3 { print $1 ": 복원본 " $2 " / 원본 " $3 }')"
if [[ -n "${row_diffs}" ]]; then
  log "행 수가 다른 테이블 $(wc -l <<< "${row_diffs}" | tr -d ' ')개:"
  echo "${row_diffs}" >&2
  [[ "${EXACT_ROWS}" == false ]] || { log "--exact-rows: 실패"; exit 1; }
else
  log "테이블별 행 수가 모두 같습니다"
fi
log "리허설 성공"

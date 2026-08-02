#!/usr/bin/env bash

set -Eeuo pipefail

# 프로덕션 Postgres 논리 백업 → S3.
#
# EBS 스냅샷(DLM, 매일 03:00 KST)이 볼륨 전체를 커버하지만, 그건 크래시 일관성 스냅샷이라
# "테이블 하나만 되돌리기" 같은 복구는 못 한다. 그리고 스냅샷은 이 인스턴스의 볼륨에 묶여
# 있어서, RDS 로 옮길 때 그대로 쓸 수 없다. pg_dump 는 두 경우 모두를 커버한다.
#
# 2026-08-02 실측: 자동 백업이 **하나도** 없었다(EBS 스냅샷 0건, cron 미설치, 백업 디렉터리
# 부재). DB 는 v1 24MB + 레거시 43MB 로 작아서 매일 전체 덤프를 떠도 부담이 없다.
#
# 값은 인스턴스 IAM role 로 S3 에 올린다 — 자격증명을 파일에 두지 않는다.

BACKUP_BUCKET="${BACKUP_BUCKET:-teameet-prod-backups-851725525576-ap-northeast-2}"
AWS_REGION="${AWS_REGION:-ap-northeast-2}"
# 덤프가 이보다 작으면 뭔가 잘못된 것이다(빈 DB·권한 오류·조기 종료). 성공으로 착각하고
# 올려 두면 정작 복구할 때 알게 된다 — 그때는 늦다.
MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-1024}"

log() { echo "[prod-backup] $*"; }

dump_database() {
  local container="$1" db_user="$2" db_name="$3" label="$4"
  local stamp key tmp size

  if ! sudo docker inspect "${container}" >/dev/null 2>&1; then
    log "${label}: 컨테이너 ${container} 가 없습니다 — 건너뜁니다"
    return 0
  fi

  stamp="$(date -u +%Y/%m/%d/%Y%m%dT%H%M%SZ)"
  key="pg/${label}/${stamp}.sql.gz"
  tmp="$(mktemp)"
  chmod 600 "${tmp}"

  # pipefail 이 켜져 있으므로 pg_dump 가 죽으면 파이프라인 전체가 실패한다.
  if ! sudo docker exec "${container}" pg_dump -U "${db_user}" -d "${db_name}" --clean --if-exists \
    | gzip -9 > "${tmp}"; then
    log "${label}: pg_dump 실패"
    rm -f "${tmp}"
    return 1
  fi

  size="$(stat -c %s "${tmp}")"
  if (( size < MIN_DUMP_BYTES )); then
    log "${label}: 덤프가 너무 작습니다 (${size} bytes) — 업로드하지 않습니다"
    rm -f "${tmp}"
    return 1
  fi

  if ! aws s3 cp "${tmp}" "s3://${BACKUP_BUCKET}/${key}" --region "${AWS_REGION}" --only-show-errors; then
    log "${label}: S3 업로드 실패"
    rm -f "${tmp}"
    return 1
  fi
  rm -f "${tmp}"

  log "${label}: s3://${BACKUP_BUCKET}/${key} (${size} bytes)"
}

failed=0
# v1 이 현재 서비스, teameet 은 아직 도는 레거시 스택. 레거시도 데이터가 남아 있어
# 정리 판단이 끝나기 전까지는 같이 뜬다.
dump_database teameet_v1_postgres teameet_v1 teameet_v1 v1 || failed=1
dump_database teameet_postgres teameet teameet legacy || failed=1

if (( failed != 0 )); then
  log "일부 백업이 실패했습니다"
  exit 1
fi
log "모든 백업 완료"

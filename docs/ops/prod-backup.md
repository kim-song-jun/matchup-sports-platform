# 프로덕션 백업 · 복구

2026-08-02 이전까지 프로덕션에는 **자동 백업이 하나도 없었다.** EBS 스냅샷 0건, cron 미설치,
백업 디렉터리 부재 — 인스턴스나 볼륨이 죽으면 데이터를 되살릴 방법이 없는 상태였다. 이 문서는
그때 넣은 두 겹의 백업과, 실제로 되돌릴 때 무엇을 어떻게 하는지를 적는다.

## 두 겹으로 가는 이유

| | EBS 스냅샷 | pg_dump → S3 |
|---|---|---|
| 대상 | 루트 볼륨 전체 | 데이터베이스 논리 내용 |
| 주기 | 매일 03:00 KST (`18:00 UTC`) | 매일 02:30 KST (`17:30 UTC`) |
| 보관 | 7일 | 30일 (버전은 7일) |
| 복구 단위 | 볼륨/인스턴스 통째 | 테이블·행 단위 |
| RDS 이전에 재사용 | 불가 | 가능 |

스냅샷만으로는 "테이블 하나만 되돌리기"를 못 하고, 볼륨에 묶여 있어 RDS로 옮길 때 쓸 수 없다.
덤프만으로는 OS·nginx 설정·인증서 같은 볼륨 상태를 못 되살린다. 둘은 서로를 대체하지 않는다.

덤프를 스냅샷보다 **30분 먼저** 돌리는 것은 의도된 순서다 — 그래야 그날의 스냅샷이 방금 뜬
덤프까지 포함한다.

## 구성 요소

**EBS 스냅샷** — DLM 정책 `policy-055f14b99f046f360`
- 대상: `Backup=teameet-prod` 태그가 붙은 볼륨
- 실행 역할: `AWSDataLifecycleManagerDefaultRole`

**논리 백업** — `deploy/backup-prod-db.sh`
- 설치 위치: `/usr/local/bin/teameet-backup-db.sh` (0750)
- 스케줄: `deploy/systemd/teameet-backup-db.{service,timer}`
- 버킷: `teameet-prod-backups-<account>-ap-northeast-2` (버저닝·SSE-S3·퍼블릭 차단)
- 키 형식: `pg/<label>/<YYYY>/<MM>/<DD>/<YYYYMMDD>T<HHMMSS>Z.sql.gz`
- 인증: 인스턴스 IAM role의 `TeameetProdBackupWrite` (`s3:PutObject` on `pg/*` 만)

`cron`이 아니라 systemd 타이머를 쓴다 — 이 호스트에는 `crontab` 자체가 설치돼 있지 않다.
타이머는 `Persistent=true`라 인스턴스가 꺼져 시각을 놓쳤으면 부팅 후 곧바로 한 번 돌린다.
백업이 조용히 하루를 건너뛰는 것이 가장 나쁜 실패 방식이기 때문이다.

## 스크립트가 거부하는 것

빈 덤프를 성공으로 올려 두면 복구를 시도하는 시점에야 알게 된다 — 그때는 늦다. 그래서
`MIN_DUMP_BYTES`(기본 1KB)보다 작은 결과는 업로드하지 않고 실패로 끝낸다. `pg_dump`가 중간에
죽는 경우도 `pipefail` 덕에 파이프라인 전체가 실패한다.

## 복구

### 논리 백업에서 되돌리기

```bash
# 1. 원하는 시점의 덤프를 고른다
aws s3 ls s3://teameet-prod-backups-<account>-ap-northeast-2/pg/v1/ --recursive

# 2. 무결성부터 확인한다 — 받자마자 복원하지 않는다
aws s3 cp s3://.../20260802T143039Z.sql.gz - | gunzip -t
aws s3 cp s3://.../20260802T143039Z.sql.gz - | gunzip -c | grep -c '^CREATE TABLE'

# 3. 복원 (덤프는 --clean --if-exists 로 떠서 기존 객체를 지우고 다시 만든다)
aws s3 cp s3://.../20260802T143039Z.sql.gz - \
  | gunzip -c \
  | sudo docker exec -i teameet_v1_postgres psql -U teameet_v1 -d teameet_v1
```

`--clean --if-exists`이므로 **대상 DB의 기존 데이터가 지워진다.** 운영 DB에 바로 쏘기 전에
빈 DB나 별도 컨테이너에 먼저 복원해 내용을 확인하는 편이 안전하다.

### EBS 스냅샷에서 되돌리기

스냅샷으로 새 볼륨을 만들어 인스턴스에 붙이는 방식이다. 루트 볼륨 교체는 인스턴스 정지가
필요하므로 다운타임이 생긴다. 데이터만 필요하면 새 볼륨을 **추가 디스크로** 붙여
`/var/lib/docker/volumes/deploy_v1_postgres_data`에서 꺼내는 쪽이 서비스 중단이 없다.

## 남은 한계

- **백업 실패가 조용하다.** 현재 실패는 `journalctl -u teameet-backup-db` 에만 남는다.
  `OPS_ALERT_WEBHOOK_URL`이 등록되면 `OnFailure=`로 알람을 붙일 수 있다.
- **복원 리허설을 아직 한 번도 하지 않았다.** 덤프의 무결성과 `CREATE TABLE` 개수는 확인했지만,
  실제로 빈 DB에 복원해 애플리케이션이 뜨는지까지는 검증하지 않았다. 백업은 복원해 본 적이
  있을 때만 백업이다.
- **레거시 스택(`teameet_postgres`)도 함께 백업한다.** 정리 판단이 끝나면 스크립트에서 빼야 한다.
- RDS로 옮기면 EBS 스냅샷의 DB 관련 역할은 RDS 자동 백업·PITR이 대체한다. 이 스크립트는
  RDS에서도 그대로 쓸 수 있게 `pg_dump` 기반으로 남겨 뒀다(접속 대상만 바뀐다).

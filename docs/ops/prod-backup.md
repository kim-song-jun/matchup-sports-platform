# 프로덕션 백업 · 복구

> **2026-11-24 바로잡음.** 08-02 에 넣은 일일 덤프는 서버 안의 DB 컨테이너(`teameet_v1_postgres`, v0
> `teameet_postgres`)만 떴다. 운영 DB 가 RDS 로 옮겨 간 뒤로는 **앱이 쓰지 않는 옛 사본**을 매일 뜬 것이고,
> 11-21 v0 컨테이너를 지우자 스크립트가 실패해 하트비트가 끊기고 경보가 울렸다. 지금 스크립트는 실행 중인
> API 컨테이너의 `DATABASE_URL`(= 앱이 실제로 쓰는 RDS)을 뜬다. 그 전에 S3 `pg/v1/`·`pg/legacy/` 에 쌓인
> `.sql.gz` 는 옛 컨테이너 덤프다 — RDS 복구에 쓰지 않는다.

## 겹겹이 무엇을 막나

| | RDS 자동 백업(PITR) | 일일 논리 덤프 → S3 | EBS 스냅샷(DLM) |
|---|---|---|---|
| 대상 | RDS 인스턴스 | 운영 DB 논리 내용 | 서버 루트 볼륨 |
| 주기 | 연속 | 매일 02:30 KST (`17:30 UTC`) | 매일 03:00 KST (`18:00 UTC`) |
| 보관 | 7일(2026-09-27 확인) | 35일 (`pg/daily/`, 아래 보존 규칙) | 7일 |
| 되돌리는 단위 | 시점 하나, 새 인스턴스로 | 테이블·행 | 볼륨 통째 |
| 계정·인스턴스 밖 사본 | 아님 | 그렇다 | 아님 |

PITR 은 인스턴스 통째로만 되돌리고 7일보다 앞으로는 못 간다. 덤프는 "테이블 하나만", "8일 전 상태"를 되살린다.
EBS 스냅샷은 이제 DB 가 아니라 OS·nginx 설정·인증서를 위한 것이다.

## 구성 요소

**스크립트** — `deploy/backup-prod-db.sh`
- 서버 설치 위치: `/usr/local/bin/teameet-backup-db.sh` (root, 0750). 배포가 설치하지 않는다(아래 "설치·갱신").
- 스케줄: `deploy/systemd/teameet-backup-db.{service,timer}`. `Persistent=true` 라 꺼져 있다 켜지면 곧바로 한 번 돈다.
- 서버 설정: `/etc/teameet/backup-db.env` (root, 0600) 에 `BACKUP_BUCKET=<버킷 이름>` 한 줄. 버킷 이름은 저장소에 적지 않는다.
- S3 키: `pg/daily/<YYYY>/<MM>/<DD>/teameet-v1-<YYYYMMDD>T<HHMMSS>Z.dump` (pg_dump custom 형식, 자체 압축)
- 인증: 인스턴스 IAM 역할의 `TeameetProdBackupWrite` (`s3:PutObject` on `pg/*` 만). 서버는 백업을 읽거나 지우지 못한다.
- 클라이언트: 일회용 `postgres:16.x` 컨테이너(ECR Public 사본, digest 고정). RDS 주 버전을 올리면 같은 주 버전 이상으로 올린다 — 낮으면 pg_dump 가 거부해 백업이 실패한다.

**한 번 도는 순서**
1. `docker inspect teameet_v1_api` 로 앱의 `DATABASE_URL` 을 읽어 libpq 환경변수(`PGHOST` 등)로 나눈다. 호스트가 비었거나
   옛 DB 컨테이너(`v1_postgres`)·`localhost` 면 거부한다.
2. 그 값을 0600 임시 파일로만 넘겨 `docker run --rm --log-driver none --network deploy_default … pg_dump --format=custom` 을
   돈다. 비밀번호는 명령줄 인자·`ps`·로그에 나오지 않는다. 세션은 `default_transaction_read_only=on` 이다.
   `--log-driver none` 이 없으면 표준출력으로 흐르는 덤프가 컨테이너 로그(루트 디스크)에도 쌓인다.
3. 진짜 덤프인지 본다: `MIN_DUMP_BYTES`(1KB) 이상, `pg_restore --list` 목차에 테이블·데이터 항목·`_prisma_migrations` 가 있다.
   하나라도 아니면 올리지 않고 실패(비-0)로 끝난다.
4. S3 에 올리고, 성공했을 때만 CloudWatch `Teameet/Backup` `BackupSuccess=1` 하트비트를 낸다.

## 설치·갱신 (서버에서, 손으로)

배포는 이 스크립트와 유닛을 설치하지 않는다. 저장소의 파일이 바뀌면 다시 설치한다. 파일은 릴리스 소스(`~/teameet/deploy/`)
또는 머지 커밋 SHA 로 고정한 raw URL 에서 받아 `sha256sum` 을 저장소 값과 대조한다.

```bash
sudo install -d -m 0755 /etc/teameet
printf 'BACKUP_BUCKET=%s\n' "$BUCKET" | sudo install -m 0600 /dev/stdin /etc/teameet/backup-db.env
sudo install -m 0750 deploy/backup-prod-db.sh /usr/local/bin/teameet-backup-db.sh
sudo install -m 0644 deploy/systemd/teameet-backup-db.service deploy/systemd/teameet-backup-db.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now teameet-backup-db.timer

# 한 번 바로 돌려 본다 — 끝날 때까지 기다리고, 실패하면 비-0 이다.
sudo systemctl start teameet-backup-db.service
sudo journalctl -u teameet-backup-db.service -n 30 --no-pager
systemctl list-timers teameet-backup-db.timer --no-pager
```

## 보존 기간 · 비용

일일 덤프는 **35일** 둔다 — 경보 창(26시간)·PITR(7일)보다 훨씬 길어서, 늦게 알아챈 데이터 손상도 되돌릴 수 있다.
버킷은 버저닝이 켜져 있으므로 지워진 덤프의 이전 버전도 7일 뒤 지운다. 2026-10-02 실측 덤프가 약 4MB 였으니
35개 ≈ 150MB, S3 Standard 로 한 달 1센트가 안 된다. 실제 크기는 `aws s3 ls --summarize --human-readable --recursive "s3://$BUCKET/pg/daily/"` 로 본다.

보존 규칙은 AWS 쓰기라 서버 IAM 역할이 아니라 관리자 로그인으로 건다. `put-bucket-lifecycle-configuration` 은
**설정 전체를 바꾼다** — 먼저 지금 규칙을 받아 두고, 아래 규칙이 그 내용을 모두 담는지 확인한 뒤 건다.
겹치는 규칙이 있으면 S3 는 더 짧은 만료를 쓴다(예: `pg/` 30일 규칙이 남아 있으면 `pg/daily/` 도 30일).

```bash
aws s3api get-bucket-lifecycle-configuration --bucket "$BUCKET" > lifecycle-before.json   # 없으면 NoSuchLifecycleConfiguration
cat > lifecycle.json <<'JSON'
{
  "Rules": [
    { "ID": "pg-daily-35d", "Status": "Enabled", "Filter": { "Prefix": "pg/daily/" },
      "Expiration": { "Days": 35 } },
    { "ID": "pg-v1-old-container-30d", "Status": "Enabled", "Filter": { "Prefix": "pg/v1/" },
      "Expiration": { "Days": 30 } },
    { "ID": "pg-legacy-old-container-30d", "Status": "Enabled", "Filter": { "Prefix": "pg/legacy/" },
      "Expiration": { "Days": 30 } },
    { "ID": "noncurrent-7d", "Status": "Enabled", "Filter": {},
      "Expiration": { "ExpiredObjectDeleteMarker": true },
      "NoncurrentVersionExpiration": { "NoncurrentDays": 7 },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 } }
  ]
}
JSON
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration file://lifecycle.json
aws s3api get-bucket-lifecycle-configuration --bucket "$BUCKET"
```

`archive/` 접두어(옛 DB 컨테이너의 마지막 보관 덤프 등)에는 만료 규칙을 걸지 않는다.

## 운영 DB 에 읽기 전용으로 붙기

옛 DB 컨테이너의 `psql` 을 클라이언트로 빌려 쓰던 방법은 그 컨테이너를 지우면 끝난다. 설치된 백업 스크립트를 `source`
하면 백업은 돌지 않고 `prod_db_client` 함수만 생긴다. 같은 일회용 클라이언트로, 같은 방식(임시 파일·읽기 전용 세션·
로그 드라이버 끔)으로 붙는다.

```bash
sudo bash -c '. /usr/local/bin/teameet-backup-db.sh && prod_db_client psql -X -v ON_ERROR_STOP=1 -f -' <<'SQL'
SELECT count(*) FROM v1_users;
SQL
```

`default_transaction_read_only=on` 이라 `CREATE TEMP VIEW`·임시 테이블도 거부된다 — 공통 부분은 `WITH` 로 쓴다.
`prod_db_client` 는 표준입력을 컨테이너로 넘긴다(`docker run -i`). SSM 으로 스크립트를 `bash -s`(표준입력)로 넘길 때
heredoc 이나 `</dev/null` 없이 부르면 스크립트의 뒤 줄을 먹는다 — 항상 표준입력을 정해 준다.

## 복구

### 복원 리허설

`deploy/verify-prod-backup-restore.sh` 는 덤프를 **네트워크 없는 일회용 Postgres** 에 `pg_restore --exit-on-error` 로
복원하고, 사용자 테이블 목록과 테이블별 행 수를 원본 DB 와 대조한 뒤 컨테이너와 볼륨을 지운다. 원본은 읽기만 한다.

```bash
cd ~/teameet   # 릴리스 소스. 두 스크립트가 같은 폴더에 있어야 한다(리허설이 백업 스크립트의 함수를 쓴다).
sudo env BACKUP_BUCKET="$BUCKET" bash deploy/verify-prod-backup-restore.sh                 # pg/daily/ 최신 덤프 ↔ 운영 RDS
sudo bash deploy/verify-prod-backup-restore.sh --file ./final.dump --against-container teameet_v1_postgres --exact-rows
```

- 테이블 목록이 다르면 실패한다. 행 수는 운영 DB 가 덤프 뒤에도 바뀌므로 다른 테이블만 보고한다. 원본이 바뀌지 않는
  DB(옛 컨테이너 등)는 `--exact-rows` 로 하나라도 다르면 실패하게 한다.
- S3 에서 받으려면 S3 읽기 권한이 잠시 필요하다. 인스턴스 역할은 평소 `pg/*` 쓰기 전용이다 — 서버가 뚫려도 백업을
  읽거나 지우지 못하게 하려는 설계다. 리허설 때만 `s3:ListBucket` + `s3:GetObject` 인라인 정책을 붙였다 뗀다.
- 리허설은 복원이 **깨지지 않는지**를 본다. 복원된 DB 로 앱이 도는지는 따로 본다.

### 덤프에서 되돌리기

운영 RDS 에 바로 쏘지 않는다. 새 DB(또는 PITR 로 만든 새 인스턴스)에 복원해 확인한 뒤, 앱이 그쪽을 보게 하거나
필요한 테이블만 옮긴다. 복원·전환은 사용자 직접 승인 뒤에만 한다(`docs/ops/prod-task168-transition-runbook.md` "복구").

```bash
pg_restore --list teameet-v1-<stamp>.dump | less                  # 목차 확인
pg_restore --no-owner --no-acl --exit-on-error -d <새 DB> teameet-v1-<stamp>.dump
pg_restore --no-owner --no-acl --exit-on-error -d <새 DB> -t v1_users teameet-v1-<stamp>.dump   # 테이블 하나만
```

접속 정보는 libpq service 파일·비밀번호 파일(0600)로 준다. URL·비밀번호를 `-d` 등 명령줄 인자로 넘기지 않는다.

### EBS 스냅샷에서 되돌리기

DB 가 RDS 라 스냅샷에는 운영 데이터가 없다. OS·nginx 설정·인증서가 필요할 때 스냅샷으로 새 볼륨을 만들어 **추가 디스크로**
붙여 꺼낸다(루트 볼륨 교체는 인스턴스 정지가 필요하다). 대상은 `Backup=teameet-prod` 태그가 붙은 볼륨이다.

## 실패 감지

스크립트는 성공했을 때만 `Teameet/Backup` `BackupSuccess=1` 을 올린다. 경보 `teameet-prod-backup-missing` 은 **데이터
없음을 위반으로 본다**(`TreatMissingData=breaching`) — 스크립트 실패, 타이머가 안 돈 경우, 인스턴스가 꺼진 경우를 모두
잡는다. "26시간 안에 성공이 없으면" 울린다. 경보는 저장소 밖에서 손으로 만든 것이다(`docs/ops/ops-alerts.md`).

알림 채널은 SNS 토픽 `teameet-prod-ops-alerts` 다. 구독자가 이메일 확인 링크를 눌러야 전달된다.

## 남은 한계

- 스크립트·유닛·`/etc/teameet/backup-db.env` 는 손으로 설치한다. 서버의 사본이 저장소와 같은지는 `sha256sum` 으로만 안다.
- API 컨테이너가 없거나 다시 만들어지는 순간에 돌면 그날 백업은 실패한다(경보로 드러난다, 다음 날 다시 돈다).

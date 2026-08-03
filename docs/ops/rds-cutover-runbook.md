# RDS 전환 런북

컨테이너 Postgres → Amazon RDS 전환의 **실행** 절차. 왜 옮기는지와 목표 구성은
`rds-migration-design.md`, 점검창 메커니즘 자체는 `maintenance-mode.md` 를 본다.

전환은 `deploy/cutover-to-rds.sh` 한 스크립트가 처음부터 끝까지 수행하며, 실패하면
사람 없이 되돌린다. 이 문서는 그 스크립트가 무엇을 보장하고 무엇을 보장하지 않는지,
그리고 사람이 해야 하는 일이 무엇인지를 적는다.

## 예약된 실행 (2026-08-04 04:07 KST)

```
systemd timer  teameet-rds-cutover.timer   OnCalendar=2026-08-04 04:07:00 Asia/Seoul
      └─ service  teameet-rds-cutover.service
            ├─ ExecStart      /usr/local/bin/teameet-cutover-to-rds.sh --cutover
            └─ ExecStopPost   /usr/local/bin/teameet-cutover-guard.sh
```

`Persistent=false` 다. 인스턴스가 그 시각에 꺼져 있었다면 **부팅 후 따라잡지 않는다** —
점검창을 동반하는 작업이 낮 트래픽 한가운데에서 시작되는 것이 더 나쁘기 때문이다.

## 전제조건 — 이게 없으면 스크립트가 스스로 거부한다

| 전제 | 확인 방법 | 없으면 |
|---|---|---|
| 배포된 compose 가 `V1_DB_HOST` 지원 | `grep V1_DB_HOST` on 실행 중인 compose 파일 | **중단**(사용자 영향 없음) + SNS 알림 |
| `.env` 에 `V1_DB_HOST` 없음 | 이미 전환됐는지 판정 | 중단 — 재실행이 RDS 를 구 데이터로 덮는 것을 막는다 |
| RDS 접속 + 메이저 버전 일치 | `SHOW server_version` 양쪽 비교 | 중단 |
| 릴리스 매니페스트 로드 | `V1_API_IMAGE`/`V1_WEB_IMAGE` 확보 | 중단 |
| ALB 기본 규칙이 `forward` | 이미 점검 중이면 되돌릴 타깃을 모른다 | 중단 |
| 디스크 여유 ≥ DB 크기 × 3 | `df` | 중단 |

`V1_DB_HOST` 지원은 **프로덕션에 그 릴리스가 배포돼 있어야** 생긴다. `main` 에 머지되고
`deploy.yml` 의 승인 게이트를 통과한 배포가 끝나야 한다는 뜻이다.

## 순서

```
프리플라이트(영향 없음)
   → 롤백 자산 확보(.env 사본 + ALB 규칙 스냅샷)
   → 점검창 ON  ────────────────── 여기부터 실패 시 자동 롤백
   → 앱 정지 (v1_api, v1_web)   ※ v1_postgres 는 정지하지 않는다
   → 원본 행 수 수집 (테이블 72개)
   → pg_dump → S3 업로드
   → RDS public 스키마 초기화 → 복원
   → 행 수 대조 (전 테이블 일치해야 진행)
   → .env 에 V1_DB_HOST / V1_DB_APP_PASSWORD 기록
   → compose config 가 RDS 를 가리키는지 확인
   → 앱 기동 → 내부 헬스(db=true) → 컨테이너 DATABASE_URL 확인 → RDS 측 커넥션 확인
   → 점검창 OFF → 공개 200 확인
```

**컨테이너 Postgres 를 정지하지 않는 것이 설계의 핵심이다.** 롤백은 `.env` 를 되돌리고
앱을 다시 띄우는 것으로 끝나며, 되돌릴 데이터가 항상 제자리에 있다.

## 실패하면

`점검창 ON` 이후의 모든 실패는 ERR trap 이 한 곳에서 처리한다.

1. `.env` 를 스냅샷으로 복원
2. 앱 재기동(컨테이너 DB 기준)
3. 헬스체크 대기
4. 점검창 OFF
5. 공개 응답 확인 후 SNS 알림

셸이 죽어서 trap 이 못 도는 경우(TimeoutStartSec 초과 → SIGTERM, OOM → SIGKILL)를 위해
`ExecStopPost` 로 `cutover-guard.sh` 가 한 번 더 돈다. 가드는 점검창이 켜진 채 남아 있으면
끄고, 앱이 죽어 있으면 되살린다. **점검창이 켜진 채 아침까지 남는 것**이 이 작업의 최악
시나리오이고, 가드는 그것만을 막기 위해 존재한다.

## 리허설

```bash
sudo /usr/local/bin/teameet-cutover-to-rds.sh --rehearse
```

`.env` 도 compose 도 앱도 건드리지 않고, RDS 에 `teameet_v1_rehearsal` 임시 DB 를 만들어
덤프 → 복원 → 행 수 대조까지 실제로 수행한 뒤 지운다. 점검창도 열지 않는다.

### 2026-08-03 리허설 기록

| 항목 | 결과 |
|---|---|
| PostgreSQL 버전 | 컨테이너 16.13 / RDS 16.13 |
| 활성 릴리스 | 0.2.1 (269f7d37) |
| 디스크 | 16.9GB 여유 / 73MB 필요 |
| 덤프 크기 | 5,838,511 bytes |
| 행 수 대조 | **72개 테이블 전부 일치** |
| 종료 코드 | 0 |

리허설은 세 번 만에 통과했고, 앞의 두 번이 잡아낸 것이 이 작업의 실질적인 수확이다.

1. **ALB 권한 부재** — 점검창 명령을 그동안 운영자 노트북 자격증명으로 실행해 왔고,
   인스턴스 롤에는 ELB 권한이 하나도 없었다. 무인 실행에서 처음 드러났다.
2. **릴리스 이미지 미로드** — `V1_API_IMAGE`/`V1_WEB_IMAGE` 는 `.env` 가 아니라 릴리스
   매니페스트에서 온다. 이걸 로드하지 않으면 `compose up` 이 **빈 이미지 이름**으로
   앱을 띄우려 한다. 즉 새벽 4시에 앱을 정지시킨 뒤 다시 띄우지 못하고, 롤백 경로도
   같은 compose 를 쓰므로 함께 죽는 전면 장애였다.

정적 검토로는 둘 다 보이지 않았다 — 실제로 실행해야만 나오는 종류의 결함이다.

## 리허설이 검증하지 못하는 구간

정직하게 적어 둔다. `--rehearse` 는 아래를 **돌리지 않는다.**

- 점검창 ON/OFF (ALB `modify-rule`)
- `.env` 교체와 그 결과의 `compose config`
- 앱 정지·재기동과 헬스 대기
- RDS 측 커넥션 확인

이 중 점검창 실패는 안전하다 — `maintenance_on` 은 켠 직후 503 을 직접 확인하고, 실패하면
앱을 정지하기 전에 멈춘다. 나머지는 배포 스크립트가 매 배포마다 쓰는 것과 같은 명령이다.

## 필요한 IAM (인스턴스 롤 `teameet-certbot-route53`)

인라인 정책 `TeameetProdMaintenanceWindow` — 2026-08-03 추가.

| Sid | Action | Resource |
|---|---|---|
| ReadListenerConfiguration | `elasticloadbalancing:Describe{LoadBalancers,Listeners,Rules}` | `*` (ELBv2 Describe 는 리소스 스코프 미지원) |
| ToggleMaintenanceOnDefaultRuleOnly | `elasticloadbalancing:ModifyRule` | **기본 규칙 1개 ARN만** |
| PublishCutoverHeartbeat | `cloudwatch:PutMetricData` | 네임스페이스 `Teameet/Cutover` 조건 |
| NotifyOpsOnCutoverOutcome | `sns:Publish` | `teameet-prod-ops-alerts` |

S3 는 **일부러 넓히지 않았다.** 기존 `TeameetProdBackupWrite` 가 `pg/*` 만 허용하므로,
전환 산출물도 `pg/cutover/<runId>/` 아래에 쓴다.

## 전환 후

- **컨테이너 Postgres 는 그대로 둔다.** 최소 7일. 볼륨(`deploy_v1_postgres_data`)도 유지.
- 롤백: `.env` 스냅샷(`~/.teameet-cutover/<runId>/env.before`)을 되돌리고 앱 재기동.
- 7일 뒤 정리 항목은 `rds-migration-design.md` 의 "3단계 — 정리" 참조.

## 수동 실행

```bash
# 리허설
sudo /usr/local/bin/teameet-cutover-to-rds.sh --rehearse

# 실제 전환
sudo /usr/local/bin/teameet-cutover-to-rds.sh --cutover

# 예약 취소
sudo systemctl disable --now teameet-rds-cutover.timer

# 예약 확인
systemctl list-timers teameet-rds-cutover.timer --all
```

## 알림

결과는 SNS `teameet-prod-ops-alerts` 로 나간다(성공/실패/가드 개입 모두).
**이메일 구독이 `PendingConfirmation` 상태면 아무것도 도착하지 않는다** — 무인 실행 전에
반드시 확인 메일의 링크를 눌러야 한다.

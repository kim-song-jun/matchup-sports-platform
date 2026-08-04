# RDS 전환 런북

컨테이너 Postgres → Amazon RDS 전환의 **실행** 절차. 왜 옮기는지와 목표 구성은
`rds-migration-design.md`, 점검창 메커니즘 자체는 `maintenance-mode.md` 를 본다.

전환은 `deploy/cutover-to-rds.sh` 한 스크립트가 처음부터 끝까지 수행하며, 실패하면
사람 없이 되돌린다. 이 문서는 그 스크립트가 무엇을 보장하고 무엇을 보장하지 않는지,
그리고 사람이 해야 하는 일이 무엇인지를 적는다.

## 전환 완료 (2026-08-04 01:44 KST, 실행 ID `20260804T014414Z`)

수동 트리거로 실제 전환을 완료했다. 72개 테이블 행 수 전부 일치, `.env` 의
`V1_DB_HOST` 가 RDS 를 가리키는 채로 유지, 실행 중인 `teameet_v1_api` 컨테이너의
`DATABASE_URL` 과 RDS 측 직접 조회(`v1_users` 213행) 로 이중 확인했다. 컨테이너
Postgres 는 롤백 창(최소 7일)으로 그대로 켜 둔 상태다.

이 시도 전까지 같은 밤에 3번 실패했고, 그 과정에서 발견·수정한 결함 4건은 아래
"2026-08-04 실전 첫 실행" 절과 "unbound variable" 절에 각각 남겨 둔다 — 전부 정적
검토로는 안 보이고 실제로 실행해야만 드러난 것들이다.

## 예약된 실행 (해제됨 — 완료로 목적 소진)

```
systemd timer  teameet-rds-cutover.timer   OnCalendar=<재사용 시 날짜 재설정> Asia/Seoul
      └─ service  teameet-rds-cutover.service
            ├─ ExecStart      /usr/local/bin/teameet-cutover-to-rds.sh --cutover
            └─ ExecStopPost   /usr/local/bin/teameet-cutover-guard.sh
```

`Persistent=false` 다. 인스턴스가 그 시각에 꺼져 있었다면 **부팅 후 따라잡지 않는다** —
점검창을 동반하는 작업이 낮 트래픽 한가운데에서 시작되는 것이 더 나쁘기 때문이다.
전환 자체는 위에서 완료했으므로 이 타이머는 현재 미사용(비활성) — 향후 다른 환경/재전환에
재사용할 경우에만 날짜를 새로 설정해 활성화한다.

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

- 점검창 ON/OFF (ALB `modify-listener`)
- `.env` 교체와 그 결과의 `compose config`
- 앱 정지·재기동과 헬스 대기
- RDS 측 커넥션 확인

이 중 점검창 실패는 안전하다 — `maintenance_on` 은 켠 직후 503 을 직접 확인하고, 실패하면
앱을 정지하기 전에 멈춘다. 나머지는 배포 스크립트가 매 배포마다 쓰는 것과 같은 명령이다.

### 2026-08-04 실전 첫 실행 — 점검창 토글이 여기서 걸렸다

리허설이 못 돌리는 바로 그 구간(점검창 ON)에서 실제로 막혔다. `aws elbv2 modify-rule`
을 리스너의 **기본 규칙**에 썼는데, ELBv2 는 기본 규칙을 `modify-rule` 대상으로 허용하지
않는다(`OperationNotPermitted: Default rule ... cannot be modified`). 기본 액션을 바꾸려면
`modify-listener --default-actions` 로 리스너 자체를 대상으로 해야 한다.

실패는 프리플라이트 통과 **직후, ALB 를 아직 바꾸기 전**이라 사용자 영향은 0 이었다
(컨테이너 재시작 없음·`.env` 미변경·health 정상, 독립적으로 재확인함). `maintenance_on`
과 `maintenance_off`, 그리고 `cutover-guard.sh` 의 안전망 해제 로직을 모두 `modify-listener`
로 바꿨고, 가드는 별도 프로세스라 리스너 ARN을 `${run_dir}/alb-listener-arn.txt` 로 받는다.
IAM 정책도 함께 바꿨다(아래 표).

### 2번째 시도 — ALB 전파 지연이 즉시 확인을 이긴다

`modify-listener` 는 고쳤지만 켠 직후 1회 즉시 확인(`curl` 한 번)이 여전히 남아 있었다.
격리 실측(앱·DB 안 건드리고 ALB 토글만 단독 실행) 결과 이 계정/리전에서 기본 액션 변경이
**최대 약 37초** 지연 전파됐다 — 그 사이 공개 응답은 계속 이전 상태를 보여준다. 1회 확인은
이 지연을 못 버텨 "점검창을 켰는데 200" 으로 오판 → 정상적으로 자동 롤백(영향 없음, 앱
재시작만 발생). 이 격리 측정 자체가 원복 반영이 늦어지며 **실사용자에게 약 30~50초 503
을 노출**시켰다 — 즉 진단 행위 자체도 실제 프로덕션에 영향을 준다는 교훈.

고침: 공유 `wait_for_public_status()` 헬퍼로 최대 90초(3초 간격) 폴링하도록 3곳을 모두
바꿨다 — 점검창 ON 확인(실패 시 fail), 롤백 후 확인(로그용, non-fatal), **9단계 최종 확인
(실패 시 fail)**. 마지막 자리가 특히 위험했다 — 여기서 잘못 fail 하면 **전환 자체는
성공했는데 ALB 확인이 늦었다는 이유만으로 성공한 전환을 되돌린다.**

### 3번째 시도 — nginx 가 재생성된 컨테이너의 옛 IP 를 붙잡는다

ALB 문제는 둘 다 고쳤는데도 롤백 뒤 공개 URL 이 여전히 502 였다(`nginx/1.29.8` 배너,
`connect() failed (113: Host is unreachable)`). 원인: 롤백/9단계 모두 `docker compose up
-d --no-deps v1_api v1_web` 로 앱만 재생성하는데, 이러면 컨테이너가 **새 내부 IP** 를
받는다. `nginx` 컨테이너는 손대지 않으므로 업스트림을 예전(이제 존재하지 않는) IP 로 계속
붙잡아 "Host is unreachable" 502 를 낸다. 내부 헬스체크(포트 8121 직접 접속)는 nginx 를
거치지 않아 이 문제를 못 잡는다 — 오직 공개 URL 경로에서만 드러난다.

이건 실제로 몇 분간 진짜 장애였다(수동 `docker exec teameet_nginx nginx -s reload` 로
복구). 고침: 두 `up -d --no-deps` 호출 직후 `"${compose[@]}" exec -T nginx nginx -s
reload` 를 추가했다 — 내부 헬스체크 대기 **전에** 리로드해서, 재생성된 컨테이너가 아직
뜨는 중이라도 nginx 가 최소한 올바른(새) IP 를 보게 한다.

### 4번째 시도 — 실제로 성공, 완료 알림 코드에 별개 버그

전환 자체는 끝까지 통과했다(72개 테이블 행 수 일치 · `.env` 전환 · RDS 커넥션 확인 ·
공개 200 확인 · "전환 완료" 로그). 그런데 `trap - ERR` 로 롤백 트랩을 이미 해제한
**완료 섹션**에서 `notify()` 호출이 `${code}` 를 참조했는데, 그 변수를 채우던 대입문을
2번째 시도 수정에서 `wait_for_public_status()` 폴링으로 바꾸면서 실수로 지워
`set -u` 의 "unbound variable" 로 스크립트가 exit 1 로 죽었다. **trap 해제 이후라
롤백은 걸리지 않았다** — `.env`·컨테이너 DATABASE_URL·RDS 쪽 직접 조회로 세 번 독립
확인해 전환이 그대로 유지됐음을 검증했다. 다만 SNS 성공 알림은 이 크래시 때문에
발송되지 못해 수동으로 보완 발송했다. 고침: `wait_for_public_status` 통과 직후
`code=200` 을 명시적으로 다시 채운다.

## 필요한 IAM (인스턴스 롤 `teameet-certbot-route53`)

인라인 정책 `TeameetProdMaintenanceWindow` — 2026-08-03 추가.

| Sid | Action | Resource |
|---|---|---|
| ReadListenerConfiguration | `elasticloadbalancing:Describe{LoadBalancers,Listeners,Rules}` | `*` (ELBv2 Describe 는 리소스 스코프 미지원) |
| ToggleMaintenanceOnListenerDefaultAction | `elasticloadbalancing:ModifyListener` | **443 리스너 ARN 1개만**(2026-08-04 정정 — 기본 규칙은 `ModifyRule` 대상이 될 수 없어 리스너 자체로 스코프를 옮겼다) |
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

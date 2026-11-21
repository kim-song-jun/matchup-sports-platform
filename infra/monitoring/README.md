# infra/monitoring — 서버 사용량 슬랙 알림

운영 · alpha 서버의 숫자를 CloudWatch 로 올리고, 경보가 울리면 Slack 으로 알리는 도구예요. **알림을 받았을 때 무엇을 볼지**는 [`docs/ops/ops-alerts.md`](../../docs/ops/ops-alerts.md) 에 있어요.

```
서버 ─ systemd 1분 타이머 ─ collect.mjs ──▶ CloudWatch 지표 (Teameet/Ops/Prod · /Alpha)
CloudWatch 경보 ─▶ SNS ─▶ lambda-handler.mjs ─▶ Slack   (웹훅은 SSM SecureString 에서만 읽어요)
매일 09:00 KST ─▶ lambda-handler.mjs (하루 요약)
```

| 파일 | 하는 일 |
|---|---|
| `lib/thresholds.mjs` | 경보 규칙 전부(임계값 · 기간 · 등급). 경보 생성과 Slack 제목이 이 표 하나를 써요 |
| `lib/parse.mjs` | docker 로그 · `/proc/meminfo` · `df` · nginx 줄 해석(입출력 없음) |
| `lib/metrics.mjs` · `collect.mjs` | 서버에서 1분마다 돌며 숫자를 모아 `put-metric-data` (또는 JSON 출력) |
| `lib/format.mjs` · `lib/summary.mjs` · `lambda-handler.mjs` | 경보 · 회복 · 하루 요약 문구와 Slack 전송 |
| `lib/plan.mjs` · `install.mjs` | 만들 AWS 리소스를 데이터로 만들어 **기본은 출력만**, `--apply` 일 때만 실행 |
| `install-collector.sh` · `systemd/` | 서버에 수집기를 까는 스크립트(역시 기본은 출력만) |

## 이 코드는 아직 아무 곳에도 적용되지 않았어요

PR 이 머지돼도 AWS 와 서버는 그대로예요. 아래 순서로 **사람이** 적용해요.

## 설치 순서

1. **웹훅 만들기(사람).** Slack 에 비공개 채널(예: `#teameet-ops-alerts`)과 Incoming Webhook 을 만들고, 값을 터미널에서 직접 SSM 에 넣어요. 값을 채팅 · 저장소 · 셸 기록에 남기지 않아요.
   ```bash
   read -rs WEBHOOK && aws ssm put-parameter --region ap-northeast-2 --type SecureString \
     --name /teameet/ops/slack-webhook --value "$WEBHOOK" --overwrite; unset WEBHOOK
   ```
2. **미리보기.** 아무것도 만들지 않고 명령 · 정책만 나와요.
   ```bash
   node infra/monitoring/install.mjs
   ```
3. **서버 역할에 정책 붙이기(사람).** 미리보기 끝에 나오는 `PutMetricData` 정책 2개를 운영 · alpha 서버의 인스턴스 역할에 각각 붙여요. 각 서버는 **자기 이름공간에만** 쓸 수 있어요. 이 스크립트는 서버 역할을 건드리지 않아요.
4. **AWS 쪽 만들기.** 인스턴스 ID · RDS 이름은 매개변수예요(저장소에 적지 않아요).
   ```bash
   node infra/monitoring/install.mjs --apply \
     --prod-instance-id <운영 인스턴스 ID> --alpha-instance-id <alpha 인스턴스 ID> --rds-id <RDS 인스턴스 이름>
   ```
   웹훅 매개변수가 없으면 아무것도 만들기 전에 멈춰요. 두 번 실행해도 안전해요(이미 있는 것은 그대로 두고 코드 · 경보는 덮어써요). 만들어지는 것: Lambda 1 + 역할 2, 서울 경보 24개 · us-east-1 경보 2개, us-east-1 SNS 주제 1, Route 53 헬스 체크 2, 하루 요약 스케줄 1. 기존 SNS 주제 `teameet-prod-ops-alerts` 와 메일 구독은 그대로예요.
5. **수집기 설치(서버, alpha 먼저 하루 → 운영).** SSM Run Command 나 SSH 로 이 폴더를 서버에 올린 뒤:
   ```bash
   sudo infra/monitoring/install-collector.sh --env alpha            # 미리보기
   sudo infra/monitoring/install-collector.sh --env alpha --apply
   ```
   파일 3묶음(`/usr/local/lib/teameet-ops/`, `/etc/systemd/system/teameet-ops-metrics.{service,timer}`, `/etc/teameet-ops/collector.env`)만 만들고 컨테이너 · compose · nginx 는 건드리지 않아요.
6. **시험.** `aws cloudwatch set-alarm-state --alarm-name teameet-alpha-web-restart --state-value ALARM --state-reason test` 로 Slack 모양을 확인하고, alpha 에서 `systemctl stop teameet-ops-metrics.timer` 5분 뒤 「수집기 끊김」 경보와 회복을 확인해요. 시험 채널로 1주 돌린 뒤 임계값을 보고 운영 채널로 옮겨요.

### 서버의 Node

수집기는 Node 20 이상이 필요해요. 11-21 서버 읽기에서 호스트에 확인된 도구는 `aws` · `curl` · `python3` · `jq` · Docker 뿐이라 **Node 가 없으면 `install-collector.sh --apply` 가 설치 전에 멈춰요.** 설치 방법(패키지 설치 / 컨테이너로 실행)은 사용자 결정 항목이에요.

### 수집기 한 번 돌려 보기

`--output json`(기본)은 숫자만 출력하고 AWS 에도 상태 파일에도 쓰지 않아요(다음 분의 재시작 판정이 그대로 남아요).

```bash
node /usr/local/lib/teameet-ops/collect.mjs --env prod            # 출력만
```

## 되돌리기

```bash
sudo infra/monitoring/install-collector.sh --env prod --apply --uninstall   # 서버(타이머 · 파일 · 상태 폴더)
node infra/monitoring/install.mjs --teardown                                # 미리보기
node infra/monitoring/install.mjs --teardown --apply                        # 경보 · Lambda · 스케줄 · 헬스 체크 · 역할 · us-east-1 주제 삭제
```

`--teardown` 은 이 도구가 만든 것만 지워요. 기존 SNS 주제 · 메일 구독 · 백업 경보 · SSM 웹훅 매개변수와 서버 역할의 정책은 남아요(직접 뗀 정책은 직접 지워요).

## 임계값 조정

값은 `lib/thresholds.mjs` 의 `RULES` 에 있고, 바꾸면 모양이 같은 경보가 다시 만들어져요.

1. 값을 고쳐요(`threshold` · `evaluationPeriods` · `datapointsToAlarm`).
2. 과거 숫자로 먼저 시험해요. 예: RDS 남는 메모리 최저 51MB 가 35MB 경보에 걸리는지.
   ```bash
   node -e "import('./infra/monitoring/lib/thresholds.mjs').then(({RULES, evaluateRule}) => {
     const r = RULES.find((x) => x.id === 'rds-memory-low');
     console.log(evaluateRule(r, [51, 60, 73].map((mb) => mb * 1024 * 1024)));   // OK 가 나와야 해요
   })"
   ```
3. `node --test infra/monitoring/test/*.test.mjs` 가 통과하는지 확인하고, `node infra/monitoring/install.mjs --apply ...` 로 다시 적용해요(`put-metric-alarm` 은 같은 이름이면 덮어써요).

5xx 경보는 「5분에 15건 이상이고 요청의 2% 이상, 2번 연속」이에요(`SPIKE_5XX_MIN_COUNT` · `SPIKE_5XX_MIN_RATIO`). 배포 직후 3분은 수집기가 `DeployWindow` 를 올려 빼요.

## 웹훅을 바꿀 때

SSM 매개변수 값을 바꾼 뒤 Lambda 를 한 번 갱신해요(`install.mjs --apply` 를 다시 돌리면 돼요). Lambda 는 웹훅을 첫 실행 때 한 번 읽고 기억해요.

## 시험

```bash
node --test infra/monitoring/test/*.test.mjs
```

실제 11-20 heap 부족 줄 · nginx combined 줄 모양으로 파서를 시험하고, 임계값은 11-20 실측 5분 창으로 판정해요. 이 시험은 아직 CI 워크플로(`deploy.yml`)에 걸려 있지 않아요(그 파일은 이 작업의 범위 밖).

## 이 PR 에 없는 것

- 배포 실패 알림(`workflow_run` 워크플로, 별도 GitHub secret 필요) — 사용자 결정(D3).
- ACM 인증서 만료 경보 — 인증서 ARN 이 필요하고 CloudFront 전환 때 바뀌어요. 오리진 인증서는 수집기가 봐요.
- 하루 요약의 「배포 창 밖 5xx」 · 「외부 헬스 실패 횟수」 — 시간별 합계로는 나눌 수 없거나 헬스 체크 ID 를 Lambda 가 몰라서 줄을 뺐어요.
- 수집기의 `--bot-names`(봇 이름별 지표, 월 약 +$1.8)는 켜지 않았어요(D5).

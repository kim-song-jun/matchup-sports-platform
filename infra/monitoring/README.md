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
4. **수집기 설치(서버, alpha 먼저 하루 → 운영).** SSM Run Command 나 SSH 로 이 폴더를 서버에 올린 뒤:
   ```bash
   sudo infra/monitoring/install-collector.sh --env alpha            # 미리보기
   sudo infra/monitoring/install-collector.sh --env alpha --apply
   ```
   파일 3묶음(`/usr/local/lib/teameet-ops/`, `/etc/systemd/system/teameet-ops-metrics.{service,timer}`, `/etc/teameet-ops/collector.env`)만 만들고 컨테이너 · compose · nginx 는 건드리지 않아요. 몇 분 뒤 CloudWatch 에 `Heartbeat` 가 들어오는지 봐요(5번이 이것을 확인해요).
5. **AWS 쪽 만들기.** 인스턴스 ID · RDS 이름은 매개변수예요(저장소에 적지 않아요).
   ```bash
   node infra/monitoring/install.mjs --apply \
     --prod-instance-id <운영 인스턴스 ID> --alpha-instance-id <alpha 인스턴스 ID> --rds-id <RDS 인스턴스 이름>
   ```
   웹훅 매개변수가 없으면 아무것도 만들기 전에 멈춰요. 두 번 실행해도 안전해요(이미 있는 것은 그대로 두고 코드 · 경보는 덮어써요). 만들어지는 것: Lambda 1 + 역할 2, 서울 경보 28개 · us-east-1 경보 2개, us-east-1 SNS 주제 1, Route 53 헬스 체크 2, 하루 요약 스케줄 1, 서울 SNS 주제 `teameet-prod-ops-slack` 1(경보와 Lambda 만 써요, 메일 구독 없음). 기존 SNS 주제 `teameet-prod-ops-alerts` 와 메일 구독은 그대로고, 이 주제에는 백업 경보와 「Slack 전달 실패」 경보만 있어요(메일 한 통이 곧 실제 문제예요). 이 주제가 없으면 아무것도 만들기 전에 멈춰요.

   **「수집기 끊김」 경보는 그 환경의 Heartbeat 가 최근 15분에 들어온 것을 확인한 뒤에만 만들어요**(숫자가 없으면 만들자마자 긴급이 울려요). 수집기를 아직 못 깔았으면(예: 운영 서버에 Node 가 없을 때) 그 경보만 건너뛰고 나머지는 만들어요. 수집기를 깐 뒤 같은 명령을 다시 실행하면 그때 만들어져요 — 그 전까지 운영은 수집기 끊김 경보가 없다는 뜻이니 설치 완료 전까지 사람이 서버 상태를 봐요.
6. **시험.** `aws cloudwatch set-alarm-state --alarm-name teameet-alpha-web-restart --state-value ALARM --state-reason test` 로 Slack 모양을 확인하고, alpha 에서 `systemctl stop teameet-ops-metrics.timer` 5분 뒤 「수집기 끊김」 경보와 회복을 확인해요. 시험 채널로 1주 돌린 뒤 임계값을 보고 운영 채널로 옮겨요.

### 오리진 인증서 경로

수집기는 인증서 경로를 가정하지 않고, 실행 중인 `teameet_nginx` 컨테이너에서 `/etc/letsencrypt` 가 어느 호스트 폴더에 연결돼 있는지 읽어 그 아래 `live/teameet.co.kr/fullchain.pem` 을 열어요(필요하면 `collect.mjs --cert-path <파일>` 로 직접 지정). 인증서를 못 읽어도 하트비트는 그대로 올라가고 「수집기 단계 실패」(주의)만 와요.

### 서버의 Node

수집기는 Node 20 이상이 필요해요. 11-21 서버 읽기에서 호스트에 확인된 도구는 `aws` · `curl` · `python3` · `jq` · Docker 뿐이라 **Node 가 없으면 `install-collector.sh --apply` 가 설치 전에 멈춰요.** 설치 방법(패키지 설치 / 컨테이너로 실행)은 사용자 결정 항목이에요.

### 수집기 한 번 돌려 보기

`--output json`(기본)은 숫자만 출력하고 AWS 에도 상태 파일에도 쓰지 않아요(다음 분의 재시작 판정이 그대로 남아요).

```bash
node /usr/local/lib/teameet-ops/collect.mjs --env prod            # 출력만
```

## 알림 묶기

한 번의 heap 부족이 만드는 경보 2개(`web-restart` · `heap-oom`)를 Lambda 가 한 메시지로 묶고, 재시작 · heap 부족은 회복 메시지를 보내지 않으며, 같은 경보가 되풀이되면(이어진 두 번 사이가 30분 이내) 1 · 3 · 6 · 12 · 24 · 48 · 96번째만 보내고 「N분 동안 M번째」를 적어요. 같은 경보는 아무리 가까워도 따로 세요(2분마다 다시 뜨는 크래시 루프도 세요). 다만 재시작이 1분보다 빠르거나 여러 컨테이너가 엇갈려 일어나면 `web-restart` · `heap-oom` 은 ALARM 에서 풀리지 않아 CloudWatch 가 새 전이를 보내지 않고, 첫 알림만 와요. 그 구간은 회복 알림이 있는 `restart-loop` 경보(10분 중 3분 이상 재시작)가 맡아요. 3.5~5분 간격 루프에서는 이 경보도 2분마다 ALARM · OK 를 오가서, `restart-loop` 의 ALARM 도 같은 규칙(1 · 3 · 6 · 12 · 24번째)으로 세고 `[회복]` 은 10분 동안 다시 ALARM 이 없을 때만 보내요(Lambda 가 10분 기다린 뒤 경보 기록을 다시 읽어서, Lambda 제한 시간은 12분이에요). 회복 메시지의 시간은 반복 묶음 전체 길이예요. 루프가 10분 넘게 쉬었다 다시 시작하면 그 쉬는 동안 `[회복]` 이 나가고, 다시 시작한 첫 ALARM 은 새 묶음의 1번째라서 `[긴급]` 이 나가요(쉰 시간이 10분 안이면 같은 묶음이에요). 그래서 `[회복]` 앞에는 늘 나간 `[긴급]` 이 있어요. 이 구분을 위해 Lambda 는 `restart-loop` 의 OK 전이도 경보 기록에서 읽어요. 서로 다른 경보는 3분 안에 이어지면 한 번으로 묶어요. 경보 기록은 6시간 전까지, 5쪽까지 읽어요(`lib/dedupe.mjs`). 새 경보를 묶고 싶으면 `RULES` 에 같은 `group` 을(한 번 일어나고 끝나는 일이면 `event: true` 도) 달아요. Lambda 는 알림 한 건마다 8초 기다려 같은 사건의 다른 경보를 함께 봐요.

## 되돌리기

```bash
sudo infra/monitoring/install-collector.sh --env prod --apply --uninstall   # 서버(타이머 · 파일 · 상태 폴더)
node infra/monitoring/install.mjs --teardown                                # 미리보기
node infra/monitoring/install.mjs --teardown --apply                        # 경보 · Lambda · 스케줄 · 헬스 체크 · 역할 · 이 도구가 만든 SNS 주제 2개 삭제
```

`--teardown` 은 이 도구가 만든 것만 지워요. 기존 메일 SNS 주제 · 메일 구독 · 백업 경보 · SSM 웹훅 매개변수와 서버 역할의 정책은 남아요(직접 뗀 정책은 직접 지워요).

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

5xx 경보는 「5분에 15건 이상이고 요청의 2% 이상, 2번 연속」이에요(`SPIKE_5XX_MIN_COUNT` · `SPIKE_5XX_MIN_RATIO`). 배포 직후 3분은 수집기가 `DeployWindow` 를 올려 빼요. nginx `limit_req` 가 거절한 요청도 503 으로 기록되는데, 수집기가 nginx 오류 로그의 거절 줄(`limiting requests, excess:`)을 세어 5xx 에서 빼고 `NginxRateLimited` 로 따로 올려요(하루 요약의 「요청 제한 거절」). 로그에 그 줄이 없으면(`docker logs teameet_nginx 2>&1 | grep -c 'limiting requests'` 로 확인) 거절이 5xx 로 센다는 뜻이에요.

## 웹훅을 바꿀 때

SSM 매개변수 값만 바꾸면 돼요. Lambda 는 호출마다 웹훅을 읽어서 다시 배포하지 않아도 다음 알림부터 새 값을 써요.

## 시험

```bash
node --test infra/monitoring/test/*.test.mjs
```

실제 11-20 heap 부족 줄 · nginx combined 줄 모양으로 파서를 시험하고, 임계값은 11-20 실측 5분 창으로 판정해요. 이 시험은 아직 CI 워크플로(`deploy.yml`)에 걸려 있지 않아요(그 파일은 이 작업의 범위 밖).

## 다른 작업에 넘기는 것

- 운영 `nginx` 서비스(`deploy/docker-compose.prod.yml`)에는 `logging` 제한이 없어 로그 파일이 계속 커져요. 수집기는 `--tail` 로 끝에서부터 읽어 영향을 줄였지만, 디스크를 위해서도 다른 서비스처럼 `max-size` · `max-file` 을 두는 것이 좋아요(이 폴더의 범위 밖이라 고치지 않았어요).

## 이 PR 에 없는 것

- 배포 실패 알림(`workflow_run` 워크플로, 별도 GitHub secret 필요) — 사용자 결정(D3).
- ACM 인증서 만료 경보 — 인증서 ARN 이 필요하고 CloudFront 전환 때 바뀌어요. 오리진 인증서는 수집기가 봐요.
- 하루 요약의 「배포 창 밖 5xx」 · 「외부 헬스 실패 횟수」 — 시간별 합계로는 나눌 수 없거나 헬스 체크 ID 를 Lambda 가 몰라서 줄을 뺐어요.
- 수집기의 `--bot-names`(봇 이름별 지표, 월 약 +$1.8)는 켜지 않았어요(D5).

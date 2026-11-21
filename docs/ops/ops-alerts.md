# 서버 사용량 슬랙 알림 런북

운영 · alpha 서버의 재시작 · heap 부족 · 5xx · 메모리 · 디스크 · RDS 상태를 Slack 으로 알리는 구성의 **알림을 받았을 때 보는 문서**예요. 설치 · 되돌리기 · 임계값 조정은 [`infra/monitoring/README.md`](../../infra/monitoring/README.md), 설계 근거(후보 3가지 비교 · 비용)는 이 PR 설명에 있어요.

## 구성 한 장

```
서버 ─ 1분 타이머 ─ 수집기(숫자만) ─▶ CloudWatch 지표(Teameet/Ops/Prod · /Alpha)
CloudWatch 경보 ─▶ SNS ─▶ Lambda(teameet-ops-slack) ─▶ Slack
Route 53 헬스 체크 2개(us-east-1) ─▶ 경보 ─▶ 같은 Lambda
매일 09:00 KST ─▶ Lambda(하루 요약)
```

- 서버에는 Slack 주소가 없어요. 주소는 SSM Parameter Store SecureString `/teameet/ops/slack-webhook` 에만 있고 Lambda 만 읽어요.
- 서버가 멈추면 수집기 하트비트가 끊겨 「수집기 끊김」 경보가 와요(서버가 스스로 알리지 못하는 경우를 메워요).
- 기존 백업 경보(`teameet-prod-backup-missing`)와 메일 구독은 그대로고, 같은 SNS 주제라 Slack 에도 와요.
- 배포 중(컨테이너가 새로 만들어진 뒤 3분)에는 5xx 경보가 울리지 않게 빼요.

## 메시지 읽는 법

| 머리 | 뜻 |
|---|---|
| `[긴급]` | 지금 봐요. 회복 알림도 와요(재시작 · heap 부족처럼 한 번 일어나고 끝나는 일은 회복 알림이 없어요) |
| `[주의]` | 오늘 안에 봐요. alpha 는 항상 주의예요 |
| `[회복]` | 경보가 풀렸어요(걸린 시간이 붙어요) |
| `[하루 요약]` | 매일 09:00 KST, 어제 0~24시 |

### 알림을 묶는 방식

- 한 번의 heap 부족은 「web 재시작」과 「heap 부족」이 몇 초 간격으로 같이 울려요. **먼저 울린 경보 하나만** 보내고, 「같이 울린 경보」 줄에 나머지를 적어요(3분 안에 이어진 경보는 한 사건이에요).
- 같은 사건이 30분 안에 되풀이되면 **1 · 3 · 6 · 12 · 24번째만** 보내요. 사이 알림은 CloudWatch 경보 기록과 하루 요약에 남아요. 같은 종류가 이어지는데 알림이 없다면 마지막 알림의 「N번째」 줄을 봐요.
- 경보 기록을 읽지 못하면 묶지 않고 그대로 보내요(알림을 놓치는 것보다 겹치는 편이 나아요).

## 경보별 먼저 볼 것

모든 서버 명령은 **읽기만** 해요(`docker ps` · `docker logs` · `docker inspect` · `df` · `free`). 고치는 일은 알림 문서의 범위 밖이에요.

## web 재시작

컨테이너가 다시 시작됐어요(같은 컨테이너 ID 의 `StartedAt` 이 바뀜). 배포로 새로 만든 건 재시작으로 세지 않아요.

1. `docker ps --format '{{.Names}} {{.Status}}'` 로 어느 컨테이너가 방금 떴는지 봐요.
2. `docker logs --tail 80 teameet_v1_web` 의 마지막 줄들. `FATAL ERROR ... heap out of memory` 면 아래 「heap 부족」이에요.
3. 외부 헬스: `curl -sS -o /dev/null -w '%{http_code}\n' https://teameet.co.kr/api/v1/health`.

## heap 부족

Node 프로세스가 heap 한도에 닿아 죽었어요(11-20 · 11-21 사고와 같은 모양). 컨테이너 메모리가 아니라 Node 의 heap 상한이에요.

1. `docker logs --since 30m --timestamps teameet_v1_web | grep -E 'FATAL|Mark-Compact'` — 죽기 직전 GC 줄이 heap 한도 근처인지.
2. `docker inspect -f '{{.HostConfig.Memory}}' teameet_v1_web` 로 컨테이너 한도, `docker stats --no-stream teameet_v1_web` 로 지금 사용량.
3. 같은 일이 하루 여러 번이면 임시 대응이 아니라 원인(붙잡힌 객체)을 봐야 해요. 이전 사고 기록은 `docs/ops/` 와 해당 PR 설명을 봐요.

## web 메모리

web 컨테이너 사용률이 85% 이상으로 10분 이어졌어요. 안정일 때 약 67~70% 였어요. 앞선 신호일 뿐이라 heap 부족을 정확히 예언하진 않아요.

1. `docker stats --no-stream teameet_v1_web`.
2. 방금 배포했다면 메모리가 오르는 중일 수 있어요. 15분 뒤 다시 봐요.

## 5xx 급증

5분에 5xx 가 15건 이상이고 요청의 2% 이상인 상태가 두 번 이어졌어요(배포 직후 3분은 제외).

1. `docker logs --since 10m teameet_nginx | awk '$9 ~ /^5/ {print $9}' | sort | uniq -c` — 502/504 면 web 이나 api 가 응답하지 못한 거예요.
2. `docker ps` 로 web · api 상태, 「web 재시작」 · 「heap 부족」 알림이 같이 왔는지 봐요.

## 서버 메모리

서버 사용 가능 메모리가 200MB 밑(주의) 또는 100MB 밑(긴급)이에요. 안정일 때 277~330MB 였어요.

1. `free -m` 과 `docker stats --no-stream` 으로 누가 쓰는지.
2. swap 이 같이 늘면 아래 「swap」도 봐요.

## swap

swap 사용이 1,200MB 를 넘어 10분 이어졌어요(평소 약 450MB). `free -m`, `vmstat 5 3`(si/so 가 계속 0 이 아니면 swap 을 계속 오가는 중).

## 디스크

`/` 사용률이 80%(주의) 또는 90%(긴급)이에요. nginx · postgres 컨테이너 로그는 크기 제한이 없어 천천히 늘어요.

1. `df -h /`.
2. `docker system df`(읽기). 큰 컨테이너 로그는 `docker inspect -f '{{.LogPath}}' <이름>` 의 파일 크기를 `stat` 으로만 봐요.
3. 무거운 `du` · `find` 는 돌리지 않아요(운영 디스크를 붙잡아요).

## 수집기 끊김

수집기 하트비트가 5분 동안 없어요. **서버가 멈췄거나 수집기가 고장난 거예요.**

1. 외부에서: `curl -sS -o /dev/null -w '%{http_code}\n' https://teameet.co.kr/landing`. 응답이 없으면 서버 문제예요(「서버 자체」 · 「외부 헬스」 알림이 같이 올 수 있어요).
2. 서버에서: `systemctl status teameet-ops-metrics.timer teameet-ops-metrics.service`, `journalctl -u teameet-ops-metrics.service -n 30 --no-pager`.
3. 로그에 `[collector] <단계> failed` 가 보이면 그 단계가 원인이에요. 컨테이너를 못 보는 단계(`docker-inspect` · `docker-logs-*`: docker 권한 · 컨테이너 이름)가 실패하거나 숫자를 보내는 `aws` 가 실패하면 하트비트를 일부러 올리지 않아요. 그 밖의 단계 실패는 「수집기 단계 실패」(주의)로 따로 알려요.

## 수집기 단계 실패

수집기는 돌지만 일부 단계(인증서 읽기 · nginx 로그 · `df` · `docker stats` · 메모리 읽기)가 5분 내내 실패했어요. 서버는 살아 있어요 — 컨테이너를 못 보는 경우(`docker-inspect` · `docker-logs-*` 실패)만 「수집기 끊김」으로 알려요.

1. 서버에서: `journalctl -u teameet-ops-metrics.service -n 30 --no-pager` 에서 `[collector] <단계> failed` 줄을 봐요.
2. `origin-cert` 면 nginx 컨테이너의 `/etc/letsencrypt` 마운트 아래 `live/teameet.co.kr/fullchain.pem` 을 읽을 수 있는지(`docker inspect` 의 Mounts · 읽기 권한).
3. `nginx-logs` 가 시간 초과면 nginx 로그가 매우 큰 거예요(`docker inspect -f '{{.LogPath}}' teameet_nginx` 파일 크기를 `stat` 으로만 봐요). `nginx-logs-truncated` 는 1분에 2만 줄을 넘어 5xx · 요청 수가 실제보다 적게 잡힌다는 뜻이에요.

## 인증서

오리진 인증서(Let's Encrypt)가 20일 안에 만료돼요. certbot 은 30일 남았을 때 갱신하므로 갱신이 실패하고 있다는 뜻이에요. `systemctl status teameet-prod-certbot.timer`, `journalctl -u teameet-prod-certbot.service -n 30 --no-pager`.

## CPU

서버 CPU 85% 이상 15분, 크레딧 잔고 60 미만, 또는 초과 크레딧 요금 발생이에요. 무제한 모드라 서비스는 느려지지 않고 돈이 나가요. 요청이 늘었는지(봇 포함)는 하루 요약의 요청 수와 봇 비중으로 봐요.

## 서버 자체

EC2 상태 검사가 두 번 연속 실패했어요. 콘솔의 인스턴스 상태 검사를 보고, 응답이 없으면 재부팅은 사용자 판단이에요(알림 문서는 재부팅을 하지 않아요).

## RDS

CPU 60% 이상 · 남는 메모리 35MB 미만 · 연결 40 이상 · 저장 공간 4GB 미만 중 하나예요. 남는 메모리는 평소에도 51~73MB 라 경계에 가까워요 — 매일 울리면 임계값을 조정해요(README). 연결이 평소 7~8 인데 급증했다면 API 폭주나 연결 누수를 의심해요.

## 외부 헬스

Route 53 이 밖에서 `/api/v1/health`(DB 가 안 되면 오류) 또는 `/landing`(web 이 살아 있는지)을 3번 연속 열지 못했어요. 두 개가 같이 오면 서버 앞단이나 nginx, 하나만 오면 해당 컨테이너예요.

## 백업

`teameet-prod-backup-missing` — 26시간 안에 백업이 성공하지 않았어요. 절차는 [`prod-backup.md`](prod-backup.md) 「실패 감지」를 따라요.

## Slack 전달 실패

`teameet-ops-slack-errors` — Slack 으로 보내는 Lambda 가 실패했어요(웹훅 만료 · Slack 장애). 이 경보는 **메일**로 와요(두 번째 길). 확인: Lambda `teameet-ops-slack` 의 CloudWatch 로그. 웹훅을 새로 만들었다면 SSM 매개변수를 바꾼 뒤 Lambda 를 한 번 갱신해야 새 값을 읽어요(README).

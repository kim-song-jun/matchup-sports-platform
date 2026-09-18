# ALB idle_timeout — 사용자가 실제로 만나는 60초 벽

대진 자동 생성처럼 오래 걸리는 어드민 요청이 **60초에 504 로 끊기는데 서버 트랜잭션은 그대로
커밋되는** 문제의 마지막 남은 원인. `deploy/nginx.conf`·`deploy/nginx.alpha.conf` 의
`proxy_read_timeout 180s` 는 nginx 쪽 게이트를 없앴지만, **그 앞의 ALB 가 여전히 60초에 끊는다.**

이 값은 **이 저장소 코드로 바꿀 수 없다.** 저장소에 ALB IaC 가 없고(terraform/cdk/cfn 0건),
배포 스크립트도 `modify-load-balancer-attributes` 를 호출하지 않는다. AWS 쪽 수동 작업이다.

---

## 1. 현재 값

| 항목 | 값 | 출처 |
|---|---|---|
| 로드밸런서 | `teameet-alb` (ap-northeast-2) | `README.md` "인프라 구조", `deploy/nginx.conf:14` |
| `idle_timeout.timeout_seconds` | **60** (ALB 기본값) | 2026-08-27 `describe-load-balancer-attributes` 보고값 |
| 적용 범위 | **alpha + prod 양쪽 전부** | alpha 와 prod 는 ALB 하나를 호스트 규칙으로 나눠 쓴다 (`README.md`) |
| nginx `proxy_read_timeout` (대진 생성 3라우트) | 180초 | `deploy/nginx.conf`, `deploy/nginx.alpha.conf` |
| nginx `proxy_read_timeout` (그 외 전부) | 60초 (nginx 기본값, 미지정) | 같은 파일 |
| 앱 최악 상한 | 130초 = Prisma `maxWait 10초` + `timeout 120초` | 아래 4번 표 |

> **출처의 한계를 그대로 적는다.** 위 60초는 **2026-08-27 수정자가 보고한 값**이고,
> 이 문서를 쓰는 시점에는 `aws sts get-caller-identity` 가
> `Your session has expired` 라 **재확인하지 못했다.** 아래 명령으로 먼저 직접 확인하고
> 작업을 시작할 것 — 값이 이미 다르면 이 문서를 고치는 것이 첫 단계다.

```bash
LB=$(aws elbv2 describe-load-balancers --region ap-northeast-2 --names teameet-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)
aws elbv2 describe-load-balancer-attributes --region ap-northeast-2 \
  --load-balancer-arn "$LB" \
  --query 'Attributes[?Key==`idle_timeout.timeout_seconds`]' --output table
```

읽기만 하는 명령이고 필요한 권한은 `elasticloadbalancing:Describe{LoadBalancers,LoadBalancerAttributes}` 다.
(`docs/ops/maintenance-mode.md` 가 쓰는 것과 같은 계열의 조회 권한이다.)

---

## 2. 왜 문제인가 — "실패했다고 보이는데 저장은 됐다"

ALB 는 **타깃이 60초 동안 응답 바이트를 하나도 안 보내면** 프런트엔드 커넥션을 끊고 504 를
돌려준다. 그런데 그 뒤에서 벌어지는 일은 이렇다.

```
운영자가 '자동 생성' 클릭
        │
        ├─ 0s ─────────────── ALB ── nginx ── NestJS ── Prisma $transaction 시작
        │
        ├─ 60s ── ALB 가 커넥션 절단 → 운영자 화면: 504 "실패했어요"
        │                              (nginx 는 180초까지 기다리지만 클라이언트 쪽은 이미 끊겼다)
        │
        └─ 70~130s ─────────── 트랜잭션 정상 완료 → **COMMIT**
```

Nest/Express 는 클라이언트가 끊었다고 핸들러를 중단하지 않는다. 프런트에도 게이트가 없다
(`apps/v1_web/src/lib/api-client.ts` 에 `AbortSignal`·`timeout` 0건). 그래서 **운영자가 읽은 결과
(실패)와 DB 의 실제 상태(성공)가 갈라진다.**

그 다음이 진짜 비용이다. 운영자는 실패한 줄 알고 다시 누르는데:

- 다시 '자동 생성' → 409 `LEAGUE_FIXTURES_ALREADY_EXIST` ("이미 대진이 있어요")
- '교체' 선택 → 이미 만들어진 경기가 걸려 **또 409**

즉 화면상으로는 아무것도 못 만들었는데 대진은 이미 들어가 있는, 운영자가 자력으로 못 빠져나오는
상태가 된다. 되돌리기 경로 자체는 별도 작업에서 다루고 있고, **이 문서가 다루는 것은 그 상황을
애초에 만들지 않는 것**이다.

**60초를 넘길 수 있는 요청은 아래 넷뿐이다** (`grep -rn 'timeout: 120' apps/v1_api/src`, 2026-08-27):

| # | 엔드포인트 | 서비스 | nginx 180초 |
|---|---|---|---|
| 1 | `POST /api/v1/admin/tournaments/:tournamentId/league/fixtures/generate` | `tournaments/league-fixture-generator.service.ts` | ✅ |
| 2 | `POST /api/v1/admin/league-matches/:leagueId/fixtures` | `league-match-admin.service.ts` `generateFixtures` | ✅ |
| 3 | `POST /api/v1/admin/league-matches/:leagueId/fixtures/regenerate` | `league-match-admin.service.ts` `regenerateFixtures` | ✅ |
| 4 | `POST /api/v1/admin/league-series/:seriesId/seasons/:seasonNo/promotions/commit` | `league-series-admin.service.ts` `runCommitTransaction` | ❌ 제외 |

4번을 뺀 이유는 nginx 파일 주석에 적어 두었다 — 요약하면 그쪽 120초는 **동시 확정을 줄 세우려고
`maxWait` 와 함께 올린 값**이지 실제 소요 측정치가 아니고(쓰기는 승강 이력 1 createMany + 다음 시즌
리그 최대 3개 + 감사 로그 1행으로 유계), 잘려도 재시도 시 409 `PROMOTION_ALREADY_DECIDED` 로
"이미 확정됐다"를 분명히 알려주므로 막다른 길이 아니다. **ALB 를 올려도 이 넷 중 4번만은 여전히
60초** 라는 점을 기억할 것.

> ⚠️ **ALB 만 올리면 안 된다.** ALB 를 180초로 올려도 nginx 를 60초로 두면 상한이 nginx 로 옮겨갈
> 뿐 증상은 똑같다. 순서는 **nginx 먼저(이미 완료) → ALB 나중**이다.

---

## 3. 왜 저장소에서 못 고치나

- `idle_timeout` 은 **리스너나 규칙이 아니라 로드밸런서 속성**이다. `deploy/` 의 어떤 파일도
  로드밸런서를 정의하지 않는다 — nginx 는 ALB **뒤**에서 도는 컨테이너다.
- 저장소에 ALB IaC 가 없다: terraform/cdk/cloudformation 파일 0건,
  `modify-load-balancer-attributes` 호출 0건.
- 따라서 **PR 로 반영할 방법이 없다.** AWS 콘솔 또는 CLI 로 한 번 바꾸면 그 상태가 유지된다
  (계정에 drift 를 되돌리는 자동화도 없다).

---

## 4. 바꾸려면 — AWS 쪽 작업

### 4-1. 무엇을 얼마로

`idle_timeout.timeout_seconds` 를 **60 → 180** 으로. 근거는 앱 최악 상한 130초
(`maxWait 10초 + timeout 120초`) 위에 여유를 둔 값이고, nginx `proxy_read_timeout 180s` 와 같은 값이다.
(ALB 허용 범위는 1~4000초.)

```bash
LB=$(aws elbv2 describe-load-balancers --region ap-northeast-2 --names teameet-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

# 되돌릴 값을 먼저 저장한다
aws elbv2 describe-load-balancer-attributes --region ap-northeast-2 \
  --load-balancer-arn "$LB" --output json > ~/alb-attributes-before.json

aws elbv2 modify-load-balancer-attributes --region ap-northeast-2 \
  --load-balancer-arn "$LB" \
  --attributes Key=idle_timeout.timeout_seconds,Value=180
```

필요한 권한: `elasticloadbalancing:ModifyLoadBalancerAttributes` (로드밸런서 ARN 1개로 스코프).
`docs/ops/rds-cutover-runbook.md` 의 "필요한 IAM" 절이 인라인 정책을 좁게 쓰는 선례다 —
같은 방식으로 넓히지 말고 ARN 1개로 제한할 것.

### 4-2. 영향 범위 — 반드시 먼저 읽을 것

**이 값은 로드밸런서 전체에 걸린다. alpha 와 prod 는 같은 ALB 를 쓰므로 두 환경이 동시에 바뀐다.**
환경별로 다르게 줄 방법은 없다(리스너·규칙 단위 속성이 아니다).

바뀌는 것: 유휴 커넥션을 최대 180초까지 잡아 둔다 → ALB 의 동시 연결 수가 늘어날 수 있고,
느린 백엔드가 있을 때 사용자가 실패를 아는 데 최대 3배 오래 걸린다. 반대로 얻는 것은
"운영자가 본 타임아웃 = 실제로 아무것도 저장되지 않음"이라는 보장이다.

이 트레이드오프가 실재한다는 점을 정직하게 적어 둔다 — 60초는 "빨리 실패"를, 180초는
"정확한 결과"를 택하는 값이다. 이 서비스의 어드민 대진 생성은 되돌리기 비용이 매우 크므로
후자가 맞다고 판단했지만, 공개 읽기 경로까지 함께 느려지는 것은 감수하는 쪽이다.

### 4-3. 바꾼 뒤 확인

```bash
# ① 값이 실제로 바뀌었는지
aws elbv2 describe-load-balancer-attributes --region ap-northeast-2 \
  --load-balancer-arn "$LB" \
  --query 'Attributes[?Key==`idle_timeout.timeout_seconds`].Value' --output text   # 180 기대

# ② 두 환경 모두 살아 있는지 (반드시 새 연결로 — 기존 연결 재사용은 착시를 만든다)
curl -sS --no-keepalive -o /dev/null -w '%{http_code}\n' https://teameet.co.kr/
curl -sS --no-keepalive -o /dev/null -w '%{http_code}\n' https://alpha.teameet.co.kr/
```

`--no-keepalive` 를 빠뜨리면 안 되는 이유는 `docs/ops/maintenance-mode.md` 의 "해제 확인은 반드시
새 연결로 한다" 절에 실사고와 함께 적혀 있다.

**③ end-to-end 실측이 진짜 확인이다.** alpha 에서 8팀 조 2회전(56대진) 자동 생성을 한 번 돌려
`curl -w '%{http_code} %{time_total}'` 로 상태코드와 소요를 같이 찍는다. 이 저장소 관행상
alpha 가 ground truth 다(`CLAUDE.md` "Alpha 실측 검증"). 이 실측 전까지는
**"180초가 필요한지"조차 측정된 적이 없다** — 60초를 실제로 넘기는 것을 아직 아무도 보지 못했다.

### 4-4. 되돌리기

```bash
aws elbv2 modify-load-balancer-attributes --region ap-northeast-2 \
  --load-balancer-arn "$LB" \
  --attributes Key=idle_timeout.timeout_seconds,Value=60
```

즉시 반영되고 서비스 중단이 없다. nginx 쪽 180초는 그대로 둬도 무해하다(상한이 ALB 로 돌아갈 뿐).

---

## 5. ALB 를 올리기 전까지의 완화책

ALB 작업은 사람 손이 필요하므로 그때까지 아래로 버틴다. **전부 운영 수칙이고 코드 변경이 아니다.**

1. **큰 조를 한 번에 만들지 않는다.** 자동 생성이 오래 걸리는 것은 대진 수 때문이다
   (8팀 2회전 = 56대진, 대진마다 경기·사이드·라인업·참가자·감사 행). 조를 나눠 생성하면
   각 요청이 60초 아래로 내려간다 — 지금 운영자가 쓸 수 있는 **유일한 확실한 레버**다.
2. **504 를 받으면 다시 누르기 전에 실제 상태부터 본다.** 504 는 "실패"가 아니라 "모른다"는 뜻이다.
   어드민 대진 목록을 새로고침해 대진이 들어갔는지 눈으로 확인한 뒤에 다음 행동을 정한다.
   확인 없이 재시도하면 위 2번 절의 막다른 길로 들어간다.
3. **승강 확정(promotions/commit)은 504 를 받아도 그냥 한 번 더 눌러 본다.** 그쪽은 이미 확정됐다면
   409 `PROMOTION_ALREADY_DECIDED` 로 사실대로 답하도록 돼 있어 재시도가 안전하다.
4. **한가한 시간대에 한다.** DB 경합이 적을수록 트랜잭션이 60초 아래로 끝날 확률이 높아진다.

### 이 문서가 다루지 않는 것

**앱 타임아웃을 낮추는 것**(Prisma `timeout: 120_000` 을 프록시 상한 아래로 내려서 "504 를 본
운영자 = 롤백됨"을 앱 단에서 보장하는 방향)은 별개의 접근이고 **다른 작업에서 다룬다.**
이 문서는 프록시·LB 쪽 상한만 다룬다. 두 방향은 배타적이지 않다 — 앱 상한을 낮추면 ALB 를
안 올려도 정합성이 맞고, ALB 를 올리면 큰 대회도 한 번에 만들 수 있다.

---

## 관련 파일

- `deploy/nginx.conf` · `deploy/nginx.alpha.conf` — 대진 생성 3라우트의 `proxy_read_timeout 180s`
  중첩 location 과 그 근거 주석
- `README.md` "인프라 구조" — alpha·prod 가 ALB 하나를 나눠 쓰는 구조
- `docs/ops/maintenance-mode.md` — 같은 ALB 를 만지는 다른 절차(리스너 기본 규칙). 확인 명령·
  `--no-keepalive` 주의사항의 출처
- `docs/ops/rds-cutover-runbook.md` — ELBv2 인라인 IAM 정책을 좁게 쓰는 선례

# 점검 모드 (maintenance mode)

프로덕션을 잠시 세워야 할 때 사용자에게 **우리가 만든 안내 페이지**를 보여주는 절차. ALB 리스너의
기본 규칙 액션을 `fixed-response`로 바꾸는 방식이다.

2026-08-03에 **사용자 영향 없이 전체 메커니즘을 실증**했다(아래 "검증 기록" 참조).

## 왜 nginx가 아니라 ALB인가

두 방식을 비교했고 ALB를 택했다. 결정적인 이유는 **헬스체크가 리스너 규칙을 타지 않는다**는 것이다.

| | ALB 고정응답 | nginx 플래그 |
|---|---|---|
| 앱/인스턴스가 죽어 있어도 동작 | ⭕ | ❌ nginx가 살아 있어야 함 |
| 헬스체크 영향 | **없음** — 타깃에 직접 붙는다 | 게이팅이 헬스체크 경로를 막으면 타깃이 unhealthy |
| 전환 속도 | API 호출 1번 | 컨테이너 재기동 또는 reload |
| 되돌리기 | 액션 되돌리기 1번 | 플래그 제거 + reload |

nginx 방식의 실패 모드가 특히 나쁘다. 타깃이 **1개뿐**이라 unhealthy가 되는 순간 100% 장애이고,
그때 사용자가 보는 것은 우리 점검 페이지가 아니라 **ALB의 기본 503**이다. 점검 페이지를 띄우려다
점검 페이지를 잃는다.

## 한계 (ALB의 하드 리밋)

- **커스텀 응답 헤더를 붙일 수 없다** — `Retry-After` 불가. `FixedResponseConfig`는
  `MessageBody` / `StatusCode` / `ContentType`만 지원한다. 자동 재시도는 HTML의
  `<meta http-equiv="refresh">`로 대신한다.
- **본문 최대 1024자.** 현재 페이지는 750바이트다. 문구를 늘릴 때 이 한도를 먼저 확인할 것.

## 켜기

`default` 규칙(조건 없음 → prod 타깃)의 **액션만** 바꾼다. `alpha.teameet.co.kr`은 우선순위 10
규칙이 따로 처리하므로 **alpha는 계속 살아 있다.**

```bash
LB=$(aws elbv2 describe-load-balancers --region ap-northeast-2 --names teameet-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)
L=$(aws elbv2 describe-listeners --load-balancer-arn "$LB" --region ap-northeast-2 \
  --query 'Listeners[?Port==`443`].ListenerArn' --output text)

# 되돌릴 대상을 먼저 저장한다 — 점검 해제 때 이 값이 필요하다
aws elbv2 describe-rules --listener-arn "$L" --region ap-northeast-2 \
  --query 'Rules[?IsDefault==`true`]' --output json > /tmp/alb-default-rule-before.json

RULE=$(jq -r '.[0].RuleArn' /tmp/alb-default-rule-before.json)
aws elbv2 modify-rule --rule-arn "$RULE" --region ap-northeast-2 --actions "$(
  python3 -c "
import json
print(json.dumps([{'Type':'fixed-response','FixedResponseConfig':{
  'StatusCode':'503','ContentType':'text/html',
  'MessageBody':open('docs/ops/maintenance.html').read()}}]))"
)"
```

**켠 직후 확인** — alpha가 살아 있는지까지 본다.

```bash
curl -sSI --no-keepalive https://teameet.co.kr/        # 503 기대
curl -sS  --no-keepalive -o /dev/null -w '%{http_code}\n' https://alpha.teameet.co.kr/   # 200 기대
```

## 끄기

```bash
TG=$(jq -r '.[0].Actions[0].TargetGroupArn' /tmp/alb-default-rule-before.json)
aws elbv2 modify-rule --rule-arn "$RULE" --region ap-northeast-2 \
  --actions "Type=forward,TargetGroupArn=$TG"
```

**해제 확인은 반드시 새 연결로 한다.**

```bash
curl -sS --no-keepalive -o /dev/null -w '%{http_code}\n' https://teameet.co.kr/
```

`--no-keepalive` 없이 확인하면 **기존 연결이 재사용돼 503이 계속 보인다.** 2026-08-03 검증에서
실제로 이 오판을 했다 — 규칙은 이미 정상으로 돌아왔는데 같은 연결을 재사용해 503이 이어졌고,
제3의 위치에서 200을 확인하고서야 서비스가 멀쩡함을 알았다. 점검이 안 풀렸다고 착각해 불필요한
조치를 하지 않으려면 이 확인 방법을 지켜야 한다.

## 검증 기록 (2026-08-03)

프로덕션 사용자에게 영향을 주지 않고 전체 경로를 실증했다. 방법은 **`source-ip` 조건으로 운영자
IP에만 적용되는 규칙을 임시로 만드는 것**이었다.

| 확인 | 결과 |
|---|---|
| 503 + 한국어 점검 페이지 렌더 | `<h1>잠시 점검 중이에요</h1>` |
| 본문 크기 | 750 bytes (한도 1024) |
| 다른 IP 영향 | 없음 — 제3의 위치에서 prod·alpha 모두 200 |
| 타깃 상태 | 둘 다 healthy 유지 |
| 규칙 삭제 후 복구 | 새 연결에서 즉시 200 |

**주의**: `source-ip` 조건 규칙은 **host header와 무관하게 매칭된다.** 테스트 중 운영자 IP에서는
`alpha.teameet.co.kr`도 점검 페이지를 받았다. 실제 점검에서 alpha를 살려두려면 `source-ip`가
아니라 **`default` 규칙의 액션**을 바꿔야 한다.

## 운영자만 통과시키기

점검 중에 운영자가 실제 서비스를 확인해야 하면, 우선순위 1에 예외 규칙을 먼저 둔다.

```bash
aws elbv2 create-rule --listener-arn "$L" --region ap-northeast-2 --priority 1 \
  --conditions '[{"Field":"source-ip","SourceIpConfig":{"Values":["<운영자IP>/32"]}}]' \
  --actions "Type=forward,TargetGroupArn=$TG"
```

규칙은 우선순위 순으로 평가되므로, 이 규칙에 걸린 요청은 `default`의 점검 응답에 닿지 않는다.
점검 해제 시 이 예외 규칙도 함께 지운다.

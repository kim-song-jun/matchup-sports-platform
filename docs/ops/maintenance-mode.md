# 점검 모드 (maintenance mode)

환경을 잠시 세워야 할 때 사용자에게 **우리가 만든 안내 페이지**를 보여주는 절차. 각 인스턴스의
nginx가 호스트의 플래그 파일을 보고, 있으면 모든 요청에 `503` + 안내 HTML을 돌려준다. alpha와
production은 인스턴스가 따로라 **환경별로 독립**이다.

## 동작 방식

| 구성 | 위치 |
|---|---|
| 안내 HTML | `deploy/maintenance/index.html` → 컨테이너 `/etc/nginx/teameet-maintenance` (배포마다 릴리스와 함께 교체) |
| 플래그 디렉터리 | 호스트 `/home/ec2-user/.teameet-maintenance` → 컨테이너 `/etc/nginx/maintenance` (릴리스 밖이라 배포가 지우지 않음) |
| 켜짐 조건 | `/etc/nginx/maintenance/on` 파일 존재 |
| 응답 | `503`, `Retry-After: 300`, `Cache-Control: no-store`, HTML은 60초마다 자동 새로고침 |

- 플래그는 요청마다 평가되므로 **reload·재기동이 필요 없다.** 파일을 만들면 즉시, 지우면 즉시 풀린다.
- `limit_req` 초과·upstream 오류 같은 **일반 503은 점검 페이지로 바뀌지 않는다**(점검 전용 내부 코드 418을
  503으로 바꿔 내보내는 구조다).

## 켜기 / 끄기 / 확인

인스턴스는 태그 `Environment`(`production` 또는 `alpha`)로 고르고, **정확히 1개인지 단언**한다.

```bash
ENV=production   # 또는 alpha
IID=$(aws ec2 describe-instances --region ap-northeast-2 \
  --filters "Name=tag:Environment,Values=${ENV}" "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].InstanceId' --output text)
[ "$(echo "$IID" | wc -w)" -eq 1 ] || { echo "인스턴스가 1개가 아닙니다: $IID"; exit 1; }

# 켜기
aws ssm send-command --region ap-northeast-2 --instance-ids "$IID" --document-name AWS-RunShellScript \
  --parameters '{"commands":["mkdir -p /home/ec2-user/.teameet-maintenance && touch /home/ec2-user/.teameet-maintenance/on"]}'

# 끄기
aws ssm send-command --region ap-northeast-2 --instance-ids "$IID" --document-name AWS-RunShellScript \
  --parameters '{"commands":["rm -f /home/ec2-user/.teameet-maintenance/on"]}'
```

확인은 새 연결로 한다. `--no-keepalive` 없이 확인하면 기존 연결이 재사용돼 이전 응답이 보일 수 있다.

```bash
# 켠 뒤: 503 + 점검 페이지 기대
curl -sS --no-keepalive -o /dev/null -w '%{http_code}\n' https://teameet.co.kr/     # production
curl -sS --no-keepalive https://teameet.co.kr/ | grep -o '잠시 점검 중이에요'
# 끈 뒤: 200 기대
curl -sS --no-keepalive -o /dev/null -w '%{http_code}\n' https://teameet.co.kr/landing
```

## 한계

- **서버나 nginx 컨테이너 자체가 죽으면 이 점검 페이지는 뜨지 않는다.** 그 경우는 CloudFront 사용자 지정 오류 페이지(502/504)가 맡는다 — 설정은 앞단 전환 문서에서 다룬다.
- **켜 둔 동안 배포 검증이 실패한다.** `deploy.yml`·`deploy-alpha.yml`의 공개 경로 헬스 확인
  (`/landing`, `/api/v1/health`, 릴리스 헤더)이 503을 받는다. 배포 전에 끄거나, 배포가 끝난 뒤 켠다.
- **운영자 예외 통과는 없다.** 켜면 모든 접속자(운영자 포함)가 점검 페이지를 본다. 확인이 필요하면 인스턴스에서
  내부 포트로 직접 본다(`curl http://localhost:8121/api/v1/health`).
- 안내 문구를 바꾸려면 `deploy/maintenance/index.html`을 수정해 배포한다(외부 리소스 없이 인라인 스타일만 쓴다).

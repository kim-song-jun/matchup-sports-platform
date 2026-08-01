# Cloudflare 도입 — DDoS · WAF · 봇 차단

목적은 **보호**다. 캐싱·비용 절감은 이 문서의 범위가 아니다(그래서 "Cache Everything" 류
규칙을 만들지 않는다 — 인증된 페이지가 다른 사용자에게 새는 사고를 피하기 위함이다).

## 현재 구조 (2026-08-01 실측)

```
사용자
 → Route 53           teameet.co.kr · alpha.teameet.co.kr → 동일 4개 IP
 → AWS ALB (4노드)     TLS 종료 · ACM 인증서 (Amazon RSA 2048)
 → teameet-prod-tg / teameet-alpha-tg
 → EC2 nginx :443      Let's Encrypt 인증서로 재암호화
 → v1_web:3013 / v1_api:8121
```

prod 와 alpha 는 **같은 존 · 같은 ALB** 를 쓴다(호스트 기반 라우팅). 즉 존 이전은 두
환경에 동시에 영향을 준다. 프록시(오렌지 구름)만 호스트별로 따로 켤 수 있다.

## 목표 구조

```
사용자
 → Cloudflare 엣지     ← WAF · 봇 · L3/L4/L7 DDoS · rate limit
 → AWS ALB            ← 보안 그룹으로 Cloudflare 대역만 허용 (origin 잠금)
 → EC2 nginx → 앱
```

---

## ⚠️ 가장 중요한 것: origin 을 잠그지 않으면 방어가 0 이다

`teameet.co.kr` 의 ALB IP 4개는 **이미 공개 DNS 이력에 남아 있다.** Cloudflare 를 앞에
세워도 ALB 가 전 세계에서 오는 접속을 그대로 받으면, 공격자는 Cloudflare 를 건너뛰고
ALB 를 직접 때린다. WAF 도 rate limit 도 봇 차단도 전부 무의미해진다.

**그래서 SG 잠금은 선택이 아니라 이 작업의 본체다.** 다만 순서가 중요하다 — 트래픽이
실제로 Cloudflare 를 통해 흐르는 것을 확인한 **뒤에** 잠근다. 반대로 하면 전면 장애다.

---

## 사전에 반영해야 하는 코드 변경 (이 PR)

| 파일 | 변경 |
|---|---|
| `deploy/cloudflare-real-ip.conf` | **신규.** Cloudflare 엣지 대역 `set_real_ip_from` 목록 (생성물) |
| `deploy/nginx.alpha.conf` · `deploy/nginx.conf` | 위 파일 include + `real_ip_recursive on` |
| `deploy/docker-compose.alpha.yml` · `.prod.yml` | 스니펫을 nginx 컨테이너에 read-only 마운트 |
| `scripts/infra/sync-cloudflare-ips.sh` | 대역 재생성 + ALB SG 동기화 (기본 dry-run) |

### 왜 `real_ip_recursive on` 인가

Cloudflare 를 앞에 세우면 nginx 에 도착하는 `X-Forwarded-For` 가 이렇게 된다:

```
<실사용자>, <Cloudflare 엣지>       ← ALB 가 자기가 본 주소(=엣지)를 끝에 덧붙임
```

기존 설정(`recursive off`)은 **마지막** 값을 실주소로 삼으므로 접속자 전원이 엣지 IP
하나로 뭉친다 → `limit_req` 가 전원 합산으로 붕괴한다. **2026-07-25 에 ALB 도입으로
똑같은 사고를 이미 겪었다** (`/my` 진입·카카오 로그인이 "오류 + 인증 풀림"으로 보였던 건
전부 이것 때문이었다). Cloudflare 는 그 전제를 다시 깬다.

`recursive on` 은 XFF 를 오른쪽부터 훑으며 신뢰 대역(ALB + Cloudflare)을 건너뛰고 첫
비신뢰 주소에서 멈춘다. 실제 nginx 로 측정한 결과:

| 시나리오 (XFF) | `off` (현행) | `on` (변경 후) |
|---|---|---|
| `203.0.113.9` — Cloudflare 미경유 | `203.0.113.9` ✅ | `203.0.113.9` ✅ |
| `203.0.113.9, 172.68.1.1` — 경유 | **`172.68.1.1`** ❌ | `203.0.113.9` ✅ |
| `1.2.3.4, 203.0.113.9, 172.68.1.1` — 위조+경유 | **`172.68.1.1`** ❌ | `203.0.113.9` ✅ |

**Cloudflare 미경유 상태에서 결과가 같다**는 점이 중요하다 — DNS 를 전환하기 전에 이
설정을 먼저 배포해도 아무것도 바뀌지 않는다. 그래서 코드를 먼저 넣고 전환은 나중에 해도
안전하다.

위조가 통하지 않는 이유는 Cloudflare 가 실주소를 위조값 **뒤에** 덧붙이기 때문이다.
오른쪽부터 훑는 탐색은 위조값에 닿기 전에 실주소에서 멈춘다.

---

## 단계별 절차

### 0단계 — 코드 배포 (에이전트/개발자)

이 PR 을 `dev` 에 머지 → alpha 자동 배포. **이 시점에는 아직 아무 동작도 바뀌지 않는다**
(위 표의 첫 행). alpha 가 정상인지만 확인한다.

```bash
curl -sI https://alpha.teameet.co.kr/ | grep -i x-teameet   # 릴리스 헤더 정상
```

> **bind mount 주의**: 스니펫 파일은 bind mount 라 파일을 갈아끼우면 inode 가 바뀐다.
> `nginx -s reload` 로는 반영되지 않으므로 `up -d --force-recreate --no-deps nginx` 가
> 필요하다. `restart-containers.sh` 가 이미 `--force-recreate` 를 쓴다.

### 1단계 — 존 이전 (사용자)

Cloudflare 는 프록시를 하려면 **권위 DNS** 여야 한다(Free/Pro 기준). 따라서 Route 53 에서
Cloudflare 로 존을 옮겨야 한다.

1. Cloudflare 계정 생성 → **Add a site** → `teameet.co.kr`
2. Cloudflare 가 기존 레코드를 자동으로 읽어온다. **반드시 전수 대조할 것** — 자동
   임포트는 종종 누락한다. Route 53 콘솔의 레코드와 하나씩 맞춰본다.
   - `teameet.co.kr` A (4개)
   - `alpha.teameet.co.kr` A (4개)
   - MX · TXT(SPF/DKIM/DMARC) — **메일이 걸려 있으면 누락 시 메일이 죽는다**
   - SES 검증용 CNAME/TXT (인증 메일 발송에 필요)
3. **이 단계에서는 모든 레코드를 회색 구름(DNS only)으로 둔다.**
4. 등록기관(`.co.kr`)에서 네임서버를 Cloudflare 가 준 2개로 변경
5. 전파 확인 (수 분~수 시간):
   ```bash
   dig +short teameet.co.kr NS       # ns.cloudflare.com 계열로 바뀌면 완료
   dig +short teameet.co.kr          # 기존 4개 IP 그대로여야 정상
   ```

> 이 단계까지는 **트래픽 경로가 전혀 바뀌지 않는다.** Cloudflare 는 DNS 응답만 한다.

### 2단계 — alpha 만 프록시 켜기 (사용자)

`alpha.teameet.co.kr` 레코드를 **오렌지 구름(Proxied)** 으로 전환.

동시에 설정할 것:

| 위치 | 값 | 이유 |
|---|---|---|
| SSL/TLS → Overview | **Full (strict)** | ALB 의 ACM 인증서는 공인 인증서라 strict 가 성립한다. Flexible 은 절대 쓰지 말 것 — 엣지↔origin 구간이 평문이 된다 |
| SSL/TLS → Edge Certificates | Always Use HTTPS **켬** | |
| SSL/TLS → Edge Certificates | Minimum TLS 1.2 | |
| Network | WebSockets **켬** | `v1_api` 의 `RealtimeGateway` 가 Socket.IO 를 쓴다. 꺼져 있으면 실시간 기능이 죽는다 |
| Speed → Optimization | Rocket Loader **끔** | Next.js 하이드레이션과 충돌한다 |
| Caching | 기본값 유지 | 목적이 보호라 캐시 규칙을 추가하지 않는다 |

확인:

```bash
curl -sI https://alpha.teameet.co.kr/ | grep -iE "^(server|cf-ray|x-teameet)"
# server: cloudflare  +  cf-ray: ...  가 보이면 프록시 경유 중
```

### 3단계 — 실사용자 IP 가 제대로 잡히는지 검증 (사용자 + 개발자)

이게 통과해야 다음으로 간다. **여기서 실패하면 rate limit 이 전원 합산으로 붕괴한다.**

EC2 에서:

```bash
docker compose -f deploy/docker-compose.alpha.yml logs --tail=50 nginx | tail -20
```

- access log 의 client 주소가 **실사용자 IP** 여야 한다
- `172.31.x.x`(ALB) 나 `172.68.x.x`·`104.x.x.x`(Cloudflare 엣지) 가 찍히면 **실패** —
  진행하지 말고 `real_ip` 설정부터 다시 볼 것
- error log 에 `limiting requests ... by zone` 이 급증하면 같은 증상이다

브라우저에서 alpha 를 몇 화면 돌아다녀 보고(특히 `/my`, 목록 화면) 503 이 안 나는지 확인.

### 4단계 — WAF · 봇 규칙 (사용자)

**Security → WAF**

| 설정 | 권장 | 주의 |
|---|---|---|
| Managed Rules → Cloudflare Free Managed Ruleset | 켬 | |
| Rate limiting rules (Free 1개) | `/api/v1/auth/*` 대상, IP 당 10req/10s → Managed Challenge | nginx 의 `v1auth` 30r/m 과 이중 방어 |
| Bot Fight Mode | **처음엔 끔** | 아래 참조 |

> **Bot Fight Mode 주의.** JS 챌린지를 삽입하는 방식이라 브라우저가 아닌 클라이언트를
> 봇으로 판정한다. 지금 v1 은 웹 전용이라 위험이 낮지만, 나중에 네이티브 앱(Capacitor)이
> 붙거나 서버간 호출이 생기면 `/api/v1/*` 이 통째로 막힌다. 켤 거라면 먼저 alpha 에서
> 켜고 **로그인 → 대회 신청 → 실시간 알림**까지 한 바퀴 돌려본 뒤 prod 로 넘긴다.

### 5단계 — origin 잠금 (사용자, **되돌리기 어려움 — 신중히**)

3·4단계가 안정된 뒤에만 한다.

```bash
# 먼저 차이만 확인 (아무것도 바꾸지 않음)
scripts/infra/sync-cloudflare-ips.sh --sg <ALB-보안그룹-ID>

# 확인 후 반영
scripts/infra/sync-cloudflare-ips.sh --sg <ALB-보안그룹-ID> --apply-sg
```

- 기본은 **443 만** 잠근다. 80 은 열어 둔다 — 301 리다이렉트와 Let's Encrypt HTTP-01
  챌린지만 처리하는데, LE 검증 서버는 임의 IP 에서 오므로 잠그면 인증서 갱신이 조용히
  실패한다.
- 80 까지 잠그고 싶으면 **먼저** certbot 을 DNS-01(Cloudflare API 토큰)로 바꾼다.
  그 뒤 `PORTS=443,80 scripts/infra/sync-cloudflare-ips.sh --sg ... --apply-sg`.
- 스크립트는 **추가를 먼저 하고 제거를 나중에** 한다 — 순서가 반대면 그 사이 트래픽이
  끊긴다.

잠근 뒤 확인:

```bash
curl -sI --max-time 10 --connect-to "alpha.teameet.co.kr:443:<ALB-IP>:443" \
     https://alpha.teameet.co.kr/     # 타임아웃 나야 정상 (직접 접근 차단됨)
curl -sI https://alpha.teameet.co.kr/ # 정상 응답이어야 함 (Cloudflare 경유)
```

### 6단계 — prod 적용 (사용자)

alpha 가 며칠 안정적으로 돌아간 것을 확인한 뒤 `teameet.co.kr` · `www` 레코드를 오렌지
구름으로 전환하고 3~5단계를 동일하게 반복한다.

---

## 롤백

| 단계 | 되돌리는 법 | 소요 |
|---|---|---|
| 프록시 (2~4단계) | 해당 레코드를 **회색 구름**으로 토글 | 즉시 (수 초) |
| origin 잠금 (5단계) | SG 인바운드에 `0.0.0.0/0` 재추가 | 즉시 |
| 존 이전 (1단계) | 등록기관에서 NS 를 Route 53 으로 복귀 | 수 분~수 시간 (전파) |
| 코드 (0단계) | `real_ip_recursive on` 제거 후 재배포 | 배포 1회 |

**Route 53 호스팅 존을 즉시 삭제하지 말 것.** 되돌릴 때 필요하다. 최소 한 달은 남겨 둔다
(비용은 존당 월 $0.50 수준).

---

## 유지보수

Cloudflare 는 IP 대역을 드물게(연 1~2회) 바꾼다. 놓치면 **조용히** 터진다:

- nginx 쪽을 놓치면 → 새 엣지에서 온 요청의 실사용자 IP 를 못 집어 rate limit 붕괴
- SG 쪽을 놓치면 → 새 엣지가 origin 에 닿지 못해 일부 사용자에게만 502

```bash
scripts/infra/sync-cloudflare-ips.sh                 # 드리프트 확인 (exit 2 = 변경 필요)
scripts/infra/sync-cloudflare-ips.sh --write         # conf 갱신 → 커밋 → 배포
```

`exit 2` 를 쓰므로 CI 주기 작업이나 cron 으로 감시 게이트를 걸 수 있다.

---

## 알아 둘 것

- **ALB 비용은 그대로다.** Cloudflare 가 ALB 를 대체하지 않는다.
- **origin 을 노출하는 다른 레코드가 없는지 확인.** 회색 구름으로 남은 서브도메인이나
  ALB DNS 이름을 직접 가리키는 레코드가 하나라도 있으면 그쪽으로 우회당한다.
- **메일 레코드(MX/SPF/DKIM)는 프록시할 수 없다** — 반드시 회색 구름으로 둔다.
- prod 인증서 갱신: `deploy/nginx.conf` 에는 `.well-known/acme-challenge/` location 이
  없다(alpha 에만 있다). ALB 는 백엔드 인증서를 검증하지 않으므로 당장 사용자 영향은
  없지만, prod 의 Let's Encrypt 갱신이 실제로 어떻게 되고 있는지는 별도로 확인해야 한다.

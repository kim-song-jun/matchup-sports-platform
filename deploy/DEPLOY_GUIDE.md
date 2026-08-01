# Teameet v1 EC2 배포 가이드

이 문서는 `apps/v1_api`와 `apps/v1_web`으로 구성된 v1 운영 스택만 다룬다.

`dev` 전용 alpha는 production SSH 배포와 분리된다. alpha는 GitHub runner에서 만든 ECR digest 이미지와 S3 release manifest를 사용하며, 운영 계약과 rollback 절차는 [`docs/ops/v1-alpha-environment.md`](../docs/ops/v1-alpha-environment.md)를 따른다. 이 가이드의 local image build·production 절차를 alpha에 적용하지 않는다.

## 1. 공개 경로 계약

Nginx는 v1 Web을 별도 브라우저 prefix 없이 루트에 제공한다.

| 공개 경로 | 대상 | 용도 |
|---|---|---|
| `/` 및 페이지 경로 | `v1_web:3013` | Next.js Web |
| `/_next/static/*` | `v1_web:3013` | 정적 빌드 자산 |
| `/api/v1/*` | `v1_api:8121` | canonical backend API |
| `/uploads/*` | `v1_api:8121/uploads/*` | 업로드 자산 |

브라우저용 API base는 `/api/v1`, 서버 내부 API origin은 `http://v1_api:8121`이다. Web 페이지, 정적 자산, 업로드 자산은 모두 루트 기준 경로를 사용한다.

기존 browser base path `/v1`은 제거됐다. `/v1`, `/v1/home`, `/v1/tournaments` 같은 browser 경로는 직접 서빙되지 않고, 북마크·카카오 OAuth `redirect_uri` 등 레거시 링크 호환을 위해 `/v1` 접두사만 제거한 동일 경로로 308 permanent redirect된다(`apps/v1_web/next.config.ts`의 `redirects()`). 이 redirect 계약은 backend prefix `/api/v1`과 무관하며, `/api/v1/*`는 계속 canonical API 경로다.

## 2. EC2 준비

권장 최소 사양은 서울 리전의 Amazon Linux 2023, `t3.small`(2 vCPU, 2 GB), gp3 20 GB다. 보안 그룹은 SSH 관리 IP의 22번 포트와 공개 80/443 포트만 연다.

```text
22/tcp   관리 IP
80/tcp   0.0.0.0/0
443/tcp  0.0.0.0/0
```

## 3. 초기 배포

EC2에 접속해 초기 설정 스크립트를 실행한다.

```bash
ssh -i teameet-key.pem ec2-user@<EC2_IP>
curl -sL https://raw.githubusercontent.com/kim-song-jun/teameet-sports-platform/main/deploy/setup-ec2.sh | bash
```

스크립트는 Docker, Docker Compose, Git, `jq`를 준비하고 v1 이미지 빌드, v1 PostgreSQL 기동, Prisma migration, 전체 스택 기동, root Web/API health check를 순서대로 수행한다. `deploy/.env`가 이미 있으면 보존한다.

성공 기준은 root Web/API 요청이 성공하고 legacy browser `/v1` 경로가 제거된 상태를 함께 만족하는 것이다.

```bash
curl -fsS http://localhost:8121/api/v1/health | jq -e '.data.checks.db == true'
curl -fsS http://localhost/api/v1/health | jq -e '.data.checks.db == true'
curl -fsS http://localhost/landing > /dev/null
test "$(curl -sS -o /dev/null -w '%{http_code}' http://localhost:3013/v1/home)" = "308"
```

## 4. GitHub Actions 배포

`.github/workflows/deploy.yml`은 main push 또는 수동 dispatch에서 테스트가 통과한 뒤 배포한다.

필수 GitHub Actions secret:

| 이름 | 책임 |
|---|---|
| `EC2_HOST` | 배포 대상 EC2 주소 |
| `EC2_SSH_KEY` | EC2 SSH private key |
| `EC2_KNOWN_HOSTS` | 신뢰한 EC2 SSH host public key를 담은 known_hosts 한 줄 이상 |
| `TOSS_CLIENT_KEY` | 결제 client key, 선택 |
| `TOSS_SECRET_KEY` | 결제 server key, 선택 |
| `TOSS_WEBHOOK_SECRET` | 결제 webhook 검증 key, 선택 |
| `KAKAO_CLIENT_ID` | Kakao OAuth client id, 선택 |
| `KAKAO_CLIENT_SECRET` | Kakao OAuth client secret, 선택 |
| `KAKAO_REDIRECT_URI` | Kakao OAuth callback, 선택 |
| `V1_HOST_ADMIN_PASSWORD` | v1 host admin password |
| `GA_PROD` | production GA4 Measurement ID, 선택 |
| `VAPID_PUBLIC_KEY` | Web Push VAPID public key, 선택 (미설정 시 `WebPushService`가 graceful disable) |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key, 선택 (미설정 시 `WebPushService`가 graceful disable) |
| `VAPID_SUBJECT` | Web Push VAPID subject (`mailto:` 또는 `https:` URI), 선택 |

`EC2_KNOWN_HOSTS`는 배포 시점의 `ssh-keyscan` 결과를 즉석에서 신뢰하지 않는다. 먼저 AWS Systems Manager 또는 EC2 콘솔처럼 AWS 제어면을 통해 대상 인스턴스에서 host key fingerprint를 확인하고, 별도 로컬 `ssh-keyscan -t ed25519 <EC2_HOST>` 결과의 fingerprint가 같은지 대조한 뒤 그 known_hosts 줄을 GitHub secret으로 등록한다. 값이 없거나 `EC2_HOST`와 일치하지 않으면 배포는 연결 전에 fail-closed 된다.

```bash
ssh-keyscan -t ed25519 <EC2_HOST> > ec2-known-hosts
ssh-keygen -lf ec2-known-hosts
gh secret set EC2_KNOWN_HOSTS < ec2-known-hosts
```

GitHub Actions의 OAuth·관리자·GA 값은 SSH 명령줄 인자가 아니라 원격 `bash` 표준입력으로만 전달한다. 따라서 프로세스 목록에 값이 남지 않으며, EC2에는 별도 임시 secret 파일을 만들지 않는다.

배포는 **승인 게이트를 기준으로 두 job으로 나뉜다**. 빌드는 게이트 앞에서 끝내고, 승인 뒤에는 마이그레이션과 컨테이너 교체만 남긴다 — 승인 대기가 배포 시간의 대부분이었기 때문이다(실측 29분).

**`build-images` job — 승인 전, 서비스에 영향 없음**

1. 저장소를 EC2의 `~/teameet`에 동기화하며 기존 `deploy/.env`를 보호한다.
2. v1 API와 v1 Web 이미지만 빌드하고 **커밋 SHA로 태그**한다(`teameet-v1-api:<sha>`).
3. v1 Web 빌드에는 browser API base `/api/v1`과 internal API origin `http://v1_api:8121`을 주입한다. Kakao·GA 빌드 인자는 GitHub secret 값을 그대로 쓰며, **`deploy/.env`는 읽기만 한다**.
4. 레이어 캐시를 사용한다. Dockerfile이 lockfile → `pnpm install` → 소스 순서로 짜여 있고 pnpm store와 `.next/cache`를 BuildKit 캐시 마운트로 잡으므로, lockfile이 그대로면 install 단계를 재사용한다. 베이스 이미지는 `--pull`로 매번 최신을 당겨 온다.
5. 릴리스 태그는 최근 5개만 남긴다(빌드 전후 두 번 정리해 새 태그를 포함해 정확히 5개). `:latest`는 여기서 건드리지 않는다.

이 job은 **DB·실행 중인 컨테이너·`deploy/.env`·`:latest`를 건드리지 않는다.** 승인이 거부되면 호스트에는 새 소스 트리와 사용되지 않는 `:<sha>` 이미지만 남고, 서비스는 이전 릴리스로 계속 돌아간다. 재부팅되더라도 compose가 참조하는 `:latest`가 그대로이므로 이전 릴리스가 뜬다.

**`deploy` job — `production` environment 승인 후**

6. GitHub secret·variable을 `deploy/.env`로 동기화하고 권한을 `600`으로 유지한다. compose가 참조하는데 값이 빈 키가 있으면 경고를 남긴다. **런타임 설정 변경이 승인 뒤에만 일어나도록 이 단계는 여기 있다** — 승인 전에 바꾸면 그 사이 재기동이 "새 설정 + 옛 이미지" 조합을 띄울 수 있다.
7. `:<sha>` 이미지가 실제로 있는지 확인한 뒤 **`:latest`로 승격**한다. 즉 `:latest`는 항상 마지막으로 *승인된* 릴리스를 가리킨다.
8. `v1_postgres`를 먼저 기동하고 `prisma migrate deploy`를 실행한다.
9. `deploy/restart-containers.sh`로 v1 스택을 재기동한다.
10. workflow는 internal API, root-origin API, root Web과 legacy browser `/v1/home`이 현재 경로로 308 redirect되는지를 함께 health check한다.

`build-images`와 `deploy`는 같은 concurrency group(`deploy-production`)을 공유한다. 승인 대기 중인 릴리스가 있으면 다음 릴리스의 빌드도 뒤에 큐잉되므로, 두 릴리스가 같은 호스트를 동시에 건드리지 않는다.

### 4-1. 이전 릴리스로 롤백

이미지가 커밋 SHA로 태그돼 있으므로 재빌드 없이 되돌릴 수 있다. 배포 파이프라인을 다시 타면 빌드와 승인 게이트를 또 통과해야 하니, 장애 대응에는 아래 경로를 쓴다.

```bash
# 1. 호스트에 남아 있는 릴리스 태그 확인 (최근 5개 보관)
sudo docker images --filter 'reference=teameet-v1-api:*' \
  --format '{{.CreatedAt}}\t{{.Repository}}:{{.Tag}}' | sort -r

# 2. 되돌릴 SHA 를 :latest 로 다시 붙인다
sudo docker tag teameet-v1-api:<이전-sha> teameet-v1-api:latest
sudo docker tag teameet-v1-web:<이전-sha> teameet-v1-web:latest

# 3. 컨테이너 교체
bash ~/teameet/deploy/restart-containers.sh
```

**DB 마이그레이션은 되돌아가지 않는다.** 이 절차는 애플리케이션 이미지만 교체한다. 되돌리려는 릴리스가 파괴적 스키마 변경(컬럼·테이블 삭제)을 포함했다면 이미지만 내려도 앱이 깨질 수 있으므로, 롤백 전에 해당 릴리스의 migration 내용을 먼저 확인한다.

## 5. 운영 환경 변수

운영 값은 EC2의 `deploy/.env`에서 관리한다. 파일 권한은 `600`으로 유지하고 내용을 로그나 CI 출력에 노출하지 않는다.

| 이름 | 책임 |
|---|---|
| `V1_DB_USER`, `V1_DB_PASSWORD`, `V1_DB_NAME` | v1 PostgreSQL 연결 |
| `V1_SESSION_SECRET` | v1 HttpOnly 세션 서명 secret(32자 이상); 미설정 시 `V1_JWT_SECRET` 사용 |
| `V1_JWT_SECRET` | 기존 v1 서명 secret 및 `V1_SESSION_SECRET` fallback |
| `FRONTEND_URL` | production CORS 및 브라우저 mutation origin 검증에 쓰는 canonical HTTPS origin; 기본값 `https://teameet.co.kr` |
| `V1_INTERNAL_API_ORIGIN` | Next.js server-side API origin; 기본값 `http://v1_api:8121` |
| `DEPLOY_SYNC_V1_SEED_DATA` | 검토된 v1 seed sync opt-in; 기본 비활성 |
| `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI` | Kakao OAuth |
| `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `TOSS_WEBHOOK_SECRET` | 결제 연동 |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push (`WebPushService`); 셋 중 하나라도 비어 있으면 graceful disable. 생성·회전 절차는 `docs/ops/vapid-setup.md` 참조 |

`v1_web`의 브라우저 API URL은 이미지 빌드 시 `/api/v1`로 고정한다. 배포 환경에 별도 Web base path를 설정하지 않는다.

`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`는 **production(`deploy.yml`)에서만** GitHub Actions secret → `deploy/.env` 동기화 대상이다(4절 표, `sync_env_from_github_secret` 패턴). **Alpha(`deploy-alpha.yml` / `deploy/deploy-alpha.sh`)에는 의도적으로 배선하지 않는다** — alpha의 `deploy/.env`는 CI가 건드리지 않는 operator-managed 파일이며(`KAKAO_CLIENT_ID`/`KAKAO_CLIENT_SECRET`와 동일 선례), `GA_ALPHA`만 예외인 이유는 Web 빌드 시점에 `NEXT_PUBLIC_GA_MEASUREMENT_ID` build-arg로 번들에 굽기 위해 SSM 파라미터로 직접 전달되는 것일 뿐 `deploy/.env`에 쓰이지 않기 때문이다. VAPID는 build-arg가 아니라 `v1_api` 컨테이너 런타임 secret이므로 이 경로를 재사용할 수 없다. Alpha에서 Web Push를 켜려면 운영자가 alpha EC2의 `~/teameet/deploy/.env`에 `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`를 직접 추가한다(미설정 시 `WebPushService`가 graceful disable되므로 배포 자체는 안전).

## 6. 컨테이너 구성

```text
Internet :80/:443
        |
      nginx
       |  \
       |   +-- /api/v1/*, /uploads/* --> v1_api:8121 --> v1_postgres:5432
       +------ /, /_next/static/* ------> v1_web:3013
```

호스트에는 API `8121`과 Web `3013`이 loopback으로만 노출된다. 외부 요청은 Nginx를 통해서만 받는다.

## 7. 수동 배포

CI를 사용할 수 없을 때만 아래 순서로 실행한다.

```bash
cd ~/teameet
set -a
. deploy/.env
set +a

sudo docker build -f deploy/Dockerfile.v1-api -t teameet-v1-api .
sudo docker build \
  -f deploy/Dockerfile.v1-web \
  --build-arg NEXT_PUBLIC_API_URL=/api/v1 \
  --build-arg INTERNAL_API_ORIGIN="${V1_INTERNAL_API_ORIGIN:-http://v1_api:8121}" \
  --build-arg NEXT_PUBLIC_KAKAO_CLIENT_ID="${KAKAO_CLIENT_ID:-}" \
  --build-arg NEXT_PUBLIC_KAKAO_REDIRECT_URI="${KAKAO_REDIRECT_URI:-}" \
  -t teameet-v1-web .

cd deploy
if sudo docker compose version >/dev/null 2>&1; then
  COMPOSE="sudo docker compose"
else
  COMPOSE="sudo docker-compose"
fi

${COMPOSE} -f docker-compose.prod.yml --env-file .env up -d v1_postgres
${COMPOSE} -f docker-compose.prod.yml --env-file .env \
  run --rm --no-deps -T v1_api sh -c \
  "cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy"
${COMPOSE} -f docker-compose.prod.yml --env-file .env up -d

curl -fsS http://localhost:8121/api/v1/health | jq -e '.data.checks.db == true'
curl -fsS http://localhost/api/v1/health | jq -e '.data.checks.db == true'
curl -fsS http://localhost/landing > /dev/null
test "$(curl -sS -o /dev/null -w '%{http_code}' http://localhost:3013/v1/home)" = "308"
```

## 8. 운영 명령

```bash
cd ~/teameet/deploy

sudo docker compose -f docker-compose.prod.yml --env-file .env ps
sudo docker logs teameet_v1_api -f --tail 100
sudo docker logs teameet_v1_web -f --tail 100
sudo docker logs teameet_nginx -f --tail 100

sudo docker compose -f docker-compose.prod.yml --env-file .env restart v1_api
sudo docker compose -f docker-compose.prod.yml --env-file .env restart v1_web
sudo docker compose -f docker-compose.prod.yml --env-file .env restart nginx
```

DB backup과 복원은 v1 PostgreSQL container와 v1 DB 이름을 명시한다.

```bash
docker exec teameet_v1_postgres \
  pg_dump -U "${V1_DB_USER:-teameet_v1}" "${V1_DB_NAME:-teameet_v1}" \
  > "v1_backup_$(date +%Y%m%d).sql"

cat v1_backup.sql | docker exec -i teameet_v1_postgres \
  psql -U "${V1_DB_USER:-teameet_v1}" "${V1_DB_NAME:-teameet_v1}"
```

## 9. TLS

DNS A record를 EC2 public IP에 연결한 뒤 Let's Encrypt 인증서를 발급하고 `deploy/nginx.conf`의 인증서 경로와 실제 도메인을 일치시킨다.

```bash
sudo certbot certonly --standalone -d teameet.co.kr -d www.teameet.co.kr
sudo docker compose -f docker-compose.prod.yml --env-file .env up -d nginx
```

TLS 적용 후에도 `/`, `/api/v1/*`, `/uploads/*`의 공개 경로 계약은 동일하다.

공개 origin에서도 HTTPS 응답이 legacy path를 되살리지 않는지 확인한다. HTTP 80은 HTTPS redirect가 정상이라 301일 수 있으므로 negative path 판정에는 HTTPS를 사용한다.

```bash
test "$(curl -sS --resolve teameet.co.kr:443:127.0.0.1 -o /dev/null -w '%{http_code}' https://teameet.co.kr/v1/home)" = "308"
```

## 10. 트러블슈팅

- Web health가 실패하면 `teameet_v1_web` 로그와 `http://localhost:3013/landing`을 확인한다.
- API health가 실패하면 `teameet_v1_api` 로그, `v1_postgres` health, Prisma migration 상태를 확인한다.
- Nginx에서만 실패하면 `nginx -t`, upstream container health, root path proxy 순으로 확인한다.
- 업로드 쓰기 실패 시 persistent volume의 owner가 v1 API container UID/GID와 일치하는지 확인한다.
- 이미지 빌드 중 메모리가 부족하면 인스턴스를 확장하거나 swap을 임시로 추가한다.

# Teameet v1 EC2 배포 가이드

이 문서는 `apps/v1_api`와 `apps/v1_web`으로 구성된 v1 운영 스택만 다룬다.

## 1. 공개 경로 계약

Nginx는 v1 Web을 별도 브라우저 prefix 없이 루트에 제공한다.

| 공개 경로 | 대상 | 용도 |
|---|---|---|
| `/` 및 페이지 경로 | `v1_web:3013` | Next.js Web |
| `/_next/static/*` | `v1_web:3013` | 정적 빌드 자산 |
| `/api/v1/*` | `v1_api:8121` | canonical backend API |
| `/uploads/*` | `v1_api:8121/uploads/*` | 업로드 자산 |

브라우저용 API base는 `/api/v1`, 서버 내부 API origin은 `http://v1_api:8121`이다. Web 페이지, 정적 자산, 업로드 자산은 모두 루트 기준 경로를 사용한다.

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

성공 기준은 다음 세 요청이 모두 성공하는 것이다.

```bash
curl -fsS http://localhost:8121/api/v1/health | jq -e '.data.checks.db == true'
curl -fsS http://localhost/api/v1/health | jq -e '.data.checks.db == true'
curl -fsS http://localhost/landing > /dev/null
```

## 4. GitHub Actions 배포

`.github/workflows/deploy.yml`은 main push 또는 수동 dispatch에서 테스트가 통과한 뒤 배포한다.

필수 GitHub Actions secret:

| 이름 | 책임 |
|---|---|
| `EC2_HOST` | 배포 대상 EC2 주소 |
| `EC2_SSH_KEY` | EC2 SSH private key |
| `TOSS_CLIENT_KEY` | 결제 client key, 선택 |
| `TOSS_SECRET_KEY` | 결제 server key, 선택 |
| `TOSS_WEBHOOK_SECRET` | 결제 webhook 검증 key, 선택 |
| `KAKAO_CLIENT_ID` | Kakao OAuth client id, 선택 |
| `KAKAO_CLIENT_SECRET` | Kakao OAuth client secret, 선택 |
| `KAKAO_REDIRECT_URI` | Kakao OAuth callback, 선택 |
| `V1_HOST_ADMIN_PASSWORD` | v1 host admin password |

배포 단계는 다음 계약을 따른다.

1. 저장소를 EC2의 `~/teameet`에 동기화하며 기존 `deploy/.env`를 보호한다.
2. v1 API와 v1 Web 이미지만 빌드한다.
3. v1 Web 빌드에는 browser API base `/api/v1`과 internal API origin `http://v1_api:8121`을 주입한다.
4. `v1_postgres`를 먼저 기동하고 `prisma migrate deploy`를 실행한다.
5. `deploy/restart-containers.sh`로 v1 스택을 재기동한다.
6. internal API, root-origin API, root Web을 모두 health check한다.

## 5. 운영 환경 변수

운영 값은 EC2의 `deploy/.env`에서 관리한다. 파일 권한은 `600`으로 유지하고 내용을 로그나 CI 출력에 노출하지 않는다.

주요 변수 책임:

| 이름 | 책임 |
|---|---|
| `V1_DB_USER`, `V1_DB_PASSWORD`, `V1_DB_NAME` | v1 PostgreSQL 연결 |
| `V1_JWT_SECRET` | v1 인증 서명 secret |
| `V1_INTERNAL_API_ORIGIN` | Next.js server-side API origin; 기본값 `http://v1_api:8121` |
| `V1_ALLOW_HEADER_AUTH` | 임시 header auth의 production 명시 opt-in |
| `DEPLOY_SYNC_V1_SEED_DATA` | 검토된 v1 seed sync opt-in; 기본 비활성 |
| `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI` | Kakao OAuth |
| `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `TOSS_WEBHOOK_SECRET` | 결제 연동 |

`v1_web`의 브라우저 API URL은 이미지 빌드 시 `/api/v1`로 고정한다. 배포 환경에 별도 Web base path를 설정하지 않는다.

## 6. 컨테이너 구성

```text
Internet :80/:443
        |
      nginx
       |  \
       |   +-- /api/v1/*, /uploads/* --> v1_api:8121
       +------ /, /_next/static/* ------> v1_web:3013
                                              |
                                        v1_postgres:5432
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

## 10. 트러블슈팅

- Web health가 실패하면 `teameet_v1_web` 로그와 `http://localhost:3013/landing`을 확인한다.
- API health가 실패하면 `teameet_v1_api` 로그, `v1_postgres` health, Prisma migration 상태를 확인한다.
- Nginx에서만 실패하면 `nginx -t`, upstream container health, root path proxy 순으로 확인한다.
- 업로드 쓰기 실패 시 persistent volume의 owner가 v1 API container UID/GID와 일치하는지 확인한다.
- 이미지 빌드 중 메모리가 부족하면 인스턴스를 확장하거나 swap을 임시로 추가한다.

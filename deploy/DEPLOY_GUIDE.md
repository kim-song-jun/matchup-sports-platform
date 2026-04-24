# Teameet EC2 배포 가이드

## 1. EC2 인스턴스 생성

### 권장 사양

| 항목 | 스펙 | 비용 |
|------|------|------|
| **인스턴스** | **t3.small** (2vCPU, 2GB) | ~$15/월 |
| 스토리지 | gp3 20GB | ~$1.6/월 |
| 리전 | ap-northeast-2 (서울) | - |
| OS | Amazon Linux 2023 | - |
| **총 예상** | | **~$17/월** |

> t3.micro(1GB)는 Docker 빌드 시 메모리 부족. t3.small이 최소 권장.
> 트래픽이 늘면 t3.medium(4GB, ~$30/월)으로 업그레이드.

### AWS 콘솔에서 EC2 생성

1. **AWS 콘솔** → EC2 → "인스턴스 시작"
2. **이름**: `teameet-server`
3. **AMI**: Amazon Linux 2023 (기본)
4. **인스턴스 유형**: `t3.small`
5. **키 페어**: 새로 생성 또는 기존 키 선택 → `.pem` 파일 다운로드
6. **네트워크 설정**:
   - "퍼블릭 IP 자동 할당": 활성화
   - 보안 그룹 아래 참조
7. **스토리지**: 20GB gp3
8. **시작**

### 보안 그룹 설정

```
인바운드 규칙:
┌──────┬──────────┬──────────────────┐
│ 포트 │ 프로토콜  │ 소스             │
├──────┼──────────┼──────────────────┤
│ 22   │ TCP      │ 내 IP (SSH)      │
│ 80   │ TCP      │ 0.0.0.0/0 (HTTP) │
│ 443  │ TCP      │ 0.0.0.0/0 (HTTPS)│
└──────┴──────────┴──────────────────┘
```

---

## 2. EC2 원클릭 배포

EC2에 SSH 접속 후 아래 한 줄 실행:

```bash
ssh -i teameet-key.pem ec2-user@<EC2_퍼블릭_IP>

# 원클릭 설치 + 배포
curl -sL https://raw.githubusercontent.com/kim-song-jun/teameet-sports-platform/main/deploy/setup-ec2.sh | bash
```

> `setup-ec2.sh`는 `TOSS_*` 값을 주면 `deploy/.env`에 반영합니다. 값을 비워 둬도 배포는 계속되며, 결제 기능만 mock mode로 동작합니다.

이 스크립트가 자동으로 처리하는 것:
- Docker + Docker Compose 설치
- `jq` 설치 (healthcheck parser)
- Git 설치 + 프로젝트 클론
- DB 비밀번호, JWT Secret 랜덤 생성
- 선택적 `TOSS_*` 값 `deploy/.env` 반영
- Docker 이미지 빌드 (~5-10분)
- PostgreSQL + Redis 시작
- DB 스키마 적용 (Prisma)
- Nginx 리버스 프록시 설정
- 헬스체크

완료 후 출력:
```
🎉 Teameet 배포 완료!
  🌐 웹사이트:  http://<EC2_IP>
  📚 API 문서:  http://<EC2_IP>/docs
  🏥 헬스체크:  http://<EC2_IP>/api/v1/health
```

---

## 3. GitHub Actions CI/CD 설정

main 브랜치에 push하면 자동으로 EC2에 배포됩니다.

### GitHub Secrets 등록

GitHub 레포 → Settings → Secrets and variables → Actions → "New repository secret"

| Secret 이름 | 값 | 예시 |
|-------------|---|------|
| `EC2_HOST` | EC2 퍼블릭 IP | `3.35.xxx.xxx` |
| `EC2_USER` | SSH 사용자명 | `ec2-user` |
| `EC2_SSH_KEY` | SSH 프라이빗 키 전체 내용 | `-----BEGIN RSA...` |
| `TOSS_SECRET_KEY` | 운영 결제 서버 시크릿, 없으면 mock mode | `live_sk_...` |
| `TOSS_CLIENT_KEY` | 운영 결제 클라이언트 키, 없으면 mock widget | `live_ck_...` |
| `TOSS_WEBHOOK_SECRET` | 운영 결제 webhook 서명 시크릿 | `whsec_...` |

### SSH 키 등록 방법

```bash
# 로컬에서 .pem 파일 내용 복사
cat teameet-key.pem | pbcopy  # macOS
# 또는
cat teameet-key.pem            # 출력 후 전체 복사
```

이 내용을 `EC2_SSH_KEY` Secret에 붙여넣기.

### CI/CD 흐름

```
개발자 코드 수정 → git push main
  ↓
GitHub Actions 트리거
  ↓
1. pnpm install
2. Prisma generate
3. lint + type-check + test
  ↓ (빌드 성공 시)
4. SSH로 EC2 접속
5. rsync로 `~/teameet` 작업 트리 동기화 (`deploy/.env` 보호)
6. GitHub repo secrets의 `TOSS_*` 값을 EC2 `deploy/.env`의 source of truth로 먼저 동기화
7. `deploy/.env` 필수 값(`DB_PASSWORD`, `JWT_SECRET`) preflight 검증
8. API / Web Docker 이미지 빌드
9. Web 이미지는 `deploy/Dockerfile.web`로 직접 빌드하고, browser API base를 `/api/v1`, internal rewrite origin을 `http://api:8100`으로 주입
10. postgres / redis 선기동
11. `prisma/bootstrap-deploy-db.ts` 실행
12. compose 스택 재기동 (`docker compose` 또는 `docker-compose`)
13. Next standalone `web` runtime은 `HOSTNAME=0.0.0.0`로 bind를 고정해 localhost healthcheck와 nginx dependency gate를 통과시킴
14. API health + Web internal rewrite + Nginx localhost health 검증
15. `prisma/seed-mocks.ts --checksum-gate`로 canonical mock dataset checksum 검증 및 필요 시 sync
16. `prisma/seed-images.ts`로 DB-backed 이미지 보강
17. 선택적 full seed 실행
  ↓
🎉 배포 완료
```

> 운영 서버의 `~/teameet`는 CI가 동기화한 mirror일 수 있어 `.git`이 없을 수 있습니다. 서버에서 `git pull`이 항상 가능하다고 가정하지 않습니다.

---

## 4. 환경변수 설정

`deploy/.env` 파일 (EC2 서버에 자동 생성됨):

```bash
# Database
DB_USER=teameet
DB_PASSWORD=<자동생성된_24자_비밀번호>
DB_NAME=teameet

# JWT
JWT_SECRET=<자동생성된_48자_시크릿>

# Internal API origin used when Next.js builds server-side rewrites
INTERNAL_API_ORIGIN=http://api:8100

# OAuth (서비스 연동 시 수동 설정)
KAKAO_CLIENT_ID=
KAKAO_CLIENT_SECRET=
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=

# Payment (leave blank to keep payments in mock mode)
TOSS_CLIENT_KEY=
TOSS_SECRET_KEY=
TOSS_WEBHOOK_SECRET=

# Deploy-safe canonical mock sync (disable only with literal "false")
DEPLOY_SYNC_MOCK_DATA=true
```

`TOSS_SECRET_KEY`와 `TOSS_CLIENT_KEY`가 비어 있으면 결제 기능은 mock mode로 남고, 애플리케이션 배포 자체는 계속된다. GitHub Actions deploy는 `TOSS_*` repo secret을 EC2 `deploy/.env`의 source of truth로 취급하므로, secret이 비어 있거나 없으면 해당 runtime 값도 빈 값으로 동기화된다.

`DEPLOY_SYNC_MOCK_DATA`는 기본값이 `true`다. 운영자가 이 값을 정확히 `false`로 넣지 않는 한, 배포 시마다 checksum-gated mock sync가 실행되고 catalog checksum이 바뀌었을 때만 canonical mock dataset을 다시 반영한다. catalog는 KST 날짜 anchor를 포함하므로 날짜가 넘어가면 mock 일정도 다음 배포에서 함께 앞으로 이동한다.

`HOSTNAME`은 운영 compose에서 `0.0.0.0`으로 고정한다. Next standalone가 container IP에만 bind하면 앱은 떠 있어도 `localhost` healthcheck가 실패해 `web`/`nginx` dependency gate가 깨질 수 있다.

`prisma/bootstrap-deploy-db.ts`는 public schema가 비어 있는 운영 DB에서 현재 migration chain을 처음부터 재생하지 않는다. 비어 있는 DB에 `_prisma_migrations`만 남아 있어도 먼저 history를 재설정한 뒤 `prisma db push --skip-generate`로 현재 schema를 만들고, 저장소에 있는 migration 디렉터리를 `resolve --applied`로 기록한 다음 `migrate deploy`를 검증한다. 반대로 public table이 이미 있는데 migration history만 없으면 drift 가능성이 크므로 자동 복구하지 않고 배포를 실패시킨다.

---

## 5. Docker 구성

```
┌─────────────────────────────────────┐
│         EC2 (t3.small)              │
│                                     │
│  ┌──────────┐                       │
│  │  Nginx   │ ← :80/:443           │
│  │  (proxy) │                       │
│  └────┬─────┘                       │
│       │                             │
│  ┌────┴─────┐  ┌──────────────────┐ │
│  │ Next.js  │  │  NestJS API      │ │
│  │  (:3000) │  │  (:8100)         │ │
│  └──────────┘  └──────────────────┘ │
│                                     │
│  ┌──────────┐  ┌──────────────────┐ │
│  │PostgreSQL│  │      Redis       │ │
│  │  (:5432) │  │     (:6379)      │ │
│  └──────────┘  └──────────────────┘ │
└─────────────────────────────────────┘

Nginx 라우팅:
  / → Next.js (프론트엔드)
  /api/* → NestJS (백엔드 API)
  /docs → NestJS (Swagger 문서)
  /socket.io/* → NestJS (WebSocket)
```

---

## 6. 운영 명령어

### 서버 접속

```bash
ssh -i teameet-key.pem ec2-user@<EC2_IP>
cd ~/teameet/deploy

if docker compose version >/dev/null 2>&1; then
  export COMPOSE="docker compose"
else
  export COMPOSE="docker-compose"
fi
```

### 상태 확인

```bash
# 전체 컨테이너 상태
$COMPOSE -f docker-compose.prod.yml ps

# 로그 확인
docker logs teameet_api -f --tail 50
docker logs teameet_web -f --tail 50
docker logs teameet_nginx -f --tail 50

# 리소스 사용량
docker stats --no-stream

# 헬스체크
curl http://localhost:8100/api/v1/health
curl -I http://localhost/api/v1/health
```

### 재시작

```bash
# 전체 재시작
$COMPOSE -f docker-compose.prod.yml restart

# 특정 서비스만
$COMPOSE -f docker-compose.prod.yml restart api
$COMPOSE -f docker-compose.prod.yml restart web
```

### 수동 업데이트

```bash
# 권장: GitHub Actions의 workflow_dispatch로 CI / Deploy 재실행
# 서버의 ~/teameet는 Git worktree가 아닐 수 있으므로 서버 내부 git pull을 기본 절차로 쓰지 않는다.

rsync -avz --delete \
  --exclude node_modules --exclude .next --exclude dist --exclude .git --exclude 'deploy/certbot' \
  --filter 'protect deploy/.env' \
  -e "ssh -i teameet-key.pem -o StrictHostKeyChecking=no" \
  ./ ec2-user@<EC2_IP>:~/teameet/

ssh -i teameet-key.pem ec2-user@<EC2_IP> '
  set -e
  cd ~/teameet
  set -a
  . deploy/.env
  set +a
  sudo docker build -f deploy/Dockerfile.api -t teameet-api .
  sudo docker build \
    -f deploy/Dockerfile.web \
    --build-arg NEXT_PUBLIC_API_URL=/api/v1 \
    --build-arg NEXT_PUBLIC_TOSS_CLIENT_KEY="${TOSS_CLIENT_KEY:-}" \
    --build-arg INTERNAL_API_ORIGIN="${INTERNAL_API_ORIGIN:-http://api:8100}" \
    -t teameet-web .
  # docker-compose.prod.yml is image-only for web/api, so use direct docker build
  # before compose up when you need a fresh production image.
  cd deploy
  if sudo docker compose version >/dev/null 2>&1; then
    COMPOSE="sudo docker compose"
  else
    COMPOSE="sudo docker-compose"
  fi
  ${COMPOSE} -f docker-compose.prod.yml --env-file .env up -d postgres redis
  ${COMPOSE} -f docker-compose.prod.yml --env-file .env \
    run --rm --no-deps -T api npx ts-node prisma/bootstrap-deploy-db.ts
  ${COMPOSE} -f docker-compose.prod.yml --env-file .env down
  ${COMPOSE} -f docker-compose.prod.yml --env-file .env up -d
  curl -fsS http://localhost:8100/api/v1/health | jq -e ".data.checks.db == true and .data.checks.redis == true" > /dev/null
  curl -fsS http://localhost/landing > /dev/null
  curl -fsSI http://localhost/api/v1/health | grep -qE "^HTTP/[0-9.]+ 301"
  sudo docker exec teameet_api npx ts-node prisma/seed-mocks.ts --checksum-gate
  sudo docker exec teameet_api npx ts-node prisma/seed-images.ts
'
```

### DB 관리

```bash
# DB 백업
docker exec teameet_postgres pg_dump -U teameet teameet > backup_$(date +%Y%m%d).sql

# DB 복원
cat backup.sql | docker exec -i teameet_postgres psql -U teameet teameet

# Prisma Studio (DB 브라우저)
docker exec -it teameet_api npx prisma studio
```

### 시드 데이터 (초기 데이터 입력)

```bash
docker exec teameet_api npx ts-node prisma/seed.ts
```

### DB bootstrap / migration (deploy-safe)

```bash
docker exec teameet_api npx ts-node prisma/bootstrap-deploy-db.ts
```

빈 DB는 현재 schema bootstrap + migration history 정렬까지 자동 처리하고, migration history가 없는 비어 있지 않은 DB는 drift로 간주해 실패한다.

### checksum-gated canonical mock sync (deploy 기본값)

```bash
docker exec teameet_api npx ts-node prisma/seed-mocks.ts --checksum-gate
```

`DEPLOY_SYNC_MOCK_DATA=false`가 아닌 한 배포 시 이 명령이 자동 실행된다. checksum이 같으면 skip되고, catalog 또는 KST 날짜 anchor가 바뀌었을 때만 canonical mock dataset을 다시 sync한다.

### 이미지 데이터 보강 (운영 안전)

```bash
docker exec teameet_api npx ts-node prisma/seed-images.ts
```

---

## 7. 도메인 + SSL 설정 (선택사항)

### 도메인 연결

1. 도메인 구매 (가비아, Namecheap 등)
2. DNS 설정: A 레코드 → EC2 퍼블릭 IP
3. `deploy/nginx.conf`의 `server_name _` → `server_name teameet.kr www.teameet.kr`

### SSL 인증서 (Let's Encrypt)

```bash
# EC2에서 실행
sudo yum install -y certbot || sudo apt install -y certbot

# Nginx 중지 후 인증서 발급
$COMPOSE -f docker-compose.prod.yml stop nginx
sudo certbot certonly --standalone -d teameet.kr -d www.teameet.kr

# nginx.conf에 SSL 설정 추가 후 재시작
$COMPOSE -f docker-compose.prod.yml up -d nginx
```

---

## 8. 비용 최적화

| 옵션 | 사양 | 비용 | 권장 |
|------|------|------|------|
| t3.micro | 1vCPU, 1GB | ~$8/월 | ❌ 메모리 부족 |
| **t3.small** | **2vCPU, 2GB** | **~$15/월** | **✅ MVP 권장** |
| t3.medium | 2vCPU, 4GB | ~$30/월 | 사용자 100+ |
| t3.large | 2vCPU, 8GB | ~$60/월 | 사용자 500+ |

**절약 팁:**
- 예약 인스턴스 1년: 최대 40% 할인
- Spot 인스턴스: 최대 70% 할인 (중단 위험)
- t3.small로 시작 → 트래픽 보고 스케일업

---

## 9. 트러블슈팅

### Docker 빌드 실패

```bash
# 캐시 클리어 후 재빌드
docker system prune -f
$COMPOSE -f docker-compose.prod.yml build --no-cache
```

### 메모리 부족 (t3.small)

```bash
# Swap 메모리 추가 (2GB)
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
```

### DB 연결 실패

```bash
# PostgreSQL 상태 확인
docker logs teameet_postgres
docker exec teameet_postgres pg_isready -U teameet
```

### 포트 충돌

```bash
# 80번 포트 사용 확인
sudo lsof -i :80
sudo fuser -k 80/tcp  # 강제 종료
```

---

## 10. 기능 동작 검증 결과

마지막 검증일: 2026-03-23

### Backend API (21개 엔드포인트)

```
✅ POST /auth/dev-login — 로그인 성공
✅ GET  /matches — 20개 매치
✅ POST /matches — 매치 생성 성공
✅ GET  /teams — 6개 팀
✅ GET  /team-matches — 3개 팀 매칭
✅ GET  /lessons — 12개 강좌
✅ GET  /marketplace/listings — 12개 매물
✅ GET  /venues — 16개 시설
✅ GET  /chat/rooms — 3개 채팅방 (인증)
✅ GET  /mercenary — 1개 용병 모집
✅ GET  /badges — 7개 뱃지 타입
✅ GET  /admin/disputes — 2개 분쟁
✅ GET  /admin/settlements — 2개 정산
✅ GET  /admin/stats — 통계 (사용자7, 매치20, 시설16)
✅ GET  /payments/me — 결제 내역 (인증)
✅ GET  /notifications — 알림 (인증)
```

### Frontend (48개 라우트)

```
✅ 48/48 라우트 — 모두 200 OK
```

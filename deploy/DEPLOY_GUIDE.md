# MatchUp EC2 배포 가이드

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
2. **이름**: `matchup-server`
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
ssh -i matchup-key.pem ec2-user@<EC2_퍼블릭_IP>

# 원클릭 설치 + 배포
curl -sL https://raw.githubusercontent.com/kim-song-jun/matchup-sports-platform/main/deploy/setup-ec2.sh | bash
```

이 스크립트가 자동으로 처리하는 것:
- Docker + Docker Compose 설치
- Git 설치 + 프로젝트 클론
- DB 비밀번호, JWT Secret 랜덤 생성
- Docker 이미지 빌드 (~5-10분)
- PostgreSQL + Redis 시작
- DB 스키마 적용 (Prisma)
- Nginx 리버스 프록시 설정
- 헬스체크

완료 후 출력:
```
🎉 MatchUp 배포 완료!
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

### SSH 키 등록 방법

```bash
# 로컬에서 .pem 파일 내용 복사
cat matchup-key.pem | pbcopy  # macOS
# 또는
cat matchup-key.pem            # 출력 후 전체 복사
```

이 내용을 `EC2_SSH_KEY` Secret에 붙여넣기.

### CI/CD 흐름

```
개발자 코드 수정 → git push main
  ↓
GitHub Actions 트리거
  ↓
1. pnpm install
2. Prisma generate + NestJS build (타입 체크)
3. Next.js build (타입 체크)
  ↓ (빌드 성공 시)
4. SSH로 EC2 접속
5. git pull origin main
6. docker compose up -d --build
7. prisma db push
8. 헬스체크
  ↓
🎉 배포 완료
```

---

## 4. 환경변수 설정

`deploy/.env` 파일 (EC2 서버에 자동 생성됨):

```bash
# Database
DB_USER=matchup
DB_PASSWORD=<자동생성된_24자_비밀번호>
DB_NAME=matchup

# JWT
JWT_SECRET=<자동생성된_48자_시크릿>

# API URL (EC2 IP로 자동 설정됨)
API_URL=http://<EC2_IP>/api/v1

# OAuth (서비스 연동 시 수동 설정)
KAKAO_CLIENT_ID=
KAKAO_CLIENT_SECRET=
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=

# Payment (서비스 연동 시 수동 설정)
TOSS_CLIENT_KEY=
TOSS_SECRET_KEY=
```

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
ssh -i matchup-key.pem ec2-user@<EC2_IP>
cd ~/matchup/deploy
```

### 상태 확인

```bash
# 전체 컨테이너 상태
docker compose -f docker-compose.prod.yml ps

# 로그 확인
docker logs matchup_api -f --tail 50
docker logs matchup_web -f --tail 50
docker logs matchup_nginx -f --tail 50

# 리소스 사용량
docker stats --no-stream

# 헬스체크
curl http://localhost/api/v1/health
```

### 재시작

```bash
# 전체 재시작
docker compose -f docker-compose.prod.yml restart

# 특정 서비스만
docker compose -f docker-compose.prod.yml restart api
docker compose -f docker-compose.prod.yml restart web
```

### 수동 업데이트

```bash
cd ~/matchup
git pull origin main
cd deploy
docker compose -f docker-compose.prod.yml up -d --build
```

### DB 관리

```bash
# DB 백업
docker exec matchup_postgres pg_dump -U matchup matchup > backup_$(date +%Y%m%d).sql

# DB 복원
cat backup.sql | docker exec -i matchup_postgres psql -U matchup matchup

# Prisma Studio (DB 브라우저)
docker exec -it matchup_api npx prisma studio
```

### 시드 데이터 (초기 데이터 입력)

```bash
docker exec matchup_api npx ts-node prisma/seed.ts
```

---

## 7. 도메인 + SSL 설정 (선택사항)

### 도메인 연결

1. 도메인 구매 (가비아, Namecheap 등)
2. DNS 설정: A 레코드 → EC2 퍼블릭 IP
3. `deploy/nginx.conf`의 `server_name _` → `server_name matchup.kr www.matchup.kr`

### SSL 인증서 (Let's Encrypt)

```bash
# EC2에서 실행
sudo yum install -y certbot || sudo apt install -y certbot

# Nginx 중지 후 인증서 발급
docker compose -f docker-compose.prod.yml stop nginx
sudo certbot certonly --standalone -d matchup.kr -d www.matchup.kr

# nginx.conf에 SSL 설정 추가 후 재시작
docker compose -f docker-compose.prod.yml up -d nginx
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
docker compose -f docker-compose.prod.yml build --no-cache
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
docker logs matchup_postgres
docker exec matchup_postgres pg_isready -U matchup
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

# MatchUp EC2 배포 가이드

## 1. EC2 인스턴스 준비

### 권장 사양
| 항목 | 스펙 | 예상 비용 |
|------|------|----------|
| 인스턴스 | t3.medium (2vCPU, 4GB) | ~$30/월 |
| 스토리지 | gp3 30GB | ~$2.5/월 |
| 리전 | ap-northeast-2 (서울) | - |
| OS | Amazon Linux 2023 / Ubuntu 22.04 | - |
| **총 예상** | | **~$35/월** |

### 보안 그룹 설정
```
인바운드:
  - 80 (HTTP)     → 0.0.0.0/0
  - 443 (HTTPS)   → 0.0.0.0/0
  - 22 (SSH)      → 내 IP만
```

## 2. 서버 초기 설정

```bash
# EC2 접속
ssh -i matchup-key.pem ec2-user@<IP>

# Docker 설치
sudo yum update -y
sudo yum install -y docker git
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ec2-user

# Docker Compose 설치
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Node.js (빌드용)
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
```

## 3. 프로젝트 배포

```bash
# 저장소 클론
git clone https://github.com/kim-song-jun/matchup-sports-platform.git
cd matchup-sports-platform

# 환경변수 설정
cp deploy/.env.prod.example deploy/.env
nano deploy/.env  # 비밀번호, JWT_SECRET 등 설정

# Docker 빌드 + 실행
cd deploy
docker-compose -f docker-compose.prod.yml up -d --build

# DB 마이그레이션
docker exec matchup_api npx prisma db push
docker exec matchup_api npx ts-node prisma/seed.ts

# 상태 확인
docker-compose -f docker-compose.prod.yml ps
curl http://localhost/api/v1/health
```

## 4. 환경변수 (.env)

```bash
# deploy/.env
DB_USER=matchup
DB_PASSWORD=<강력한 비밀번호>
DB_NAME=matchup
JWT_SECRET=<랜덤 64자 문자열>
API_URL=https://matchup.kr/api/v1

# 선택사항 (서비스 연동 시)
KAKAO_CLIENT_ID=
NAVER_CLIENT_ID=
TOSS_CLIENT_KEY=
TOSS_SECRET_KEY=
```

## 5. SSL 인증서 (Let's Encrypt)

```bash
# Certbot 설치
sudo yum install -y certbot

# 인증서 발급 (도메인 필요)
sudo certbot certonly --standalone -d matchup.kr -d www.matchup.kr

# nginx.conf에 SSL 설정 추가 후 재시작
docker-compose -f docker-compose.prod.yml restart nginx
```

## 6. 도메인 연결

1. Route 53 또는 도메인 업체에서 A 레코드 설정
2. `matchup.kr` → EC2 퍼블릭 IP
3. `www.matchup.kr` → EC2 퍼블릭 IP

## 7. 운영 명령어

```bash
# 로그 확인
docker logs matchup_api -f
docker logs matchup_web -f

# 재시작
docker-compose -f docker-compose.prod.yml restart

# 업데이트 배포
git pull origin main
docker-compose -f docker-compose.prod.yml up -d --build

# DB 백업
docker exec matchup_postgres pg_dump -U matchup matchup > backup_$(date +%Y%m%d).sql

# DB 복원
cat backup.sql | docker exec -i matchup_postgres psql -U matchup matchup
```

## 8. 모니터링

```bash
# 디스크 사용량
df -h

# Docker 리소스
docker stats

# API 헬스체크
curl -s http://localhost/api/v1/health | python3 -m json.tool
```

## 9. 자동 배포 (GitHub Actions)

`.github/workflows/deploy.yml` 생성:
```yaml
name: Deploy to EC2
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ec2-user
          key: ${{ secrets.EC2_KEY }}
          script: |
            cd matchup-sports-platform
            git pull origin main
            cd deploy
            docker-compose -f docker-compose.prod.yml up -d --build
```

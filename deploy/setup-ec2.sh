#!/bin/bash
# MatchUp EC2 초기 설정 스크립트
# 사용법: ssh ec2-user@<IP> 접속 후 이 스크립트 실행

set -e

echo "🚀 MatchUp EC2 초기 설정 시작"

# 1. 시스템 업데이트
echo "📦 시스템 업데이트..."
sudo yum update -y 2>/dev/null || sudo apt-get update -y 2>/dev/null

# 2. Docker 설치
echo "🐳 Docker 설치..."
if ! command -v docker &> /dev/null; then
  sudo yum install -y docker 2>/dev/null || {
    sudo apt-get install -y docker.io
  }
  sudo systemctl start docker
  sudo systemctl enable docker
  sudo usermod -aG docker $USER
  echo "Docker 설치 완료. 재접속 후 docker 명령 사용 가능"
fi

# 3. Docker Compose 설치
echo "🐳 Docker Compose 설치..."
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
  COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
  sudo curl -L "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
fi

# 4. Git 설치
echo "📂 Git 설치..."
sudo yum install -y git 2>/dev/null || sudo apt-get install -y git 2>/dev/null

# 5. 프로젝트 클론
echo "📥 프로젝트 클론..."
REPO_URL="https://github.com/kim-song-jun/matchup-sports-platform.git"
APP_DIR="$HOME/matchup"

if [ -d "$APP_DIR" ]; then
  echo "프로젝트가 이미 존재합니다. 업데이트합니다..."
  cd "$APP_DIR"
  git pull origin main
else
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# 6. 환경변수 설정
echo "⚙️ 환경변수 설정..."
if [ ! -f deploy/.env ]; then
  cp deploy/.env.prod.example deploy/.env

  # 랜덤 비밀번호 생성
  DB_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
  JWT_SECRET=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 48)

  # sed로 값 교체
  sed -i "s/CHANGE_ME_STRONG_PASSWORD/$DB_PASS/" deploy/.env
  sed -i "s/CHANGE_ME_RANDOM_64_CHAR_STRING/$JWT_SECRET/" deploy/.env

  # EC2 퍼블릭 IP 가져오기
  PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "localhost")
  sed -i "s|API_URL=http://localhost:8100/api/v1|API_URL=http://$PUBLIC_IP/api/v1|" deploy/.env

  echo "✅ 환경변수 자동 생성 완료"
  echo "  DB 비밀번호: $DB_PASS"
  echo "  JWT Secret: $JWT_SECRET"
  echo "  Public IP: $PUBLIC_IP"
else
  echo "deploy/.env 이미 존재합니다."
fi

# 7. Docker 빌드 + 실행
echo "🏗️ Docker 빌드 중... (첫 빌드는 5-10분 소요)"
cd deploy
docker compose -f docker-compose.prod.yml up -d --build 2>/dev/null || \
  docker-compose -f docker-compose.prod.yml up -d --build

# 8. DB 초기화 대기
echo "⏳ DB 초기화 대기 중..."
sleep 15

# 9. Prisma DB Push
echo "🗄️ DB 스키마 적용..."
docker exec matchup_api npx prisma db push --skip-generate 2>/dev/null || {
  echo "⚠️ DB 스키마 적용 대기 중... 재시도"
  sleep 10
  docker exec matchup_api npx prisma db push --skip-generate
}

# 10. 시드 데이터 (선택)
echo "🌱 시드 데이터 입력..."
docker exec matchup_api node -e "
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  prisma.\$connect().then(() => console.log('DB 연결 성공')).catch(e => console.error('DB 연결 실패:', e));
" 2>/dev/null || echo "시드 데이터는 수동으로 실행해주세요."

# 11. 상태 확인
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 배포 상태 확인"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker compose -f docker-compose.prod.yml ps 2>/dev/null || docker-compose -f docker-compose.prod.yml ps

echo ""
echo "🏥 헬스체크..."
sleep 3
if curl -sf http://localhost/api/v1/health > /dev/null 2>&1; then
  echo "✅ API 서버 정상"
else
  echo "⚠️ API 서버 응답 대기 중 (1분 후 다시 확인해주세요)"
fi

if curl -sf http://localhost/ > /dev/null 2>&1; then
  echo "✅ 웹 서버 정상"
else
  echo "⚠️ 웹 서버 응답 대기 중"
fi

PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "YOUR_EC2_IP")
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 MatchUp 배포 완료!"
echo ""
echo "  🌐 웹사이트:  http://$PUBLIC_IP"
echo "  📚 API 문서:  http://$PUBLIC_IP/docs"
echo "  🏥 헬스체크:  http://$PUBLIC_IP/api/v1/health"
echo ""
echo "  📋 로그 확인: docker logs matchup_api -f"
echo "  📋 전체 상태: docker compose -f docker-compose.prod.yml ps"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

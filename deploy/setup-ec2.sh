#!/bin/bash
# MatchUp EC2 초기 설정 스크립트
# 사용법: ssh ec2-user@<IP> 접속 후 이 스크립트 실행

set -e

echo "🚀 MatchUp EC2 초기 설정 시작"

write_toss_env() {
  local tmp_env
  tmp_env=$(mktemp)

  awk '!/^(TOSS_CLIENT_KEY|TOSS_SECRET_KEY|TOSS_WEBHOOK_SECRET)=/' deploy/.env > "$tmp_env"

  {
    cat "$tmp_env"
    printf 'TOSS_CLIENT_KEY=%s\n' "${TOSS_CLIENT_KEY:-}"
    printf 'TOSS_SECRET_KEY=%s\n' "${TOSS_SECRET_KEY:-}"
    printf 'TOSS_WEBHOOK_SECRET=%s\n' "${TOSS_WEBHOOK_SECRET:-}"
  } > deploy/.env

  rm -f "$tmp_env"
}

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

# 4.1 jq 설치
echo "🧰 jq 설치..."
if ! command -v jq &> /dev/null; then
  sudo yum install -y jq 2>/dev/null || sudo apt-get install -y jq 2>/dev/null
fi

# 5. 프로젝트 클론
echo "📥 프로젝트 클론..."
REPO_URL="https://github.com/kim-song-jun/matchup-sports-platform.git"
APP_DIR="$HOME/matchup"

if [ -d "$APP_DIR" ]; then
  if [ -d "$APP_DIR/.git" ]; then
    echo "프로젝트가 이미 존재합니다. 업데이트합니다..."
    cd "$APP_DIR"
    git pull origin main
  else
    echo "프로젝트 디렉토리가 이미 존재하지만 git 메타데이터가 없습니다. 현재 작업 트리를 그대로 사용합니다."
    cd "$APP_DIR"
  fi
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

  write_toss_env

  echo "✅ 환경변수 자동 생성 완료"
else
  echo "deploy/.env 이미 존재합니다."
fi

if [ "${TOSS_CLIENT_KEY+x}" = "x" ] || [ "${TOSS_SECRET_KEY+x}" = "x" ] || [ "${TOSS_WEBHOOK_SECRET+x}" = "x" ]; then
  write_toss_env
fi

# 7. Docker 빌드 + 실행
echo "🏗️ Docker 빌드 중... (첫 빌드는 5-10분 소요)"
cd "$APP_DIR"

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  COMPOSE="docker-compose"
fi

set -a
. ./deploy/.env
set +a

sudo docker build -f deploy/Dockerfile.api -t matchup-api .
sudo docker build \
  -f deploy/Dockerfile.web \
  --build-arg NEXT_PUBLIC_API_URL=/api/v1 \
  --build-arg NEXT_PUBLIC_TOSS_CLIENT_KEY="${TOSS_CLIENT_KEY:-}" \
  --build-arg INTERNAL_API_ORIGIN="${INTERNAL_API_ORIGIN:-http://api:8100}" \
  -t matchup-web .

cd deploy
$COMPOSE -f docker-compose.prod.yml up -d postgres redis

# 8. DB 초기화 대기
echo "⏳ DB 초기화 대기 중..."
for i in $(seq 1 30); do
  if $COMPOSE -f docker-compose.prod.yml exec -T postgres pg_isready >/dev/null 2>&1; then
    echo "✅ postgres 준비 완료"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "❌ postgres가 제시간에 준비되지 않았습니다."
    exit 1
  fi
  sleep 2
done

# 9. DB bootstrap / migrate deploy
echo "🗄️ DB bootstrap 적용..."
$COMPOSE -f docker-compose.prod.yml run --rm --no-deps -T api npx ts-node prisma/bootstrap-deploy-db.ts

# 10. 전체 스택 시작
echo "🚀 애플리케이션 스택 시작..."
$COMPOSE -f docker-compose.prod.yml up -d

# 11. API 준비 대기 + deploy-safe seed sync
echo "⏳ API 헬스체크 대기 중..."
for i in $(seq 1 45); do
  if curl -fsS http://localhost:8100/api/v1/health | jq -e '.data.checks.db == true and .data.checks.redis == true' >/dev/null 2>&1; then
    echo "✅ API 준비 완료"
    break
  fi
  if [ "$i" -eq 45 ]; then
    echo "❌ API가 제시간에 준비되지 않았습니다."
    sudo docker logs matchup_api --tail 120 || true
    exit 1
  fi
  sleep 2
done

echo "🧩 checksum-gated mock sync 실행..."
sudo docker exec matchup_api npx ts-node prisma/seed-mocks.ts --checksum-gate

echo "🖼️ 이미지 backfill sync 실행..."
sudo docker exec matchup_api npx ts-node prisma/seed-images.ts

# 12. 상태 확인
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 배포 상태 확인"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
$COMPOSE -f docker-compose.prod.yml ps

echo ""
echo "🏥 헬스체크..."
sleep 3
if curl -fsS http://localhost:8100/api/v1/health | jq -e '.data.checks.db == true and .data.checks.redis == true' > /dev/null 2>&1 && \
   curl -fsS http://localhost/api/v1/health | jq -e '.data.checks.db == true and .data.checks.redis == true' > /dev/null 2>&1; then
  echo "✅ API 서버 정상"
else
  echo "⚠️ API 서버 응답 대기 중 (1분 후 다시 확인해주세요)"
fi

if curl -sf http://localhost/landing > /dev/null 2>&1; then
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
echo "  📋 전체 상태: $COMPOSE -f docker-compose.prod.yml ps"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

#!/usr/bin/env bash
set -euo pipefail

cd ~/teameet/deploy

set -a
. .env
set +a

if sudo docker compose version >/dev/null 2>&1; then
  COMPOSE="sudo docker compose"
else
  COMPOSE="sudo docker-compose"
fi

V1_UPLOADS_BACKUP_DIR="$(mktemp -d)"
if sudo docker ps -a --format '{{.Names}}' | grep -qx 'teameet_v1_api'; then
  echo "[INFO] Backing up existing v1 uploads before recreating v1_api..."
  sudo docker cp teameet_v1_api:/app/apps/v1_api/uploads "${V1_UPLOADS_BACKUP_DIR}/" 2>/dev/null || {
    echo "[INFO] No existing v1 uploads directory found to back up."
  }
fi

echo "[INFO] Stopping v1_api, v1_web, nginx containers..."
${COMPOSE} -f docker-compose.prod.yml --env-file .env stop v1_api v1_web nginx 2>/dev/null || true
${COMPOSE} -f docker-compose.prod.yml --env-file .env rm -f v1_api v1_web nginx 2>/dev/null || true

echo "[INFO] Ensuring v1_postgres is running..."
${COMPOSE} -f docker-compose.prod.yml --env-file .env up -d v1_postgres

echo "[INFO] Waiting for v1_postgres healthy..."
for i in $(seq 1 30); do
  if sudo docker exec teameet_v1_postgres pg_isready -U "${V1_DB_USER:-teameet_v1}" -d "${V1_DB_NAME:-teameet_v1}" >/dev/null 2>&1; then
    echo "[INFO] v1_postgres ready (attempt $i)"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[ERROR] v1_postgres not ready after 60s"
    exit 1
  fi
  sleep 2
done

echo "[INFO] Applying v1 deploy database migrations..."
echo "[INFO] Recovering known failed v1 tournament registration migration if present..."
${COMPOSE} -f docker-compose.prod.yml --env-file .env \
  run --rm --no-deps -T v1_api sh -c "cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate resolve --rolled-back 20260703000000_v1_tournament_registration_team_unique || true"
echo "[INFO] Recovering known failed v1 review photos migration if present..."
# 2026-07-12 장애: 리뷰 테이블 생성 마이그레이션 누락으로 20260711180000이 42P01로 실패 기록됨.
# 누락분은 20260711170000_v1_tournament_reviews_awards로 보충 — 실패 레코드를 롤백 처리해 재적용 가능하게 한다.
${COMPOSE} -f docker-compose.prod.yml --env-file .env \
  run --rm --no-deps -T v1_api sh -c "cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate resolve --rolled-back 20260711180000_v1_tournament_review_photos || true"

echo "[INFO] Recreating v1_api, v1_web, nginx only (keeping v1_postgres running)..."
echo "[INFO] Syncing v1 deploy database schema..."
${COMPOSE} -f docker-compose.prod.yml --env-file .env run --rm --no-deps -T v1_api sh -c "cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy"

${COMPOSE} -f docker-compose.prod.yml --env-file .env up -d --force-recreate --no-deps v1_api
if [ -d "${V1_UPLOADS_BACKUP_DIR}/uploads" ]; then
  echo "[INFO] Restoring v1 uploads into the persistent volume..."
  sudo docker exec teameet_v1_api mkdir -p /app/apps/v1_api/uploads
  sudo docker cp "${V1_UPLOADS_BACKUP_DIR}/uploads/." teameet_v1_api:/app/apps/v1_api/uploads/
fi
sudo rm -rf "${V1_UPLOADS_BACKUP_DIR}" 2>/dev/null || true
echo "[INFO] Starting v1_web/nginx first, then verifying v1_api health..."
sleep 5
${COMPOSE} -f docker-compose.prod.yml --env-file .env up -d --force-recreate --no-deps v1_web nginx

echo "[INFO] Waiting for teameet_v1_api health..."
for i in $(seq 1 45); do
  if curl -fsS http://localhost:8121/api/v1/health | \
      jq -e '.data.checks.db == true' >/dev/null 2>&1; then
    echo "[INFO] teameet_v1_api is healthy (attempt $i)"
    break
  fi
  if [ "$i" -eq 45 ]; then
    echo "[ERROR] teameet_v1_api failed health check after 90s"
    sudo docker ps -a --filter name=teameet_v1_api --format 'table {{.Status}}\t{{.Ports}}' || true
    sudo docker logs teameet_v1_api --tail 60 2>&1 || true
  fi
  sleep 2
done

if [ "${DEPLOY_SYNC_V1_SEED_DATA:-false}" = "true" ]; then
  echo "[INFO] Syncing v1 seed data..."
  sudo docker exec teameet_v1_api sh -c "cd /app/apps/v1_api && ./node_modules/.bin/ts-node prisma/seed.ts"
else
  echo "[INFO] Skipping v1 seed data sync because DEPLOY_SYNC_V1_SEED_DATA=false"
fi

echo "[INFO] Waiting for teameet_v1_web routing..."
for i in $(seq 1 45); do
  if curl -fsS http://localhost:3013/v1/landing >/dev/null 2>&1; then
    echo "[INFO] teameet_v1_web routing is healthy (attempt $i)"
    break
  fi
  if [ "$i" -eq 45 ]; then
    echo "[ERROR] teameet_v1_web failed routing check"
    sudo docker logs teameet_v1_web --tail 60 2>&1 || true
  fi
  sleep 2
done

sudo rm -rf /var/cache/nginx/* 2>/dev/null || true
sudo docker exec teameet_nginx nginx -t
sudo docker exec teameet_nginx nginx -s reload

sudo docker image prune -a -f || true
sudo docker builder prune -a -f || true
echo "[cleanup] Final disk usage:"
df -h / | tail -1
echo "[INFO] Deploy complete."

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

echo "[INFO] Stopping api, web, v1_api, v1_web, nginx containers..."
${COMPOSE} -f docker-compose.prod.yml --env-file .env stop api web v1_api v1_web nginx 2>/dev/null || true
${COMPOSE} -f docker-compose.prod.yml --env-file .env rm -f api web v1_api v1_web nginx 2>/dev/null || true

echo "[INFO] Ensuring postgres, v1_postgres and redis are running..."
${COMPOSE} -f docker-compose.prod.yml --env-file .env up -d postgres redis v1_postgres

echo "[INFO] Waiting for postgres healthy..."
for i in $(seq 1 30); do
  if sudo docker exec teameet_postgres pg_isready -U "${DB_USER:-teameet}" >/dev/null 2>&1; then
    echo "[INFO] postgres ready (attempt $i)"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[ERROR] postgres not ready after 60s"
    exit 1
  fi
  sleep 2
done

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
echo "[INFO] Recovering known failed v1 tournament review photos migration if present..."
${COMPOSE} -f docker-compose.prod.yml --env-file .env \
  run --rm --no-deps -T v1_api sh -c "cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate resolve --rolled-back 20260711180000_v1_tournament_review_photos || true"
${COMPOSE} -f docker-compose.prod.yml --env-file .env \
  run --rm --no-deps -T v1_api sh -c "cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy"

echo "[INFO] Recreating api, v1_api, web, v1_web, nginx only (keeping postgres/redis running)..."
echo "[INFO] Syncing v1 deploy database schema..."
${COMPOSE} -f docker-compose.prod.yml --env-file .env run --rm --no-deps -T v1_api sh -c "cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy"

${COMPOSE} -f docker-compose.prod.yml --env-file .env up -d --force-recreate --no-deps api
echo "[INFO] Ensuring the v1 uploads volume is writable by UID/GID 1001..."
${COMPOSE} -f docker-compose.prod.yml --env-file .env run --rm --no-deps -T v1_uploads_init
${COMPOSE} -f docker-compose.prod.yml --env-file .env up -d --force-recreate --no-deps v1_api
if [ -d "${V1_UPLOADS_BACKUP_DIR}/uploads" ]; then
  echo "[INFO] Restoring v1 uploads into the persistent volume..."
  sudo docker exec --user 0:0 teameet_v1_api mkdir -p /app/apps/v1_api/uploads
  sudo docker cp "${V1_UPLOADS_BACKUP_DIR}/uploads/." teameet_v1_api:/app/apps/v1_api/uploads/
  echo "[INFO] Re-applying v1 upload ownership after restore..."
  ${COMPOSE} -f docker-compose.prod.yml --env-file .env run --rm --no-deps -T v1_uploads_init
fi
sudo rm -rf "${V1_UPLOADS_BACKUP_DIR}" 2>/dev/null || true
echo "[INFO] Waiting for APIs to be ready before starting web..."
sleep 5
${COMPOSE} -f docker-compose.prod.yml --env-file .env up -d --force-recreate --no-deps web v1_web nginx

echo "[INFO] Waiting for teameet_api health..."
for i in $(seq 1 45); do
  if curl -fsS http://localhost:8100/api/v1/health | \
      jq -e '.data.checks.db == true and .data.checks.redis == true' >/dev/null 2>&1; then
    echo "[INFO] teameet_api is healthy (attempt $i)"
    break
  fi
  if [ "$i" -eq 45 ]; then
    echo "[ERROR] teameet_api failed health check after 90s"
    echo "[DEBUG] API container status:"
    sudo docker ps -a --filter name=teameet_api --format 'table {{.Status}}\t{{.Ports}}' || true
    echo "[DEBUG] API logs (last 60 lines):"
    sudo docker logs teameet_api --tail 60 2>&1 || true
    echo "[DEBUG] Attempting restart..."
    sudo docker restart teameet_api || true
    sleep 15
  fi
  sleep 2
done

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

echo "[INFO] Waiting for teameet_web routing..."
for i in $(seq 1 45); do
  if curl -fsS http://localhost:3000/api/v1/health >/dev/null 2>&1 && \
     curl -fsS http://localhost:3000/landing >/dev/null 2>&1; then
    echo "[INFO] teameet_web routing is healthy (attempt $i)"
    break
  fi
  if [ "$i" -eq 45 ]; then
    echo "[ERROR] teameet_web failed routing check"
    sudo docker logs teameet_web --tail 60 2>&1 || true
  fi
  sleep 2
done

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

RESET_DB="${RESET_DB:-false}"
RUN_SEED="${RUN_SEED:-false}"

if [ "${RESET_DB}" = "true" ]; then
  echo "[DANGER] Resetting database..."
  sudo docker exec teameet_api npx prisma migrate reset --force --skip-seed
  sudo docker exec teameet_api npx prisma db seed
elif [ "${RUN_SEED}" = "true" ]; then
  echo "[DANGER] Running destructive full seed..."
  sudo docker exec teameet_api npx prisma db seed
fi

if [ "${DEPLOY_SYNC_MOCK_DATA:-true}" != "false" ]; then
  echo "[INFO] Syncing canonical mock data..."
  sudo docker exec teameet_api sh -c "cd /app/apps/api && ./node_modules/.bin/ts-node prisma/seed-mocks.ts --checksum-gate" || true
else
  echo "[INFO] Skipping canonical mock data sync because DEPLOY_SYNC_MOCK_DATA=false"
fi

echo "[INFO] Syncing DB-backed image data..."
sudo docker exec teameet_api sh -c "cd /app/apps/api && ./node_modules/.bin/ts-node prisma/seed-images.ts" || echo "::warning::seed-images sync failed"

sudo rm -rf /var/cache/nginx/* 2>/dev/null || true
sudo docker exec teameet_nginx nginx -t
sudo docker exec teameet_nginx nginx -s reload

sudo docker image prune -a -f || true
sudo docker builder prune -a -f || true
echo "[cleanup] Final disk usage:"
df -h / | tail -1
echo "[INFO] Deploy complete."

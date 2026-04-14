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

echo "[INFO] Stopping api, web, nginx containers..."
${COMPOSE} -f docker-compose.prod.yml --env-file .env stop api web nginx 2>/dev/null || true
${COMPOSE} -f docker-compose.prod.yml --env-file .env rm -f api web nginx 2>/dev/null || true

echo "[INFO] Ensuring postgres and redis are running..."
${COMPOSE} -f docker-compose.prod.yml --env-file .env up -d postgres redis

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

echo "[INFO] Recreating api, web, nginx only (keeping postgres/redis running)..."
${COMPOSE} -f docker-compose.prod.yml --env-file .env up -d --force-recreate --no-deps api
echo "[INFO] Waiting for API to be ready before starting web..."
sleep 5
${COMPOSE} -f docker-compose.prod.yml --env-file .env up -d --force-recreate --no-deps web nginx

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

echo "[INFO] Syncing canonical mock data..."
sudo docker exec teameet_api sh -c "cd /app/apps/api && ./node_modules/.bin/ts-node prisma/seed-mocks.ts --checksum-gate" || true

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

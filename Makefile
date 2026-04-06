# MatchUp — Makefile
# Monorepo: pnpm workspaces + Turborepo
# Backend: NestJS (apps/api, port 8111) | Frontend: Next.js (apps/web, port 3003)
# DB: PostgreSQL (port 5433) | Cache: Redis (port 6380)

SHELL := /bin/bash
ROOT_DIR := $(shell pwd)
API_DIR  := $(ROOT_DIR)/apps/api
WEB_DIR  := $(ROOT_DIR)/apps/web
DEPLOY_DIR := $(ROOT_DIR)/deploy
ENV_FILE := $(ROOT_DIR)/.env
ENV_EXAMPLE := $(ROOT_DIR)/.env.example

PROD_COMPOSE := $(DEPLOY_DIR)/docker-compose.prod.yml
DEV_COMPOSE  := $(ROOT_DIR)/docker-compose.yml
DOCKER_DEV := docker compose -f $(DEV_COMPOSE)

.DEFAULT_GOAL := help

# ─── Initial Setup ────────────────────────────────────────────────────────────

.PHONY: init
init: ## First-time setup: deps + .env + docker + migrate + seed
	@echo ""
	@echo "╔════════════════════════════════════════════╗"
	@echo "║  MatchUp — Initial Project Setup           ║"
	@echo "╚════════════════════════════════════════════╝"
	@echo ""
	@$(MAKE) --no-print-directory _check-prereqs
	@$(MAKE) --no-print-directory _init-env
	@$(MAKE) --no-print-directory _init-deps
	@$(MAKE) --no-print-directory _init-docker
	@$(MAKE) --no-print-directory _init-db
	@echo ""
	@echo "╔════════════════════════════════════════════╗"
	@echo "║  ✓ Setup complete!                         ║"
	@echo "╚════════════════════════════════════════════╝"
	@echo ""
	@echo "Next steps:"
	@echo "  make dev          # Start full dev stack (docker)"
	@echo "  make dev-local    # Start api + web locally (host)"
	@echo "  make db-studio    # Open Prisma Studio"
	@echo "  make help         # See all available targets"
	@echo ""

.PHONY: _check-prereqs
_check-prereqs:
	@echo "▸ Checking prerequisites..."
	@command -v docker >/dev/null 2>&1 || { echo "  ✗ docker not found. Install: https://docs.docker.com/get-docker/"; exit 1; }
	@docker compose version >/dev/null 2>&1 || { echo "  ✗ docker compose v2 not found."; exit 1; }
	@command -v pnpm >/dev/null 2>&1 || { echo "  ✗ pnpm not found. Install: npm install -g pnpm"; exit 1; }
	@command -v node >/dev/null 2>&1 || { echo "  ✗ node not found. Install Node 20+: https://nodejs.org/"; exit 1; }
	@node_major=$$(node -v | sed 's/v\([0-9]*\).*/\1/'); \
	if [ "$$node_major" -lt 20 ]; then echo "  ✗ Node 20+ required (found $$(node -v))"; exit 1; fi
	@echo "  ✓ docker, docker compose, pnpm, node 20+"

.PHONY: _init-env
_init-env:
	@echo ""
	@echo "▸ Setting up .env..."
	@if [ ! -f "$(ENV_FILE)" ]; then \
		if [ -f "$(ENV_EXAMPLE)" ]; then \
			cp "$(ENV_EXAMPLE)" "$(ENV_FILE)"; \
			echo "  ✓ Created .env from .env.example"; \
		else \
			echo "  ✗ .env.example not found"; exit 1; \
		fi; \
	else \
		echo "  ✓ .env already exists"; \
	fi
	@if ! grep -q "^VAPID_PUBLIC_KEY=..*" "$(ENV_FILE)" 2>/dev/null; then \
		echo "  ▸ Generating VAPID keys..."; \
		cd $(API_DIR) && node -e "\
			const wp = require('web-push'); \
			const k = wp.generateVAPIDKeys(); \
			console.log('VAPID_PUBLIC_KEY=' + k.publicKey); \
			console.log('VAPID_PRIVATE_KEY=' + k.privateKey); \
			console.log('VAPID_SUBJECT=mailto:admin@matchup.kr'); \
		" >> "$(ENV_FILE)" 2>/dev/null && echo "  ✓ VAPID keys appended to .env" \
		|| echo "  ⚠ web-push not installed yet — VAPID keys will be generated after install"; \
	else \
		echo "  ✓ VAPID keys already set"; \
	fi

.PHONY: _init-deps
_init-deps:
	@echo ""
	@echo "▸ Installing dependencies..."
	@pnpm install --frozen-lockfile 2>&1 | tail -5 || pnpm install 2>&1 | tail -5
	@echo "  ✓ Dependencies installed"
	@if ! grep -q "^VAPID_PUBLIC_KEY=..*" "$(ENV_FILE)" 2>/dev/null; then \
		echo "  ▸ Generating VAPID keys (retry after install)..."; \
		cd $(API_DIR) && node -e "\
			const wp = require('web-push'); \
			const k = wp.generateVAPIDKeys(); \
			console.log('VAPID_PUBLIC_KEY=' + k.publicKey); \
			console.log('VAPID_PRIVATE_KEY=' + k.privateKey); \
			console.log('VAPID_SUBJECT=mailto:admin@matchup.kr'); \
		" >> "$(ENV_FILE)" && echo "  ✓ VAPID keys appended to .env"; \
	fi

.PHONY: _init-docker
_init-docker:
	@echo ""
	@echo "▸ Starting Docker infrastructure (postgres + redis)..."
	@$(DOCKER_DEV) up -d postgres redis
	@echo "  ▸ Waiting for postgres health..."
	@for i in 1 2 3 4 5 6 7 8 9 10 11 12; do \
		if $(DOCKER_DEV) exec -T postgres pg_isready -U matchup_user >/dev/null 2>&1; then \
			echo "  ✓ postgres is ready"; break; \
		fi; \
		if [ "$$i" = "12" ]; then echo "  ✗ postgres failed to start"; exit 1; fi; \
		sleep 2; \
	done
	@for i in 1 2 3 4 5; do \
		if $(DOCKER_DEV) exec -T redis redis-cli ping >/dev/null 2>&1; then \
			echo "  ✓ redis is ready"; break; \
		fi; \
		if [ "$$i" = "5" ]; then echo "  ✗ redis failed to start"; exit 1; fi; \
		sleep 1; \
	done

.PHONY: _init-db
_init-db:
	@echo ""
	@echo "▸ Initializing database..."
	@cd $(API_DIR) && pnpm prisma generate >/dev/null 2>&1 && echo "  ✓ Prisma client generated"
	@cd $(API_DIR) && pnpm prisma migrate deploy 2>&1 | grep -E "(Applying|migration|already|No pending)" | sed 's/^/    /' || true
	@echo "  ✓ Migrations applied"
	@cd $(API_DIR) && pnpm prisma db seed 2>&1 | tail -10 | sed 's/^/    /' || true
	@echo "  ✓ Seed data inserted"

.PHONY: dev-local
dev-local: ## Start api + web locally on host (assumes infra is up)
	@if ! $(DOCKER_DEV) ps --services --filter "status=running" | grep -q postgres; then \
		echo "Starting docker infrastructure first..."; \
		$(DOCKER_DEV) up -d postgres redis; \
		sleep 3; \
	fi
	@pnpm dev

# ─── Development ──────────────────────────────────────────────────────────────

.PHONY: dev
dev: ## Start full dev environment in Docker Compose (attached logs)
	@$(DOCKER_DEV) up --build

.PHONY: dev-docker
dev-docker: up ## Alias for detached Docker dev startup

.PHONY: up
up: ## Start full dev environment in Docker Compose (detached)
	@echo "Starting full Docker development stack..."
	@$(DOCKER_DEV) up -d --build
	@echo "Waiting for postgres to be ready..."
	@$(DOCKER_DEV) exec -T postgres sh -c \
		'until pg_isready -U matchup_user; do sleep 1; done' 2>/dev/null || true
	@echo "Docker development stack is up."

.PHONY: dev-api
dev-api: ## Start API container only (with Docker dependencies)
	@$(DOCKER_DEV) up --build api

.PHONY: dev-web
dev-web: ## Start Web container only (with Docker dependencies)
	@$(DOCKER_DEV) up --build web

.PHONY: dev-stop
dev-stop: stop ## Alias for stop

.PHONY: stop
stop: ## Stop dev containers without removing them
	@echo "Stopping Docker development containers..."
	@$(DOCKER_DEV) stop

.PHONY: down
down: ## Stop and remove Docker development containers
	@echo "Removing Docker development containers..."
	@$(DOCKER_DEV) down

# ─── Database ─────────────────────────────────────────────────────────────────

.PHONY: db-migrate
db-migrate: ## Run prisma migrate dev inside the api container
	@$(DOCKER_DEV) run --rm api pnpm --filter api db:migrate

.PHONY: db-push
db-push: ## Run prisma db push inside the api container
	@$(DOCKER_DEV) run --rm api pnpm --filter api db:push

.PHONY: db-seed
db-seed: ## Insert seed data inside the api container
	@$(DOCKER_DEV) run --rm api sh -c "pnpm --filter api db:generate && pnpm --filter api db:seed"

.PHONY: db-studio
db-studio: ## Open Prisma Studio
	@$(DOCKER_DEV) run --rm -p 5555:5555 api \
		pnpm --filter api exec prisma studio --browser none --hostname 0.0.0.0 --port 5555

.PHONY: db-reset
db-reset: ## DESTRUCTIVE: reset DB, re-migrate, re-seed
	@echo "WARNING: This will wipe the dev database!"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	@$(DOCKER_DEV) run --rm api pnpm --filter api exec prisma migrate reset --force
	@$(MAKE) db-seed

# ─── Testing ──────────────────────────────────────────────────────────────────

.PHONY: test
test: ## Run all tests (backend + frontend)
	@pnpm --filter api test
	@pnpm --filter web test

.PHONY: test-api
test-api: ## Backend unit tests only
	@pnpm --filter api test

.PHONY: test-web
test-web: ## Frontend tests only (Vitest)
	@pnpm --filter web test

.PHONY: test-e2e
test-e2e: ## Playwright E2E tests
	@npx playwright test

.PHONY: test-load
test-load: ## k6 load test (requires k6 installed)
	@if ! command -v k6 &> /dev/null; then \
		echo "k6 is not installed."; \
		echo "Install: brew install k6  (macOS)"; \
		echo "         https://k6.io/docs/getting-started/installation/"; \
		exit 1; \
	fi
	@k6 run $(ROOT_DIR)/scripts/load-test.js

# ─── Build & Lint ─────────────────────────────────────────────────────────────

.PHONY: build
build: ## Build all packages (turbo)
	@pnpm build

.PHONY: lint
lint: ## Lint all packages
	@pnpm lint

.PHONY: typecheck
typecheck: ## TypeScript type check (api + web)
	@echo "Type-checking api..."
	@cd $(API_DIR) && npx tsc --noEmit
	@echo "Type-checking web..."
	@cd $(ROOT_DIR)/apps/web && npx tsc --noEmit
	@echo "All type checks passed."

.PHONY: clean
clean: ## Clean all build artifacts
	@pnpm clean
	@find $(ROOT_DIR) -name ".next" -type d -prune -exec rm -rf {} + 2>/dev/null || true
	@find $(ROOT_DIR) -name "dist" -type d -not -path "*/node_modules/*" -prune -exec rm -rf {} + 2>/dev/null || true
	@echo "Clean complete."

# ─── Deploy ───────────────────────────────────────────────────────────────────

.PHONY: deploy-build
deploy-build: ## Build production Docker images
	@echo "Building matchup-api image..."
	@docker build -f $(DEPLOY_DIR)/Dockerfile.api -t matchup-api:latest $(ROOT_DIR)
	@echo "Building matchup-web image..."
	@docker build -f $(DEPLOY_DIR)/Dockerfile.web -t matchup-web:latest $(ROOT_DIR)
	@echo "Images built successfully."

.PHONY: deploy-up
deploy-up: ## Start production containers
	@docker compose -f $(PROD_COMPOSE) --env-file $(DEPLOY_DIR)/.env up -d

.PHONY: deploy-down
deploy-down: ## Stop production containers
	@docker compose -f $(PROD_COMPOSE) --env-file $(DEPLOY_DIR)/.env down

.PHONY: deploy-logs
deploy-logs: ## Tail production logs
	@docker compose -f $(PROD_COMPOSE) logs -f

# ─── Utilities ────────────────────────────────────────────────────────────────

.PHONY: vapid-keys
vapid-keys: ## Generate new VAPID keys for Web Push
	@node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); \
		console.log('VAPID_PUBLIC_KEY=' + k.publicKey); \
		console.log('VAPID_PRIVATE_KEY=' + k.privateKey);"

.PHONY: help
help: ## Show this help
	@echo ""
	@echo "MatchUp — Available make targets"
	@echo "================================================"
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@echo ""

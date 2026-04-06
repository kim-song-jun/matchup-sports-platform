# MatchUp — Makefile
# Monorepo: pnpm workspaces + Turborepo
# Backend: NestJS (apps/api, port 8100) | Frontend: Next.js (apps/web, port 3003)
# DB: PostgreSQL (port 5433) | Cache: Redis (port 6380)

SHELL := /bin/bash
ROOT_DIR := $(shell pwd)
API_DIR  := $(ROOT_DIR)/apps/api
DEPLOY_DIR := $(ROOT_DIR)/deploy

PROD_COMPOSE := $(DEPLOY_DIR)/docker-compose.prod.yml
DEV_COMPOSE  := $(ROOT_DIR)/docker-compose.yml

.DEFAULT_GOAL := help

# ─── Development ──────────────────────────────────────────────────────────────

.PHONY: dev
dev: ## Start full dev environment (docker infra + api + web)
	@$(MAKE) dev-docker
	@pnpm dev

.PHONY: dev-docker
dev-docker: ## Start PostgreSQL + Redis only
	@echo "Starting infrastructure services..."
	@docker compose -f $(DEV_COMPOSE) up -d
	@echo "Waiting for postgres to be ready..."
	@docker compose -f $(DEV_COMPOSE) exec -T postgres sh -c \
		'until pg_isready -U matchup_user; do sleep 1; done' 2>/dev/null || true
	@echo "Infrastructure is up."

.PHONY: dev-api
dev-api: ## Start NestJS dev server only
	@pnpm --filter api dev

.PHONY: dev-web
dev-web: ## Start Next.js dev server only
	@pnpm --filter web dev

.PHONY: dev-stop
dev-stop: ## Stop all dev services (docker infra)
	@echo "Stopping infrastructure services..."
	@docker compose -f $(DEV_COMPOSE) down

# ─── Database ─────────────────────────────────────────────────────────────────

.PHONY: db-migrate
db-migrate: ## Run prisma migrate deploy
	@cd $(API_DIR) && pnpm prisma migrate deploy

.PHONY: db-push
db-push: ## Run prisma db push (dev shortcut)
	@cd $(API_DIR) && pnpm prisma db push

.PHONY: db-seed
db-seed: ## Insert seed data
	@cd $(API_DIR) && pnpm db:seed

.PHONY: db-studio
db-studio: ## Open Prisma Studio
	@cd $(API_DIR) && pnpm prisma studio

.PHONY: db-reset
db-reset: ## DESTRUCTIVE: reset DB, re-migrate, re-seed
	@echo "WARNING: This will wipe the dev database!"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	@cd $(API_DIR) && pnpm prisma migrate reset --force
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

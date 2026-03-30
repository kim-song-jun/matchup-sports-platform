SHELL := /bin/bash

.PHONY: clean-cache start

clean-cache:
	rm -rf .turbo apps/web/.next apps/web/out apps/api/dist

start: clean-cache
	@echo "Starting web on http://localhost:3003"
	@echo "Starting api on http://localhost:8111"
	@trap 'kill 0' INT TERM EXIT; \
		pnpm --filter api dev & \
		pnpm --filter web dev & \
		wait

---
'v1_api': patch
'v1_web': patch
---

Stop the deploy pipelines from destroying the Docker build cache they were designed to use, and split the production build out of the manual approval gate.

The Dockerfiles already copy the lockfile before `pnpm install` and mount the pnpm store and Next cache as BuildKit cache mounts, but production built with `--no-cache` while alpha ran `docker builder prune -af` immediately before building — so neither reused anything. Production images are now tagged with the release commit SHA and only promoted to `:latest` after approval, which makes a rollback a re-tag instead of a full rebuild. CI splits into Gates/API/Web so the three run in parallel, and the Next.js `actions/cache` step is gone because it stored 95KB per commit and cached nothing.

---
'v1_api': patch
'v1_web': patch
---

Move every GitHub Action off the deprecated Node 20 runtime. Each of the four jobs in the production pipeline was emitting a "Node.js 20 is deprecated … being forced to run on Node.js 24" warning, which is harmless while the runners keep providing the shim and becomes a hard failure the day they stop. The pins now sit on the lowest major of each action that ships a `node24` runtime — `actions/checkout@v5`, `actions/setup-node@v5`, `pnpm/action-setup@v5`, `aws-actions/configure-aws-credentials@v6`, and `docker/build-push-action@v7` — rather than the newest release, so the change carries no behavior beyond the runtime bump. `configure-aws-credentials` needed v6 specifically: v5 is still Node 20.

Actions already on `node24` (`amazon-ecr-login@v2`, `setup-buildx-action@v4.2.0`, `changesets/action@v1.8.0`) are untouched, and each file keeps its existing pin style — SHA-pinned entries got new SHAs verified by reading `action.yml` at that exact commit, and tag-pinned entries stayed tags.

The two actions that CI cannot exercise on a pull request — `configure-aws-credentials` and `build-push-action`, which only run in `build-images` and the deploy jobs — are also used by `deploy-alpha.yml`, so merging to `dev` puts them through a real alpha deploy before they ever run against production.

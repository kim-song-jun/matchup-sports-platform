# VAPID Key Setup — Web Push Notifications

## Purpose

This document covers VAPID key generation, loading, rotation, and rollback for the Teameet web-push notification system.

- Backend: `apps/api/src/notifications/web-push.service.ts` (`WebPushService`)
- Config: `apps/api/src/config/configuration.ts` (`vapid.*`)
- Public key endpoint: `GET /api/v1/notifications/vapid-public-key`
- Push subscription endpoint: `POST /api/v1/notifications/push-subscribe`

All three env vars (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) must be set for push to be active. Missing any one causes graceful disable (`WebPushService.enabled = false`) — the rest of the API continues to function normally.

---

## Key Generation

Run once per environment. Store output securely — the private key cannot be recovered after loss.

```bash
node -e "const wp=require('web-push');console.log(JSON.stringify(wp.generateVAPIDKeys(), null, 2))"
```

Example output (base64url encoded):

```json
{
  "publicKey":  "BExamplePublicKeyBase64Url...",
  "privateKey": "ExamplePrivateKeyBase64Url..."
}
```

`VAPID_SUBJECT` must be a `mailto:` or `https:` URI that identifies the application operator.

---

## Local Dev

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Run the generation command above and paste values into `.env`:
   ```
   VAPID_PUBLIC_KEY=<publicKey>
   VAPID_PRIVATE_KEY=<privateKey>
   VAPID_SUBJECT=mailto:admin@teameet.kr
   ```
3. Start the dev server:
   ```bash
   pnpm dev
   ```
4. Confirm in NestJS logs:
   ```
   [WebPushService] Web Push (VAPID) initialized
   ```
   If keys are absent the log will show:
   ```
   [WebPushService] VAPID keys missing — Web Push notifications disabled
   ```

---

## Staging / Production

### EC2 via `.env.production`

The deploy workflow writes environment variables to `/home/ubuntu/app/.env.production` on the EC2 host before starting the containers. `deploy/docker-compose.prod.yml` injects vars via the `environment:` block (explicit passthrough from host env). VAPID vars must be added to that block if not already present.

Added in Task 74 — `deploy/docker-compose.prod.yml` api.environment (lines 62-64) now includes:

```yaml
# deploy/docker-compose.prod.yml — api.environment section (Task 74)
VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY:-}
VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY:-}
VAPID_SUBJECT: ${VAPID_SUBJECT:-}
```

No further action needed for `docker-compose.prod.yml`.

### GitHub Actions Secrets

Add the following repository secrets in GitHub Settings > Secrets and variables > Actions:

| Secret name       | Value                       |
|-------------------|-----------------------------|
| `VAPID_PUBLIC_KEY`  | Output from key generation  |
| `VAPID_PRIVATE_KEY` | Output from key generation  |
| `VAPID_SUBJECT`     | `mailto:admin@teameet.kr`   |

The deploy workflow must export these as environment variables before invoking `docker compose`. Secrets are automatically masked in CI logs — never `echo` them manually.

---

## Key Rotation

Recommended interval: **6 months**, or immediately after suspected compromise.

Steps:
1. Generate a new key pair (see Key Generation above).
2. Update GitHub Actions secrets.
3. Update `/home/ubuntu/app/.env.production` on EC2.
4. Redeploy containers: existing subscribers will receive a 410 Gone on next push attempt, which `WebPushService.sendToUser()` handles by pruning expired subscriptions automatically.
5. Notify users in-app to re-enable push notifications, as their browsers will reject pushes signed with the old key.

> Immediate rotation invalidates all active subscriptions. Plan a user communication campaign before rotating.

---

## Rollback

To disable Web Push without a deployment:

1. Remove or blank the three VAPID vars from the running environment source (`.env.production` on EC2 or GHA secrets).
2. Restart the API container: `docker compose -f deploy/docker-compose.prod.yml restart api`.
3. `WebPushService.enabled` becomes `false` — `sendToUser()` is a no-op, push-subscribe upsert continues to work (subscriptions are stored but not used for delivery), and `GET /notifications/vapid-public-key` returns `{ publicKey: null }`.

---

## Verification

```bash
# Replace <HOST> with your domain or localhost:8100
curl https://<HOST>/api/v1/notifications/vapid-public-key
# Expected: { "status": "success", "data": { "publicKey": "B..." }, "timestamp": "..." }
```

If VAPID is disabled the response is:
```json
{ "status": "success", "data": { "publicKey": null }, "timestamp": "..." }
```

---

## Production Container Health Check

After deploying with VAPID vars set, verify Web Push is active:

```bash
# 1. Confirm NestJS log shows initialization (not "disabled")
docker compose -f deploy/docker-compose.prod.yml logs api | grep "Web Push (VAPID)"
# Expected: [WebPushService] Web Push (VAPID) initialized
# If missing: [WebPushService] VAPID keys missing — Web Push notifications disabled

# 2. Confirm public key endpoint returns a non-null key
curl -s https://api.teameet.kr/api/v1/notifications/vapid-public-key
# Expected: { "status": "success", "data": { "publicKey": "B..." }, "timestamp": "..." }
# If VAPID disabled: { "status": "success", "data": { "publicKey": null }, "timestamp": "..." }
```

---

## Ops Alert Webhook Setup

`WebPushAlertService` sends a Slack (or any HTTP webhook-compatible) notification when the 5-minute rolling push failure count exceeds threshold (10 failures OR 5% failure rate). If the env var is absent the service falls back to logger-only mode — no exception is raised.

### Key generation / provisioning

No generation step required. The URL is issued directly by your Slack workspace (or equivalent service):

1. Create an incoming webhook integration in your Slack workspace.
2. Copy the generated URL (`https://hooks.slack.com/services/...`).

### Local dev

Add to `deploy/.env` (dev):

```
OPS_ALERT_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../...
DISABLE_OPS_ALERT_CRON=true
```

`DISABLE_OPS_ALERT_CRON=true` prevents the cron from firing during local development and CI (same pattern as `DISABLE_MARKETPLACE_CRON`).

### Staging / Production — GitHub Actions secret

Add the following repository secret in GitHub Settings > Secrets and variables > Actions:

| Secret name              | Value                                        |
|--------------------------|----------------------------------------------|
| `OPS_ALERT_WEBHOOK_URL`  | Full Slack webhook URL                       |

`DISABLE_OPS_ALERT_CRON` is a boolean toggle, not a secret. Leave it **unset** in production (empty = cron active). For staging, set it in `deploy/.env` on the staging host if you want cron disabled.

The deploy workflow (`.github/workflows/deploy.yml`) encodes `OPS_ALERT_WEBHOOK_URL` as base64, passes it over SSH, and calls `sync_env_from_github_secret "OPS_ALERT_WEBHOOK_URL"` — identical pattern to `VAPID_*` injection.

`deploy/docker-compose.prod.yml` passes through both vars in the `api.environment` block:

```yaml
OPS_ALERT_WEBHOOK_URL: ${OPS_ALERT_WEBHOOK_URL:-}
DISABLE_OPS_ALERT_CRON: ${DISABLE_OPS_ALERT_CRON:-}
```

### Staging vs Production separation (Warning I3)

Using a single webhook URL for both staging and production makes it impossible to distinguish the environment in alert messages. Recommended separation:

- Create two Slack channels: `#teameet-ops-staging` and `#teameet-ops-prod`.
- Register two separate webhook URLs and store them in environment-specific secret stores.
- Production: set `OPS_ALERT_WEBHOOK_URL` in GitHub Actions secret (injected by CI pipeline).
- Staging: set `OPS_ALERT_WEBHOOK_URL` directly in `deploy/.env` on the staging host (logger-only is acceptable as a fallback if not configured).

### Rotation

Replace the webhook URL in the GitHub Actions secret and update `deploy/.env` on the EC2 host. No container restart is needed — `WebPushAlertService` reads the env var at module initialization, so a rolling restart via `docker compose -f deploy/docker-compose.prod.yml restart api` is sufficient.

### Rollback / Disable

Remove or blank `OPS_ALERT_WEBHOOK_URL` from `deploy/.env` and restart the API container. `WebPushAlertService` will log failures at `Logger.warn` level only — no external HTTP calls.

---

## Security Checklist

- `.env` is in `.gitignore` (verified: line 39 `.env`, line 40 `.env.local`, line 41 `.env.*.local`).
- `.env.production` is never committed — it is written on the EC2 host by the deploy pipeline only.
- `VAPID_PRIVATE_KEY` must never appear in logs. `WebPushService` does not log key values.
- The frontend obtains the public key dynamically via `GET /notifications/vapid-public-key` and never embeds it at build time. No VAPID values are included in Next.js bundles, APK, or IPA.
- GitHub Actions secrets are masked automatically; do not `echo $VAPID_PRIVATE_KEY` in workflow steps.
- `web-push` npm package version should be audited on each dependency update cycle (`pnpm audit`).
- `deploy/.env` on the EC2 host contains `VAPID_PRIVATE_KEY` and other secrets. The EC2 default umask (022) can leave the file world-readable (0644). **Operators must run `chmod 600 ~/teameet/deploy/.env` on the EC2 host** after initial provisioning and after any manual file replacement. The CI workflow (`.github/workflows/deploy.yml`) does not currently set this permission automatically — `chmod 600 deploy/.env` should be added after the last `sync_env_from_github_secret` call (line ~207) when the workflow file is next edited by the authorized owner.

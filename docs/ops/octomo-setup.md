# Octomo API Key Setup — Phone (MO) Verification

## Purpose

This document covers provisioning, value flow, local/CI dev mode, and rollback for the Octomo MO(Mobile Originated) phone verification integration used by alpha's `PhoneVerificationService`.

- Backend: `apps/v1_api/src/verification/octomo.client.ts` (`OctomoClient`), `apps/v1_api/src/verification/phone-verification.service.ts` (`PhoneVerificationService`)
- Octomo API: Base `https://api.octoverse.kr`, paths `/octomo/v1/public/message/{exists,qr-code}`, header `Authorization: Octomo <OCTOMO_API_KEY>`
- Design reference: `docs/superpowers/specs/2026-07-23-octomo-phone-verification-design.md`

`OCTOMO_API_KEY` gates the entire feature: `PhoneVerificationService.enabled` is true only when `OCTOMO_API_KEY` is set **or** `V1_VERIFICATION_DEV_ECHO === 'true'`. When disabled, existing sign-up flows (email, Kakao) continue to work unchanged — this integration never blocks sign-up in environments where it isn't configured.

---

## Key Issuance

Octomo API keys are issued from the Octomo 마이페이지 (my-page) after account registration with the Octomo service. There is no local generation step — request/copy the key from the vendor's dashboard for the project's registered account.

Store the key securely (password manager or the GitHub repository secret store below). The key cannot be recovered from Teameet-side systems after loss; re-issue from the Octomo 마이페이지 if lost.

---

## Value Flow

```
Octomo 마이페이지 (key issuance)
        │
        ▼
GitHub repo secret: OCTOMO_API_KEY
        │  (Settings → Secrets and variables → Actions)
        ▼
.github/workflows/deploy-alpha.yml
   ├─ job env:           OCTOMO_API_KEY: ${{ secrets.OCTOMO_API_KEY }}
   └─ SSM inline env:    OCTOMO_API_KEY='${OCTOMO_API_KEY}'  (passed to `env ... bash deploy-alpha.sh` on the EC2 host)
        │
        ▼
deploy/docker-compose.prod.yml — v1_api.environment
   OCTOMO_API_KEY: ${OCTOMO_API_KEY:-}
   OCTOMO_DEST_NUMBER: ${OCTOMO_DEST_NUMBER:-16663538}
        │
        ▼
v1_api container process.env → OctomoClient
```

Same pattern as `KAKAO_CLIENT_ID`/`KAKAO_CLIENT_SECRET`/`KAKAO_REDIRECT_URI` in the same files — `OCTOMO_API_KEY` is added directly next to the Kakao entries in each of the four locations above, no separate mechanism.

### GitHub Repo Secret Registration

1. Go to the repository on GitHub → **Settings → Secrets and variables → Actions**.
2. Click **New repository secret**.
3. Name: `OCTOMO_API_KEY`. Value: the key from the Octomo 마이페이지.
4. Save. The secret is automatically masked in Actions logs — never `echo` it manually in workflow steps.
5. No corresponding `OCTOMO_DEST_NUMBER` secret is required — it defaults to `16663538` (Octomo's representative inbound number) in `docker-compose.prod.yml`. Only add an `OCTOMO_DEST_NUMBER` secret and wire it through `deploy-alpha.yml` if Octomo issues a different representative number for this account.

There is nothing to write into `deploy/.env` on the EC2 host — `OCTOMO_API_KEY` arrives purely through the SSM Run Command environment on every `dev` push deploy, the same as Kakao's redirect URI. `deploy/.env.prod.example` documents the variable for local/manual reference only.

---

## Local Dev / CI — Dev Echo Mode

Octomo has no sandbox/test API, so local development and CI never call the real vendor endpoint. Instead, set:

```bash
V1_VERIFICATION_DEV_ECHO=true
```

With `OCTOMO_API_KEY` unset and `V1_VERIFICATION_DEV_ECHO=true`, `PhoneVerificationService` is enabled but `OctomoClient` short-circuits `messageExists` to auto-pass (the issued code is echoed back in the API response for the developer/tester to see, and verification succeeds without a real SMS round trip). This keeps the feature testable end-to-end without vendor credentials.

Leaving both `OCTOMO_API_KEY` and `V1_VERIFICATION_DEV_ECHO` unset disables the feature entirely — sign-up behaves exactly as it did before this feature existed.

---

## Rollback

To disable phone verification without a deployment:

1. Remove the `OCTOMO_API_KEY` GitHub repository secret (or blank its value).
2. Trigger a redeploy (next `dev` push, or `workflow_dispatch` on `deploy-alpha.yml`).
3. `v1_api` will boot with `OCTOMO_API_KEY` empty and `V1_VERIFICATION_DEV_ECHO` unset in production → `PhoneVerificationService.enabled` becomes `false`. Sign-up falls back to the pre-existing flow (no hard-block on phone verification); already-verified accounts are unaffected (`phoneVerifiedAt` is preserved).

No data migration or schema change is required for rollback — this only toggles the enforcement gate.

---

## Security Checklist

- `OCTOMO_API_KEY` is a server-only secret. It must never be exposed as `NEXT_PUBLIC_*` or referenced from `apps/v1_web` client code — all Octomo calls happen server-side in `apps/v1_api` via `OctomoClient`.
- `deploy/.env.prod.example` only documents the variable name with a blank placeholder — never commit a real key.
- GitHub Actions masks the secret automatically in logs; do not `echo $OCTOMO_API_KEY` in any workflow step.
- `OCTOMO_DEST_NUMBER` is not sensitive (it's a public inbound number) and is safe to keep as a plain default in `docker-compose.prod.yml`.

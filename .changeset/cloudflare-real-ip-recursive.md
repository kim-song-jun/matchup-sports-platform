---
'v1_api': patch
'v1_web': patch
---

Prepare nginx for a Cloudflare proxy in front of the ALB. The drift guard for the real client address assumed the last X-Forwarded-For entry is always trustworthy, which holds behind the ALB alone but breaks the moment Cloudflare is added — the last entry becomes a Cloudflare edge IP and every visitor collapses into one rate-limit bucket, the exact failure that took down /my and Kakao login on 2026-07-25. Trusting the published Cloudflare ranges and switching to recursive lookup keeps the same result in both states, so this ships safely before any DNS change.

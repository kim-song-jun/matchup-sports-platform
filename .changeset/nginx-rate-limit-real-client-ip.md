---
'v1_web': patch
---

Fix the alpha rate limiter counting every visitor as one client. nginx sat behind the load balancer without `real_ip`, so `limit_req` bucketed all traffic under the balancer's own address and a single person opening `/my` could exhaust the budget for everyone — the resulting 503s surfaced as "로그인 상태를 확인하지 못했어요" even though the session was still valid. Trust the balancer's forwarded address, raise the budgets to match what one screen actually requests, give `GET /auth/me` its own budget so session checks no longer compete with login attempts, and let the auth probe retry transient failures instead of settling on an error the user cannot leave.

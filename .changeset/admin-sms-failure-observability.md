---
"v1_api": minor
"v1_web": minor
---

Add admin observability for SMS and verification failures, mirroring the existing Web Push failure log. A new `V1SmsEventLog` records failure events only (no success events): SMS provider send failures for both selectable providers — Solapi (timeout / network / non-2xx) and Gabia (timeout / token issue / HTTP / app-level `code`), each tagged with the provider and its result code — missing SMS configuration, and verification failures (code mismatch, attempt cap, resend cooldown) from both the pre-account phone flow and the signed-in verification flow. Only the last 4 digits of the target are stored, so raw phone numbers never reach the admin surface. Recording is wrapped in try/catch and can never break the authentication flow it observes. Admin gains a "SMS · 인증 실패" log page with per-row acknowledgement (audit-logged) and a new `GET /admin/ops/summary` KPI endpoint, surfaced on the ops dashboard as "최근 5분" failure cards for both Web Push and SMS — which also connects the previously unused `pushFailuresLast5Minutes` counter to a real consumer.

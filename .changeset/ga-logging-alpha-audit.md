---
"v1_api": patch
"v1_web": patch
---

Fix GA4/structured-logging defects found by live alpha verification and a logic-correctness review: CSP was silently blocking GA's gtag.js script on every page (script-src had no googletagmanager.com allowance) — same fix applied to both alpha and prod nginx configs; the AllExceptionsFilter's manually-built `route` field bypassed the pino req serializer's query-string stripping, leaking PII (e.g. emails in `?email=...`) into structured logs; the pino req serializer stripped headers entirely before redact.paths could run, making the redact config a no-op; 5xx error stacks were logged unbounded; raw free-text search queries were sent to GA4 as an event parameter; and the client-error-reporter's dedupe key ignored severity/stack, letting a low-severity report suppress a differently-caused higher-severity one.

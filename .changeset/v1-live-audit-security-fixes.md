---
"v1_api": patch
"v1_web": patch
---

Fix a Socket.IO handshake regression discovered via live verification on alpha (Next.js's trailing-slash redirect ran before rewrites, 404ing every realtime connection in production) plus 8 confirmed findings from a security/functional adversarial review of PR #95/96/97: an open-redirect bypass in the admin push-send `url` field (backslash trick around the relative-path regex, hardened in both the DTO and `sw-push.js`'s notificationclick handler), the session cookie's `Path` scoped too narrowly to reach `/socket.io` (production cookie-based socket auth always failed), Referer header PII (OAuth code/state) missing from pino redaction, unscrubbed query-string PII in the client error reporter's `context.path`, sockets not force-disconnected when an account is suspended/blocked/deleted, silent swallowing of non-"already deleted" errors when cleaning up expired push subscriptions, a GA `search` event doc/implementation mismatch, and a defensive fix so the socket auth payload re-reads the latest session on every reconnect instead of caching the first one.

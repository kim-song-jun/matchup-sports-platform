---
"v1_api": patch
"v1_web": patch
---

Fix 18 confirmed cross-PR integration gaps found by a whole-session review of the observability/realtime/web-push work (PR #81-93): chat messages now trigger web push, sockets disconnect on logout (closing a cross-user data-leak path), the realtime gateway no longer risks a process crash on a transient DB error during handshake, web-push send failures are now logged instead of silently swallowed, duplicate push+socket notifications are suppressed when the app is focused, and several smaller consistency/coverage gaps (missing GA event, dead `chat:join` emit, admin nav item, deploy docs, test-quality fixes).

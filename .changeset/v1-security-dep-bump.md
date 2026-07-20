---
"v1_api": patch
"v1_web": patch
---

Patch axios (ReDoS, prototype pollution, credential/header leaks via redirects and proxy handling), Next.js (middleware/proxy bypass, SSRF via WebSocket upgrade, connection-exhaustion DoS), and ws (memory-exhaustion DoS via socket.io) to their fixed versions.

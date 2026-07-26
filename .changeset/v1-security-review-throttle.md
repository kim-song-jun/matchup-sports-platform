---
"v1_api": patch
---

Add per-route rate limiting to review endpoints (`GET /reviews`, `GET /reviews/received`, `GET /reviews/sources/:sourceType/:sourceId`, `POST /reviews`) to bound repeated DB recomputation and mutation load, matching the tighter throttle pattern already used on other expensive-compute endpoints.
